import type { HostRole, HostState, HostStatus } from "@faridalms/domain/hosts";
import type { BunSQLDatabase } from "drizzle-orm/bun-sql/postgres";

import { BASIC_ENTITLEMENTS } from "@faridalms/domain/plans";
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { changes, hosts, schoolEntitlements } from "./schema";

/** Who changed a host, as `directory.changes` names them. */
export type HostActor = `operator:${string}` | `cell:${string}`;

export interface SchoolHost {
  hostname: string;
  role: HostRole;
  canonical: boolean;
  challenge: string;
  state: HostState;
  stateChangedAt: string;
  verifiedAt: string | null;
  checkedAt: string | null;
  lastError: string | null;
  failures: number;
  createdAt: string;
}

/** A host a worker took to check: what it needs to know what to expect. */
export interface ClaimedHost {
  hostname: string;
  schoolId: string;
  slug: string;
  role: HostRole;
  challenge: string;
}

/**
 * The name is already bound: `hosts.exists` to this school, `hosts.taken`
 * to another one, which only an operator may release.
 */
export class HostRefusedError extends Error {
  constructor(
    readonly code: "hosts.exists" | "hosts.taken" | "hosts.limit_reached",
  ) {
    super(code);
    this.name = "HostRefusedError";
  }
}

type Db = BunSQLDatabase;

const iso = (value: Date | null) => value?.toISOString() ?? null;

const hostColumns = {
  hostname: hosts.hostname,
  role: hosts.role,
  canonical: hosts.canonical,
  challenge: hosts.challenge,
  state: hosts.state,
  stateChangedAt: hosts.stateChangedAt,
  verifiedAt: hosts.verifiedAt,
  checkedAt: hosts.checkedAt,
  lastError: hosts.lastError,
  failures: hosts.failures,
  createdAt: hosts.createdAt,
};

function hostOf(row: {
  hostname: string;
  role: HostRole;
  canonical: boolean;
  challenge: string;
  state: HostState;
  stateChangedAt: Date;
  verifiedAt: Date | null;
  checkedAt: Date | null;
  lastError: string | null;
  failures: number;
  createdAt: Date;
}): SchoolHost {
  return {
    ...row,
    stateChangedAt: row.stateChangedAt.toISOString(),
    verifiedAt: iso(row.verifiedAt),
    checkedAt: iso(row.checkedAt),
    createdAt: row.createdAt.toISOString(),
  };
}

/** A school's hosts that have not been removed, its canonical ones first. */
export async function schoolHosts(
  db: Db,
  schoolId: string,
): Promise<SchoolHost[]> {
  const rows = await db
    .select(hostColumns)
    .from(hosts)
    .where(and(eq(hosts.schoolId, schoolId), ne(hosts.state, "removed")))
    .orderBy(
      asc(hosts.role),
      sql`${hosts.canonical} desc`,
      asc(hosts.hostname),
    );
  return rows.map(hostOf);
}

/**
 * Binds a name to a school as pending, with a fresh challenge, or binds a
 * name the school removed again. The first live host of a role becomes the
 * canonical one, so a school with one domain need not choose it.
 */
export async function addHost(
  db: Db,
  input: {
    schoolId: string;
    hostname: string;
    role: HostRole;
    challenge: string;
    actor: HostActor;
    reason: string;
  },
): Promise<SchoolHost> {
  return db.transaction(async (tx) => {
    const [held] = await tx
      .select({ schoolId: hosts.schoolId, state: hosts.state })
      .from(hosts)
      .where(eq(hosts.hostname, input.hostname))
      .for("update");
    if (held && held.schoolId !== input.schoolId)
      throw new HostRefusedError("hosts.taken");
    if (held && held.state !== "removed")
      throw new HostRefusedError("hosts.exists");
    const [entitled] = await tx
      .select({ customDomains: schoolEntitlements.customDomains })
      .from(schoolEntitlements)
      .where(eq(schoolEntitlements.schoolId, input.schoolId));
    const allowed = entitled
      ? entitled.customDomains
      : BASIC_ENTITLEMENTS.customDomains;
    if (allowed !== null) {
      const [kept] = await tx
        .select({ n: count() })
        .from(hosts)
        .where(
          and(eq(hosts.schoolId, input.schoolId), ne(hosts.state, "removed")),
        );
      if ((kept?.n ?? 0) >= allowed)
        throw new HostRefusedError("hosts.limit_reached");
    }
    if (held)
      await tx
        .update(hosts)
        .set({
          role: input.role,
          challenge: input.challenge,
          state: "pending",
          stateChangedAt: sql`statement_timestamp()`,
          verifiedAt: null,
          checkedAt: null,
          lastError: null,
          failures: 0,
        })
        .where(eq(hosts.hostname, input.hostname));
    else
      // Only the columns a cell may set: Drizzle names every column, and
      // inserting a column's default still needs the right to that column.
      await tx.execute(
        sql`insert into hosts (hostname, school_id, role, challenge)
          values (${input.hostname}, ${input.schoolId}::uuid, ${input.role}, ${input.challenge})`,
      );
    const [canonical] = await tx
      .select({ hostname: hosts.hostname })
      .from(hosts)
      .where(
        and(
          eq(hosts.schoolId, input.schoolId),
          eq(hosts.role, input.role),
          eq(hosts.canonical, true),
        ),
      );
    if (!canonical)
      await tx
        .update(hosts)
        .set({ canonical: true })
        .where(eq(hosts.hostname, input.hostname));
    await tx.insert(changes).values({
      actor: input.actor,
      subjectType: "host",
      subjectId: input.hostname,
      action: "host.add",
      before: held ? { state: held.state } : null,
      after: { schoolId: input.schoolId, role: input.role, state: "pending" },
      reason: input.reason,
    });
    const [row] = await tx
      .select(hostColumns)
      .from(hosts)
      .where(eq(hosts.hostname, input.hostname));
    if (!row) throw new Error("The host was just written");
    return hostOf(row);
  });
}

/** Retires a school's host: it stops routing and keeps its name. */
export async function removeHost(
  db: Db,
  input: {
    schoolId: string;
    hostname: string;
    actor: HostActor;
    reason: string;
  },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const removed = await tx
      .update(hosts)
      .set({
        state: "removed",
        canonical: false,
        stateChangedAt: sql`statement_timestamp()`,
      })
      .where(
        and(
          eq(hosts.hostname, input.hostname),
          eq(hosts.schoolId, input.schoolId),
          ne(hosts.state, "removed"),
        ),
      )
      .returning({ role: hosts.role });
    if (removed.length === 0) return false;
    await tx.insert(changes).values({
      actor: input.actor,
      subjectType: "host",
      subjectId: input.hostname,
      action: "host.remove",
      before: null,
      after: { state: "removed" },
      reason: input.reason,
    });
    return true;
  });
}

/** Makes a host the one links and redirects use for its school and role. */
export async function makeCanonical(
  db: Db,
  input: {
    schoolId: string;
    hostname: string;
    actor: HostActor;
    reason: string;
  },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ role: hosts.role, canonical: hosts.canonical })
      .from(hosts)
      .where(
        and(
          eq(hosts.hostname, input.hostname),
          eq(hosts.schoolId, input.schoolId),
          ne(hosts.state, "removed"),
        ),
      )
      .for("update");
    if (!target) return false;
    if (target.canonical) return true;
    const [before] = await tx
      .update(hosts)
      .set({ canonical: false })
      .where(
        and(
          eq(hosts.schoolId, input.schoolId),
          eq(hosts.role, target.role),
          eq(hosts.canonical, true),
        ),
      )
      .returning({ hostname: hosts.hostname });
    await tx
      .update(hosts)
      .set({ canonical: true })
      .where(eq(hosts.hostname, input.hostname));
    await tx.insert(changes).values({
      actor: input.actor,
      subjectType: "host",
      subjectId: input.hostname,
      action: "host.canonical",
      before: { canonical: before?.hostname ?? null },
      after: { canonical: input.hostname },
      reason: input.reason,
    });
    return true;
  });
}

/** Asks for a host to be checked on the worker's next pass. */
export async function requestCheck(
  db: Db,
  input: { schoolId: string; hostname: string },
): Promise<boolean> {
  const rows = await db
    .update(hosts)
    .set({ checkedAt: null })
    .where(
      and(
        eq(hosts.hostname, input.hostname),
        eq(hosts.schoolId, input.schoolId),
        ne(hosts.state, "removed"),
      ),
    )
    .returning({ hostname: hosts.hostname });
  return rows.length > 0;
}

const claimedColumns = {
  hostname: hosts.hostname,
  schoolId: hosts.schoolId,
  slug: sql<string>`(select s.slug from schools s where s.id = ${hosts.schoolId})`,
  role: hosts.role,
  challenge: hosts.challenge,
};

/**
 * Takes up to `limit` hosts due a check, oldest check first, and marks them
 * checked now, so another replica's pass skips them. A host is due when a
 * check was asked for or the last one is `recheckMs` old.
 */
export async function claimDue(
  db: Db,
  input: { limit: number; recheckMs: number },
): Promise<ClaimedHost[]> {
  const due = db
    .select({ hostname: hosts.hostname })
    .from(hosts)
    .where(
      and(
        ne(hosts.state, "removed"),
        or(
          isNull(hosts.checkedAt),
          lt(
            hosts.checkedAt,
            sql`statement_timestamp() - ${input.recheckMs / 1000}::double precision * interval '1 second'`,
          ),
        ),
      ),
    )
    .orderBy(sql`${hosts.checkedAt} asc nulls first`)
    .limit(input.limit)
    .for("update", { skipLocked: true });
  return db
    .update(hosts)
    .set({ checkedAt: sql`statement_timestamp()` })
    .where(inArray(hosts.hostname, due))
    .returning(claimedColumns);
}

/** Takes one of a school's hosts to check it now. */
export async function claimHost(
  db: Db,
  input: { schoolId: string; hostname: string },
): Promise<ClaimedHost | null> {
  const [row] = await db
    .update(hosts)
    .set({ checkedAt: sql`statement_timestamp()` })
    .where(
      and(
        eq(hosts.hostname, input.hostname),
        eq(hosts.schoolId, input.schoolId),
        ne(hosts.state, "removed"),
      ),
    )
    .returning(claimedColumns);
  return row ?? null;
}

/**
 * Writes what a check decided, from the host as it is now rather than as it
 * was claimed, since it may have been removed or bound again meanwhile. A
 * change of state is recorded in `directory.changes`.
 */
export async function recordCheck(
  db: Db,
  input: {
    hostname: string;
    decide: (status: HostStatus) => HostStatus;
    actor: HostActor;
  },
): Promise<(HostStatus & { schoolId: string; role: HostRole }) | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        schoolId: hosts.schoolId,
        role: hosts.role,
        state: hosts.state,
        failures: hosts.failures,
        stateChangedAt: hosts.stateChangedAt,
        verifiedAt: hosts.verifiedAt,
        lastError: hosts.lastError,
      })
      .from(hosts)
      .where(eq(hosts.hostname, input.hostname))
      .for("update");
    if (!row || row.state === "removed") return null;
    const { schoolId, role, ...status } = row;
    const next = input.decide(status);
    await tx
      .update(hosts)
      .set({
        state: next.state,
        stateChangedAt: next.stateChangedAt,
        verifiedAt: next.verifiedAt,
        lastError: next.lastError,
        failures: next.failures,
        ...(next.state === "removed" ? { canonical: false } : {}),
      })
      .where(eq(hosts.hostname, input.hostname));
    if (next.state !== status.state)
      await tx.insert(changes).values({
        actor: input.actor,
        subjectType: "host",
        subjectId: input.hostname,
        action: `host.${next.state}`,
        before: { state: status.state },
        after: { state: next.state, error: next.lastError },
        reason:
          next.state === "failing"
            ? "Its records were missing on three checks in a row"
            : next.state === "removed"
              ? "It was failing for seven days"
              : "The verification worker checked its records",
      });
    return { ...next, schoolId, role };
  });
}
