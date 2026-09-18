import type {
  SaveAcademicYearInput,
  TermInput,
} from "@faridalms/domain/academic-year";

import { termIssue } from "@faridalms/domain/academic-year";
import { and, eq, inArray, sql } from "drizzle-orm";

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
        .values(values)
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
