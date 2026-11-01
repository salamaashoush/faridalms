import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql/postgres";

import type { ActorKind } from "./tables/partitioned";
import type { TenantLifecycle } from "./tables/records";

function open(url: string, max: number) {
  return drizzle({
    client: new SQL({ url, max, idleTimeout: 30, connectionTimeout: 10 }),
  });
}

type Pool = ReturnType<typeof open>;
export type CellTransaction = Parameters<Parameters<Pool["transaction"]>[0]>[0];

export interface UnitOfWork {
  readonly tenantId: string;
  readonly requestId: string;
  readonly actor: {
    readonly kind: ActorKind;
    readonly userId?: string;
    readonly accountId?: string;
    readonly sessionId?: string;
  };
}

export type Access = "read" | "write";

/**
 * The tenant is unknown, allows no sign-in, or (for a write) is not active.
 * Callers answer `unknown` exactly like an invalid token, so the response
 * reveals nothing about which tenants exist, and `read_only` with 503.
 */
export class TenantUnavailableError extends Error {
  constructor(readonly reason: "unknown" | "read_only") {
    super(`Tenant unavailable: ${reason}`);
    this.name = "TenantUnavailableError";
  }
}

const SIGN_IN_STATES: ReadonlySet<TenantLifecycle> = new Set([
  "active",
  "frozen",
]);

/**
 * Binds the tenant and reads the database's clock in the same statement. The
 * unit's `now` is the database's, not the process's: what a unit writes as
 * happening now is compared with `statement_timestamp()` in policies and
 * queries, and two clocks a few milliseconds apart would hide it meanwhile.
 */
async function beginUnit(tx: CellTransaction, work: UnitOfWork) {
  const rows = await tx.execute<{
    lifecycle: TenantLifecycle | null;
    now: string | Date;
  }>(
    sql`select app.begin_unit(${work.tenantId}::uuid, ${work.actor.userId ?? null}::uuid, ${work.actor.accountId ?? null}::uuid, ${work.actor.sessionId ?? null}::uuid, ${work.requestId}, ${work.actor.kind}) as lifecycle, transaction_timestamp() as now`,
  );
  const row = rows[0];
  return {
    lifecycle: row?.lifecycle ?? null,
    now: row ? new Date(row.now) : new Date(),
  };
}

/**
 * Names the actor once the session is known, so the audit trigger records who
 * acted. The tenant it binds must be the one the unit of work began with.
 */
export async function bindActor(tx: CellTransaction, work: UnitOfWork) {
  await beginUnit(tx, work);
}

async function unit<T>(
  pool: Pool,
  work: UnitOfWork,
  access: Access,
  run: (
    tx: CellTransaction,
    lifecycle: TenantLifecycle,
    now: Date,
  ) => Promise<T>,
): Promise<T> {
  return pool.transaction(async (tx) => {
    const { lifecycle, now } = await beginUnit(tx, work);
    if (lifecycle === null || !SIGN_IN_STATES.has(lifecycle))
      throw new TenantUnavailableError("unknown");
    if (access === "write" && lifecycle !== "active")
      throw new TenantUnavailableError("read_only");
    return run(tx, lifecycle, now);
  });
}

function need(pool: Pool | undefined, role: string) {
  if (!pool) throw new Error(`No ${role} pool is configured`);
  return pool;
}

export interface CellUrls {
  app: string;
  site?: string;
  integration?: string;
  worker?: string;
  /** The only role that may erase; absent where erasure is not run. */
  retention?: string;
}

/**
 * The cell's connection pools, one per runtime role. Nothing outside this
 * module sees a pool: every query runs inside a unit of work that has bound
 * the tenant to its transaction.
 */
export function openCell(urls: CellUrls, size = 10) {
  const pools = {
    app: open(urls.app, size),
    site: urls.site
      ? open(urls.site, Math.max(2, Math.floor(size / 2)))
      : undefined,
    integration: urls.integration ? open(urls.integration, 4) : undefined,
    worker: urls.worker ? open(urls.worker, 4) : undefined,
    retention: urls.retention ? open(urls.retention, 1) : undefined,
  };
  return {
    withTenant: <T>(
      work: UnitOfWork,
      access: Access,
      run: (
        tx: CellTransaction,
        lifecycle: TenantLifecycle,
        now: Date,
      ) => Promise<T>,
    ) => unit(pools.app, work, access, run),
    withSite: <T>(
      work: UnitOfWork,
      run: (tx: CellTransaction, now: Date) => Promise<T>,
    ) =>
      unit(need(pools.site, "site"), work, "read", (tx, _lifecycle, now) =>
        run(tx, now),
      ),
    withIntegration: <T>(
      work: UnitOfWork,
      access: Access,
      run: (tx: CellTransaction) => Promise<T>,
    ) => unit(need(pools.integration, "integration"), work, access, run),
    withWorker: <T>(
      work: UnitOfWork,
      access: Access,
      run: (tx: CellTransaction, now: Date) => Promise<T>,
    ) =>
      unit(need(pools.worker, "worker"), work, access, (tx, _lifecycle, now) =>
        run(tx, now),
      ),
    /**
     * Creates the monthly and yearly partitions the coming months need.
     * Migrations make them only when they run, so a cell that runs for a
     * long time needs this regularly, or writes past the last partition fail.
     */
    ensurePartitions: async (monthsAhead: number) => {
      const [row] = await need(pools.worker, "worker").execute<{
        made: number;
      }>(sql`select app.ensure_partitions(${monthsAhead}) as made`);
      return row?.made ?? 0;
    },
    /** Whether erasure can run in this deployment. */
    canErase: () => pools.retention !== undefined,
    withRetention: <T>(
      work: UnitOfWork,
      run: (tx: CellTransaction) => Promise<T>,
    ) => unit(need(pools.retention, "retention"), work, "write", run),
    /** Liveness of the app pool, for readiness probes. */
    ping: async () => {
      await pools.app.execute(sql`select 1`);
    },
    close: async () => {
      await Promise.all(
        Object.values(pools)
          .filter((pool): pool is Pool => pool !== undefined)
          .map((pool) => pool.$client.close()),
      );
    },
  };
}

export type Cell = ReturnType<typeof openCell>;

/**
 * The collaboration server's one pool, as the `collab` role: it reads and
 * writes collaborative documents and their checkpoints, and nothing else.
 */
export function openCollab(url: string, size = 4) {
  const pool = open(url, size);
  return {
    withCollab: <T>(
      work: UnitOfWork,
      access: Access,
      run: (tx: CellTransaction) => Promise<T>,
    ) => unit(pool, work, access, run),
    close: () => pool.$client.close(),
  };
}

export type Collab = ReturnType<typeof openCollab>;

/**
 * Operator work as the schema owner: provisioning a tenant, the development
 * seed. The owner is bound by the isolation policy too, so each call still
 * names one tenant.
 */
export function openOwner(url: string) {
  const pool = open(url, 2);
  return {
    asOwner: <T>(
      tenantId: string,
      requestId: string,
      run: (tx: CellTransaction) => Promise<T>,
    ) =>
      pool.transaction(async (tx) => {
        await tx.execute(sql`set local role cell_owner`);
        await tx.execute(
          sql`select app.begin_unit(${tenantId}::uuid, null, null, null, ${requestId}, 'operator')`,
        );
        return run(tx);
      }),
    close: () => pool.$client.close(),
  };
}

export type Purpose = "health" | "demographics" | "custody";

/**
 * Runs `work` with a special-category purpose set, inside a savepoint. When
 * `work` throws, rolling back to the savepoint also clears the purpose, so a
 * caller that catches the error never carries on with it set.
 */
export async function withPurpose<T>(
  tx: CellTransaction,
  purpose: Purpose,
  work: (tx: CellTransaction) => Promise<T>,
): Promise<T> {
  return tx.transaction(async (inner) => {
    await inner.execute(
      sql`select set_config('app.purpose', ${purpose}, true)`,
    );
    const result = await work(inner);
    await inner.execute(sql`select set_config('app.purpose', '', true)`);
    return result;
  });
}

export async function currentPurpose(tx: CellTransaction): Promise<string> {
  const rows = await tx.execute<{ purpose: string | null }>(
    sql`select current_setting('app.purpose', true) as purpose`,
  );
  return rows[0]?.purpose ?? "";
}
