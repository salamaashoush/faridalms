import type { Cell } from "@faridalms/database/context";
import type { Directory } from "@faridalms/database/directory/client";
import type { ClaimedStatement } from "@faridalms/database/stores/xapi";

import {
  claimStatements,
  purgeSentStatements,
  recordStoreOf,
  settleStatements,
} from "@faridalms/database/stores/xapi";
import { retryDelayMs } from "@faridalms/domain/notifications";
import { SENT_STATEMENT_DAYS, XAPI_VERSION } from "@faridalms/domain/xapi";

import type { Resolve } from "../files/fetch-link";

import { LinkError, publicTarget } from "../files/fetch-link";
import { everyTenant } from "../files/upkeep";
import { recordStoreSecrets } from "./statements";

/** How many statements one pass takes for a tenant, and how long it holds them. */
const BATCH = 50;
const LEASE_SECONDS = 120;
const TIMEOUT_MS = 20_000;

const asWorker = (tenantId: string) => ({
  tenantId,
  requestId: crypto.randomUUID(),
  actor: { kind: "system" as const },
});

/** Where a school's store is and how to sign in to it, or why it cannot be reached. */
type Destination =
  | { endpoint: string; authorization: string }
  | { off: string };

type Outcome =
  | { kind: "sent" }
  | { kind: "retry"; error: string }
  | { kind: "failed"; error: string };

const statusError = (response: Response) => `HTTP ${response.status}`;

/**
 * What a store answers a batch it will not take for something in it: a
 * statement it refuses, or one it has under the same id, as xAPI has it
 * refuse the whole batch.
 */
const BATCH_REFUSED = new Set([400, 409, 413, 422]);

/** What an answer from the store means for the statements it was about. */
function outcomeOf(response: Response): Outcome {
  if (response.ok) return { kind: "sent" };
  // A statement the store keeps already under this id is one it has.
  if (response.status === 409) return { kind: "sent" };
  if (
    response.status === 400 ||
    response.status === 413 ||
    response.status === 422
  )
    return { kind: "failed", error: statusError(response) };
  return { kind: "retry", error: statusError(response) };
}

/** A store that could not be asked: worth trying again, or never to be. */
interface Unasked {
  error: string;
  final: boolean;
}

/**
 * Asks the store. The address a school gave is checked as a link the
 * school imports is, before every request, and the request is pinned to
 * the address the check approved, so a store's name that resolves into
 * the server's own network, then or later, is never reached.
 */
async function post(
  destination: { endpoint: string; authorization: string },
  path: string,
  method: "POST" | "PUT",
  body: unknown,
  resolve?: Resolve,
): Promise<Response | Unasked> {
  const target = new URL(`${destination.endpoint}${path}`);
  let address: string;
  try {
    address = await publicTarget(target, resolve);
  } catch (error) {
    if (error instanceof LinkError)
      return {
        error: error.code,
        final: error.code === "media.link_address",
      };
    throw error;
  }
  const pinned = new URL(target);
  pinned.hostname = address.includes(":") ? `[${address}]` : address;
  try {
    return await fetch(pinned, {
      method,
      headers: {
        host: target.host,
        authorization: destination.authorization,
        "content-type": "application/json",
        "x-experience-api-version": XAPI_VERSION,
      },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...(target.protocol === "https:"
        ? { tls: { serverName: target.hostname } }
        : {}),
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.name : "network",
      final: false,
    };
  }
}

/** What a store's answer, or the failure to reach it, means. */
const answered = (answer: Response | Unasked): Outcome =>
  answer instanceof Response
    ? outcomeOf(answer)
    : answer.final
      ? { kind: "failed", error: answer.error }
      : { kind: "retry", error: answer.error };

/**
 * Sends one school's statements: all at once, and, when the store refuses
 * the batch for one of them, each on its own by its id, so one statement
 * the store will not take holds up none of the others.
 */
async function deliver(
  destination: { endpoint: string; authorization: string },
  rows: ClaimedStatement[],
  resolve?: Resolve,
): Promise<Map<string, Outcome>> {
  const outcomes = new Map<string, Outcome>();
  const batch = await post(
    destination,
    "statements",
    "POST",
    rows.map((row) => row.statement),
    resolve,
  );
  if (batch instanceof Response) await batch.body?.cancel();
  if (!(batch instanceof Response) || !BATCH_REFUSED.has(batch.status)) {
    for (const row of rows) outcomes.set(row.id, answered(batch));
    return outcomes;
  }
  for (const row of rows) {
    const each = await post(
      destination,
      `statements?statementId=${encodeURIComponent(row.statementId)}`,
      "PUT",
      row.statement,
      resolve,
    );
    if (each instanceof Response) await each.body?.cancel();
    outcomes.set(row.id, answered(each));
  }
  return outcomes;
}

/**
 * Sends what is due for one tenant to each of its schools' record stores.
 * The statements are taken in one transaction and settled in another, so
 * no transaction waits on a store; a sender that stops between the two
 * leaves them to be taken again once their hold runs out.
 */
export async function sendTenantStatements(
  cell: Cell,
  cellSecret: Uint8Array<ArrayBuffer>,
  tenantId: string,
  resolve?: Resolve,
): Promise<number> {
  const secrets = recordStoreSecrets(cellSecret);
  const { rows, destinations } = await cell.withWorker(
    asWorker(tenantId),
    "write",
    async (tx) => {
      const claimed = await claimStatements(tx, {
        tenantId,
        limit: BATCH,
        leaseSeconds: LEASE_SECONDS,
      });
      const found = new Map<string, Destination>();
      for (const orgId of new Set(claimed.map((row) => row.orgId))) {
        const store = await recordStoreOf(tx, { tenantId, orgId });
        if (!store?.enabled || !store.sealedSecret) {
          found.set(orgId, { off: "store_off" });
          continue;
        }
        const secret = await secrets
          .open<string>(store.sealedSecret)
          .catch(() => null);
        found.set(
          orgId,
          secret === null
            ? { off: "secret_unreadable" }
            : {
                endpoint: store.endpoint,
                authorization: `Basic ${Buffer.from(`${store.username}:${secret}`).toString("base64")}`,
              },
        );
      }
      return { rows: claimed, destinations: found };
    },
  );
  if (rows.length === 0) return 0;
  const outcomes = new Map<string, Outcome>();
  for (const [orgId, destination] of destinations) {
    const theirs = rows.filter((row) => row.orgId === orgId);
    if ("off" in destination) {
      for (const row of theirs)
        outcomes.set(row.id, { kind: "failed", error: destination.off });
      continue;
    }
    for (const [id, outcome] of await deliver(destination, theirs, resolve))
      outcomes.set(id, outcome);
  }
  const now = Date.now();
  const sent: string[] = [];
  const retry: { id: string; error: string; dueAt: Date }[] = [];
  const failed: { id: string; error: string }[] = [];
  for (const row of rows) {
    const outcome = outcomes.get(row.id) ?? { kind: "retry", error: "lost" };
    if (outcome.kind === "sent") sent.push(row.id);
    else if (outcome.kind === "failed")
      failed.push({ id: row.id, error: outcome.error });
    else {
      const delay = retryDelayMs(row.attempts);
      if (delay === null) failed.push({ id: row.id, error: outcome.error });
      else
        retry.push({
          id: row.id,
          error: outcome.error,
          dueAt: new Date(now + delay),
        });
    }
  }
  await cell.withWorker(asWorker(tenantId), "write", (tx) =>
    settleStatements(tx, { tenantId, sent, retry, failed }),
  );
  return sent.length;
}

/**
 * Deletes one tenant's statements sent longer ago than the window, so the
 * queue keeps only what is waiting, failed or lately gone.
 */
export async function purgeTenantStatements(
  cell: Cell,
  tenantId: string,
  now: Date,
  limit = 1000,
): Promise<number> {
  return cell.withRetention(asWorker(tenantId), (tx) =>
    purgeSentStatements(tx, {
      tenantId,
      sentBefore: new Date(now.getTime() - SENT_STATEMENT_DAYS * 86_400_000),
      limit,
    }),
  );
}

/**
 * Sends statements to schools' record stores, tenant by tenant, on a
 * timer. Each pass waits for the previous one, and one tenant's failure is
 * logged without stopping the rest. Where the cell can log in as
 * retention, statements sent past their window are purged on the sweep's
 * timer.
 */
export function startStatementSender(input: {
  cell: Cell;
  directory: Directory;
  cellId: string;
  cellSecret: Uint8Array<ArrayBuffer>;
  intervalMs: number;
  purgeMs: number;
}): () => Promise<void> {
  const stopPurge = input.cell.canErase()
    ? everyTenant({
        name: "xapi.purge",
        directory: input.directory,
        cellId: input.cellId,
        intervalMs: input.purgeMs,
        run: async (tenantId) => {
          await purgeTenantStatements(input.cell, tenantId, new Date());
        },
      })
    : null;
  let stopped = false;
  let running: Promise<void> | null = null;
  const pass = async () => {
    const tenants = await input.directory.tenantsOfCell(input.cellId);
    for (const tenantId of tenants) {
      if (stopped) return;
      try {
        await sendTenantStatements(input.cell, input.cellSecret, tenantId);
      } catch (error) {
        console.error(
          JSON.stringify({
            worker: "xapi",
            tenantId,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
    }
  };
  const timer = setInterval(() => {
    if (running || stopped) return;
    running = pass()
      .catch((error: unknown) =>
        console.error(JSON.stringify({ worker: "xapi", error: String(error) })),
      )
      .finally(() => {
        running = null;
      });
  }, input.intervalMs);
  return async () => {
    stopped = true;
    clearInterval(timer);
    await Promise.all([running, stopPurge?.()]);
  };
}
