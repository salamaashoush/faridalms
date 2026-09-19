import type {
  SaveAcademicYearInput,
  SetDefaultYearInput,
  SetYearStatusInput,
  TermInput,
} from "@faridalms/domain/academic-year";

import {
  termIssue,
  yearTransitionIssue,
} from "@faridalms/domain/academic-year";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import type { Database, DatabaseTransaction } from "../index";

import { schema } from "../index";
import { ACADEMIC_STRUCTURE_LOCK } from "../locks";
import { ManagementError } from "./management";

export function listAcademicYears(db: Database) {
  return db.query.schoolYears.findMany({
    orderBy: { startsOn: "desc", id: "asc" },
  });
}

export function getAcademicYear(db: Database, id: string) {
  return db.query.schoolYears.findFirst({
    where: { id },
    with: {
      terms: { orderBy: { startsOn: "asc" } },
      weeks: { orderBy: { number: "asc" } },
    },
  });
}

export async function saveAcademicYear(
  db: Database,
  input: SaveAcademicYearInput,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${ACADEMIC_STRUCTURE_LOCK})`,
    );
    const values = {
      name: input.name,
      startsOn: input.startsOn,
      endsOn: input.endsOn,
    };
    if (!input.id) {
      const [created] = await tx
        .insert(schema.schoolYears)
        .values({ ...values, status: "planning" })
        .onConflictDoNothing()
        .returning();
      if (!created)
        throw new ManagementError("CONFLICT", "academic_year.name_conflict");
      if (input.terms) await syncTerms(tx, created, input.terms);
      return created;
    }
    const [existing] = await tx
      .select()
      .from(schema.schoolYears)
      .where(eq(schema.schoolYears.id, input.id))
      .for("update");
    if (!existing)
      throw new ManagementError("NOT_FOUND", "academic_year.not_found");
    if (existing.revision !== input.expectedRevision)
      throw new ManagementError("CONFLICT", "academic_year.revision_conflict");
    if (existing.status === "closed")
      throw new ManagementError("CONFLICT", "academic_year.closed");
    if (input.startsOn > existing.startsOn || input.endsOn < existing.endsOn) {
      throw new ManagementError("BAD_REQUEST", "academic_year.shrink");
    }
    const duplicate = await tx.query.schoolYears.findFirst({
      where: { name: input.name, id: { ne: input.id } },
    });
    if (duplicate)
      throw new ManagementError("CONFLICT", "academic_year.name_conflict");
    const [updated] = await tx
      .update(schema.schoolYears)
      .set({
        ...values,
        revision: sql`${schema.schoolYears.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.schoolYears.id, input.id),
          eq(schema.schoolYears.revision, existing.revision),
        ),
      )
      .returning();
    if (!updated)
      throw new ManagementError("CONFLICT", "academic_year.revision_conflict");
    if (input.terms) await syncTerms(tx, updated, input.terms);
    return updated;
  });
}

async function syncTerms(
  tx: DatabaseTransaction,
  year: { id: string; startsOn: string; endsOn: string },
  terms: TermInput[],
) {
  const issue = termIssue(year, terms);
  if (issue) throw new ManagementError("BAD_REQUEST", `academic_year.${issue}`);
  const existing = await tx.query.terms.findMany({
    where: { schoolYearId: year.id },
    columns: { id: true },
  });
  const known = new Set(existing.map((term) => term.id));
  if (terms.some((term) => term.id && !known.has(term.id)))
    throw new ManagementError("NOT_FOUND", "academic_year.term_not_found");
  const kept = new Set(terms.flatMap((term) => (term.id ? [term.id] : [])));
  const removed = existing.filter((term) => !kept.has(term.id));
  if (removed.length > 0) {
    const graded = await tx.query.grades.findFirst({
      where: { termId: { in: removed.map((term) => term.id) } },
      columns: { id: true },
    });
    if (graded)
      throw new ManagementError("BAD_REQUEST", "academic_year.term_in_use");
    await tx.delete(schema.terms).where(
      inArray(
        schema.terms.id,
        removed.map((term) => term.id),
      ),
    );
  }
  for (const term of terms) {
    const values = {
      name: term.name.trim(),
      startsOn: term.startsOn,
      endsOn: term.endsOn,
    };
    if (term.id)
      await tx
        .update(schema.terms)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(schema.terms.id, term.id));
    else
      await tx
        .insert(schema.terms)
        .values({ ...values, schoolYearId: year.id });
  }
}

type Executor = Database | DatabaseTransaction;

/** Refuses a write into a closed year; reopening it is the correction path. */
export async function assertYearOpen(db: Executor, schoolYearId: string) {
  const year = await db.query.schoolYears.findFirst({
    where: { id: schoolYearId },
    columns: { status: true },
  });
  if (year?.status === "closed")
    throw new ManagementError("CONFLICT", "academic_year.closed");
}

export async function assertClassYearOpen(db: Executor, classId: string) {
  const row = await db.query.classes.findFirst({
    where: { id: classId },
    columns: { schoolYearId: true },
  });
  if (row) await assertYearOpen(db, row.schoolYearId);
}

async function lockedYear(
  tx: DatabaseTransaction,
  id: string,
  expectedRevision: number,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${ACADEMIC_STRUCTURE_LOCK})`,
  );
  const [year] = await tx
    .select()
    .from(schema.schoolYears)
    .where(eq(schema.schoolYears.id, id))
    .for("update");
  if (!year) throw new ManagementError("NOT_FOUND", "academic_year.not_found");
  if (year.revision !== expectedRevision)
    throw new ManagementError("CONFLICT", "academic_year.revision_conflict");
  return year;
}

const TRANSITION_ACTION = {
  active: "activated",
  closed: "closed",
  planning: "planned",
} as const;

export async function setAcademicYearStatus(
  db: Database,
  input: SetYearStatusInput,
  actor: { id: string; canReopen: boolean },
) {
  return db.transaction(async (tx) => {
    const year = await lockedYear(tx, input.id, input.expectedRevision);
    const issue = yearTransitionIssue(year.status, input.status, {
      isDefault: year.isCurrent,
      reason: input.reason,
    });
    if (issue) throw new ManagementError("BAD_REQUEST", issue);
    const reopening = year.status === "closed";
    if (reopening && !actor.canReopen)
      throw new ManagementError("FORBIDDEN", "academic_year.reopen_forbidden");
    const [updated] = await tx
      .update(schema.schoolYears)
      .set({
        status: input.status,
        revision: sql`${schema.schoolYears.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(schema.schoolYears.id, year.id))
      .returning();
    await tx.insert(schema.schoolYearEvents).values({
      schoolYearId: year.id,
      actorId: actor.id,
      action: reopening ? "reopened" : TRANSITION_ACTION[input.status],
      reason: input.reason || null,
    });
    return updated;
  });
}

/**
 * Moves the default to another year inside the caller's transaction, so a
 * fixture can exercise it and roll back without other schools or tests ever
 * seeing the switch.
 */
export async function applyDefaultAcademicYear(
  tx: DatabaseTransaction,
  input: SetDefaultYearInput,
  actorId: string,
) {
  const year = await lockedYear(tx, input.id, input.expectedRevision);
  if (year.status !== "active")
    throw new ManagementError("BAD_REQUEST", "academic_year.not_active");
  if (year.isCurrent) return year;
  await tx
    .update(schema.schoolYears)
    .set({
      isCurrent: false,
      revision: sql`${schema.schoolYears.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(schema.schoolYears.isCurrent, true));
  const [updated] = await tx
    .update(schema.schoolYears)
    .set({
      isCurrent: true,
      revision: sql`${schema.schoolYears.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(schema.schoolYears.id, year.id))
    .returning();
  await tx.insert(schema.schoolYearEvents).values({
    schoolYearId: year.id,
    actorId,
    action: "made_default",
  });
  return updated;
}

export function setDefaultAcademicYear(
  db: Database,
  input: SetDefaultYearInput,
  actorId: string,
) {
  return db.transaction((tx) => applyDefaultAcademicYear(tx, input, actorId));
}

export function academicYearEvents(db: Database, schoolYearId: string) {
  return db
    .select({
      id: schema.schoolYearEvents.id,
      action: schema.schoolYearEvents.action,
      reason: schema.schoolYearEvents.reason,
      createdAt: schema.schoolYearEvents.createdAt,
      actor: { id: schema.users.id, name: schema.users.name },
    })
    .from(schema.schoolYearEvents)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.schoolYearEvents.actorId),
    )
    .where(eq(schema.schoolYearEvents.schoolYearId, schoolYearId))
    .orderBy(desc(schema.schoolYearEvents.createdAt))
    .limit(50);
}
