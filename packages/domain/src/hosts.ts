import * as v from "valibot";

import { RESERVED_SLUGS, SLUG } from "./provisioning";

/** A site host serves a school's public website; a portal host its sign-in and app. */
export const HOST_ROLES = ["site", "portal"] as const;
export type HostRole = (typeof HOST_ROLES)[number];

export const HOST_STATES = [
  "pending",
  "verified",
  "active",
  "failing",
  "removed",
] as const;
export type HostState = (typeof HOST_STATES)[number];

/** The label a school publishes its host's challenge under, as a TXT record. */
export const CHALLENGE_LABEL = "_farida-challenge";

/** Rechecks that find the records gone before a host stops routing. */
export const FAILURES_BEFORE_FAILING = 3;
/** How long a failing host is kept before it is removed. */
export const FAILING_DAYS = 7;
/** How often a host's records are checked again. */
export const RECHECK_MS = 60 * 60 * 1000;

/** The two registrable domains the platform names schools under. */
export interface PlatformDomains {
  /** `<slug>.<portal>` is a school's portal; the bare domain asks for the school. */
  portal: string;
  /** `<slug>.<sites>` is a school's public website. */
  sites: string;
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const IPV4 =
  /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** True for a name made of DNS labels, with at least one dot. */
export function isHostname(name: string): boolean {
  if (name.length < 3 || name.length > 253) return false;
  const labels = name.split(".");
  return (
    labels.length >= 2 &&
    labels.every((label) => LABEL.test(label)) &&
    !/^\d+$/.test(labels.at(-1) ?? "")
  );
}

/** True for an IPv4 address or a bracketed IPv6 one, as a Host header carries them. */
export function isAddress(host: string): boolean {
  return IPV4.test(host) || /^\[[0-9a-f:.]+\]$/.test(host);
}

/**
 * The name a `Host` header asks for: lower-cased, without its port or a
 * trailing dot. Null when it is not a name or an address.
 */
export function hostOf(header: string | null | undefined): string | null {
  const value = (header ?? "").trim().toLowerCase();
  if (!value || value.length > 260) return null;
  const host = value.startsWith("[")
    ? value.slice(0, value.indexOf("]") + 1)
    : (value.split(":")[0] ?? "");
  const name = host.endsWith(".") ? host.slice(0, -1) : host;
  if (isAddress(name) || isHostname(name) || name === "localhost") return name;
  return null;
}

/**
 * What a host is to the platform:
 * - `platform`: a school's platform name, `<slug>.<portal>` or `<slug>.<sites>`;
 * - `bare`: the portal domain itself, or an address (a health check, the test
 *   gate, a process reached directly), where the school is asked for;
 * - `custom`: a name the directory may hold for a school;
 * - `none`: nothing is served there, such as the sites domain itself or a
 *   label the platform keeps for itself.
 */
export type HostPlace =
  | { kind: "platform"; role: HostRole; slug: string }
  | { kind: "bare" }
  | { kind: "custom"; hostname: string }
  | { kind: "none" };

export function placeOf(host: string, domains: PlatformDomains): HostPlace {
  if (isAddress(host) || host === domains.portal) return { kind: "bare" };
  if (host === domains.sites) return { kind: "none" };
  // The sites domain first: in development it sits under the portal domain.
  for (const [role, domain] of [
    ["site", domains.sites],
    ["portal", domains.portal],
  ] as const) {
    if (!host.endsWith(`.${domain}`)) continue;
    const slug = host.slice(0, -domain.length - 1);
    return SLUG.test(slug) && !RESERVED_SLUGS.has(slug)
      ? { kind: "platform", role, slug }
      : { kind: "none" };
  }
  return isHostname(host)
    ? { kind: "custom", hostname: host }
    : { kind: "none" };
}

/**
 * The labels under the platform's domains that the edge serves for the
 * platform itself rather than for a school.
 */
export const EDGE_LABELS = {
  portal: ["www", "ops", "collab", "api"],
  sites: ["files", "play", "media"],
} as const;

/** True for either platform domain itself or one of the edge's own labels. */
export function isEdgeName(host: string, domains: PlatformDomains): boolean {
  if (host === domains.portal || host === domains.sites) return true;
  return (
    EDGE_LABELS.portal.some((label) => host === `${label}.${domains.portal}`) ||
    EDGE_LABELS.sites.some((label) => host === `${label}.${domains.sites}`)
  );
}

/** A school's own name on the platform for a role. */
export function platformName(
  slug: string,
  role: HostRole,
  domains: PlatformDomains,
): string {
  return `${slug}.${role === "site" ? domains.sites : domains.portal}`;
}

/** A name a school may bind as its own: one it can publish DNS records for. */
export const customHostnameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.transform((name) => (name.endsWith(".") ? name.slice(0, -1) : name)),
  v.check(isHostname, "Use a domain name such as www.example.com."),
);

/**
 * Why a school may not bind a name, or null when it may. Names under the
 * platform's own domains are the platform's, whoever asks.
 */
export function customHostProblem(
  hostname: string,
  domains: PlatformDomains,
): "hosts.invalid" | "hosts.platform" | null {
  if (!isHostname(hostname) || hostname.startsWith(`${CHALLENGE_LABEL}.`))
    return "hosts.invalid";
  for (const domain of [domains.portal, domains.sites])
    if (hostname === domain || hostname.endsWith(`.${domain}`))
      return "hosts.platform";
  return null;
}

/** The records a school publishes for a host, as the worker expects them. */
export interface ExpectedRecords {
  txt: { name: string; value: string };
  /** For a subdomain: the platform name of the host's role. */
  cname: { name: string; target: string };
  /**
   * For a domain's apex, where no CNAME is allowed: the platform's address,
   * or null where the deployment has not configured one.
   */
  a: { name: string; address: string | null };
}

export function expectedRecords(
  host: { hostname: string; role: HostRole; challenge: string },
  slug: string,
  domains: PlatformDomains,
  edgeAddress: string | null,
): ExpectedRecords {
  return {
    txt: { name: `${CHALLENGE_LABEL}.${host.hostname}`, value: host.challenge },
    cname: {
      name: host.hostname,
      target: platformName(slug, host.role, domains),
    },
    a: { name: host.hostname, address: edgeAddress },
  };
}

/**
 * What the lookups found. A list is what the name holds, empty when it holds
 * nothing of that type; null means the lookup itself failed (a timeout, a
 * server failure), which proves nothing either way.
 */
export interface DnsFindings {
  txt: string[] | null;
  cname: string[] | null;
  a: string[] | null;
}

export type CheckProblem =
  | "hosts.txt_missing"
  | "hosts.route_missing"
  | "hosts.lookup_failed";

export type CheckOutcome =
  | { kind: "found" }
  | { kind: "missing"; problem: CheckProblem }
  | { kind: "unknown"; problem: "hosts.lookup_failed" };

const bare = (name: string) =>
  (name.endsWith(".") ? name.slice(0, -1) : name).toLowerCase();

/**
 * Compares what DNS holds with what the host needs: the challenge in TXT,
 * and either a CNAME to the platform name or A records that all name the
 * platform's address.
 */
export function compareRecords(
  expected: ExpectedRecords,
  found: DnsFindings,
): CheckOutcome {
  const txt = found.txt?.includes(expected.txt.value) ?? null;
  const cname = found.cname
    ? found.cname.map(bare).includes(expected.cname.target)
    : null;
  const address = expected.a.address;
  const a =
    found.a && address
      ? found.a.length > 0 && found.a.every((value) => value === address)
      : found.a
        ? false
        : null;
  const routed = cname === true || a === true;
  if (txt === true && routed) return { kind: "found" };
  if (txt === false) return { kind: "missing", problem: "hosts.txt_missing" };
  if (cname === false && a === false)
    return { kind: "missing", problem: "hosts.route_missing" };
  return { kind: "unknown", problem: "hosts.lookup_failed" };
}

export interface HostStatus {
  state: HostState;
  failures: number;
  /** When the state last changed. */
  stateChangedAt: Date;
  verifiedAt: Date | null;
  lastError: string | null;
}

/**
 * A host's status after its records were checked. A pending host is verified
 * once they are found. A verified or active host whose records are missing
 * counts a failure, and the third in a row makes it failing, which stops it
 * routing; finding them again makes it verified, and a host failing for
 * seven days is removed. A lookup that failed changes nothing but the error.
 */
export function afterCheck(
  status: HostStatus,
  outcome: CheckOutcome,
  now: Date,
): HostStatus {
  if (status.state === "removed") return status;
  const moved = (
    state: HostState,
  ): Pick<HostStatus, "state" | "stateChangedAt"> =>
    state === status.state
      ? { state, stateChangedAt: status.stateChangedAt }
      : { state, stateChangedAt: now };
  if (outcome.kind === "found") {
    const state =
      status.state === "pending" || status.state === "failing"
        ? "verified"
        : status.state;
    return {
      ...moved(state),
      failures: 0,
      verifiedAt: state === status.state ? status.verifiedAt : now,
      lastError: null,
    };
  }
  const expired =
    status.state === "failing" &&
    now.getTime() - status.stateChangedAt.getTime() >=
      FAILING_DAYS * 86_400_000;
  if (expired)
    return {
      ...status,
      ...moved("removed"),
      lastError: outcome.problem,
    };
  if (outcome.kind === "unknown" || status.state === "pending")
    return { ...status, lastError: outcome.problem };
  if (status.state === "failing")
    return {
      ...status,
      failures: status.failures + 1,
      lastError: outcome.problem,
    };
  const failures = status.failures + 1;
  return {
    ...status,
    ...moved(failures >= FAILURES_BEFORE_FAILING ? "failing" : status.state),
    failures,
    lastError: outcome.problem,
  };
}

/**
 * A verified host becomes active once a request reached it over TLS, which
 * is when the edge has its certificate.
 */
export function afterProbe(
  status: HostStatus,
  servedOverTls: boolean,
  now: Date,
): HostStatus {
  if (status.state !== "verified") return status;
  return servedOverTls
    ? { ...status, state: "active", stateChangedAt: now, lastError: null }
    : { ...status, lastError: "hosts.tls_pending" };
}

/** The hosts the edge may hold a certificate for. */
export const CERTIFIED_STATES: ReadonlySet<HostState> = new Set([
  "verified",
  "active",
]);

export const addHostSchema = v.object({
  hostname: customHostnameSchema,
  role: v.picklist(HOST_ROLES),
});
export type AddHostInput = v.InferInput<typeof addHostSchema>;

export const hostRefSchema = v.object({
  hostname: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.maxLength(253)),
});
