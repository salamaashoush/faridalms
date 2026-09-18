import type { SaveAcademicYearInput } from "@faridalms/domain/academic-year";

import { and, eq, sql } from "drizzle-orm";

import type { Database } from "../index";

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
    return updated;
  });
}
