import type { OperatorRole } from "@faridalms/domain/operators";

import { asc, eq, sql } from "drizzle-orm";

import type { BusinessDb } from "./client";

import { recordEvent } from "./events";
import { operators } from "./schema";

export interface OperatorRow {
  id: string;
  name: string;
  email: string | null;
  roles: OperatorRole[];
  state: "active" | "disabled";
  lastSignedInAt: Date | null;
}

const columns = {
  id: operators.id,
  name: operators.name,
  email: operators.email,
  roles: operators.roles,
  state: operators.state,
  lastSignedInAt: operators.lastSignedInAt,
};

/**
 * Records an operator's sign-in and answers what they may do. The first
 * operator the console ever sees becomes its owner; the lock makes two
 * first sign-ins at once agree on which.
 */
export async function signInOperator(
  db: BusinessDb,
  input: { id: string; name: string; email: string | null },
): Promise<OperatorRow> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('operators', 0))`,
    );
    const [held] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(operators);
    const first = (held?.n ?? 0) === 0;
    const [row] = await tx
      .insert(operators)
      .values({
        id: input.id,
        name: input.name,
        email: input.email,
        roles: first ? ["owner"] : [],
        lastSignedInAt: new Date(),
      })
      .onConflictDoUpdate({
        target: operators.id,
        set: {
          name: input.name,
          email: input.email,
          lastSignedInAt: new Date(),
        },
      })
      .returning(columns);
    if (!row) throw new Error("operator was not recorded");
    if (first)
      await recordEvent(tx, {
        operatorId: input.id,
        action: "operator.first_owner",
        subjectType: "operator",
        subjectId: input.id,
        after: { roles: row.roles },
        reason: "The first operator to sign in owns the console",
      });
    return row;
  });
}

export async function operatorById(
  db: BusinessDb,
  id: string,
): Promise<OperatorRow | null> {
  const [row] = await db
    .select(columns)
    .from(operators)
    .where(eq(operators.id, id));
  return row ?? null;
}

export async function listOperators(db: BusinessDb): Promise<OperatorRow[]> {
  return await db.select(columns).from(operators).orderBy(asc(operators.name));
}

/**
 * Gives an operator roles, or takes their access away. The console keeps
 * at least one active owner, so nobody can lock everyone out.
 */
export async function setOperator(
  db: BusinessDb,
  input: {
    id: string;
    roles: OperatorRole[];
    state: "active" | "disabled";
    by: string;
    reason: string;
  },
): Promise<"saved" | "missing" | "last_owner"> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended('operators', 0))`,
    );
    const [before] = await tx
      .select(columns)
      .from(operators)
      .where(eq(operators.id, input.id))
      .for("update");
    if (!before) return "missing";
    const owning = input.state === "active" && input.roles.includes("owner");
    if (!owning) {
      const [others] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(operators)
        .where(
          sql`${operators.id} <> ${input.id} and ${operators.state} = 'active' and 'owner' = any(${operators.roles})`,
        );
      if ((others?.n ?? 0) === 0) return "last_owner";
    }
    await tx
      .update(operators)
      .set({ roles: input.roles, state: input.state })
      .where(eq(operators.id, input.id));
    await recordEvent(tx, {
      operatorId: input.by,
      action: "operator.update",
      subjectType: "operator",
      subjectId: input.id,
      before: { roles: before.roles, state: before.state },
      after: { roles: input.roles, state: input.state },
      reason: input.reason,
    });
    return "saved";
  });
}
