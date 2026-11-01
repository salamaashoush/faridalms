import type {
  Directory,
  DirectorySync,
} from "@faridalms/database/directory/client";
import type {
  ClaimedHost,
  SchoolHost,
} from "@faridalms/database/directory/hosts";
import type { DnsFindings, PlatformDomains } from "@faridalms/domain/hosts";

import {
  afterCheck,
  afterProbe,
  compareRecords,
  expectedRecords,
  RECHECK_MS,
} from "@faridalms/domain/hosts";
import { Resolver } from "node:dns/promises";

/** What DNS holds for a host: its challenge TXT, its CNAME and its A records. */
export type HostLookup = (hostname: string) => Promise<DnsFindings>;
/** Whether the host answers over HTTPS with a certificate the client trusts. */
export type TlsProbe = (hostname: string) => Promise<boolean>;

const EMPTY = new Set(["ENODATA", "ENOTFOUND", "NXDOMAIN"]);

async function records<T>(lookup: () => Promise<T[]>): Promise<T[] | null> {
  try {
    return await lookup();
  } catch (error) {
    const code = (error as { code?: string }).code;
    return code && EMPTY.has(code) ? [] : null;
  }
}

/** Asks the system's resolvers, briefly, so one slow zone holds nothing up. */
export function dnsLookup(): HostLookup {
  const resolver = new Resolver({ timeout: 3000, tries: 2 });
  return async (hostname) => {
    const [txt, cname, a] = await Promise.all([
      records(() => resolver.resolveTxt(`_farida-challenge.${hostname}`)).then(
        (rows) => rows?.map((chunks) => chunks.join("")) ?? null,
      ),
      records(() => resolver.resolveCname(hostname)),
      records(() => resolver.resolve4(hostname)),
    ]);
    return { txt, cname, a };
  };
}

/**
 * A request for the web's health page on the host, through the edge. It
 * succeeds only once the edge holds a certificate for the name, which it
 * fetches on this very handshake when the host is verified.
 */
export function httpsProbe(): TlsProbe {
  return async (hostname) => {
    try {
      const response = await fetch(`https://${hostname}/api/health`, {
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      await response.body?.cancel();
      return response.ok;
    } catch {
      return false;
    }
  };
}

export interface HostChecks {
  /** Checks one of a school's hosts now and returns it as it then stands. */
  check: (schoolId: string, hostname: string) => Promise<SchoolHost | null>;
  /** Checks the hosts that are due, as the hourly pass does. */
  sweep: () => Promise<number>;
  /** Runs the pass every `intervalMs`; returns how to stop it. */
  start: (intervalMs: number) => () => Promise<void>;
}

/**
 * Verifies schools' own hosts: their records against what the platform
 * expects, then, once verified, that the edge serves them over TLS. Hosts
 * are claimed before the lookups and written after, so no transaction stays
 * open across DNS and replicas never check the same host at once.
 */
export function createHostChecks(input: {
  registry: DirectorySync["hosts"];
  directory: Directory;
  domains: PlatformDomains;
  edgeAddress: string | null;
  lookup?: HostLookup;
  probe?: TlsProbe;
  now?: () => Date;
  batch?: number;
}): HostChecks {
  const lookup = input.lookup ?? dnsLookup();
  const probe = input.probe ?? httpsProbe();
  const now = input.now ?? (() => new Date());
  const run = async (host: ClaimedHost) => {
    const expected = expectedRecords(
      host,
      host.slug,
      input.domains,
      input.edgeAddress,
    );
    const outcome = compareRecords(expected, await lookup(host.hostname));
    let written = await input.registry.record({
      hostname: host.hostname,
      decide: (status) => afterCheck(status, outcome, now()),
    });
    if (written?.state === "verified") {
      const served = await probe(host.hostname);
      written = await input.registry.record({
        hostname: host.hostname,
        decide: (status) => afterProbe(status, served, now()),
      });
    }
    input.directory.forgetHost(host.hostname, host.slug);
    return written;
  };
  const sweep = async () => {
    const due = await input.registry.claimDue({
      limit: input.batch ?? 20,
      recheckMs: RECHECK_MS,
    });
    for (const host of due) {
      try {
        await run(host);
      } catch (error) {
        console.error(
          JSON.stringify({
            worker: "host-check",
            hostname: host.hostname,
            error: String(error).slice(0, 200),
          }),
        );
      }
    }
    return due.length;
  };
  return {
    check: async (schoolId, hostname) => {
      const host = await input.registry.claim({ schoolId, hostname });
      if (!host) return null;
      await run(host);
      const hosts = await input.registry.list(schoolId);
      return hosts.find((row) => row.hostname === hostname) ?? null;
    },
    sweep,
    start: (intervalMs) => {
      let running: Promise<void> | null = null;
      let stopped = false;
      const timer = setInterval(() => {
        if (running || stopped) return;
        running = sweep()
          .then(() => undefined)
          .catch((error: unknown) => {
            console.error(
              JSON.stringify({
                worker: "host-check",
                error: String(error).slice(0, 200),
              }),
            );
          })
          .finally(() => {
            running = null;
          });
      }, intervalMs);
      return async () => {
        stopped = true;
        clearInterval(timer);
        await running;
      };
    },
  };
}
