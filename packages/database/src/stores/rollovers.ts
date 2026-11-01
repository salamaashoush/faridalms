import type { NextYearOutcome } from "@faridalms/domain/rollover";

import { addDays } from "@faridalms/domain/school";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { RolloverState } from "../tables/calendar";

import { yearRollovers } from "../tables/calendar";

type Tx = CellTransaction;

export interface YearEndStudent {
  studentId: string;
  placementId: string;
  gradeId: string | null;
  outcome: NextYearOutcome | null;
  classId: string | null;
  fullNameEn: string | null;
  fullNameAr: string | null;
}

/**
 * Students placed at the school on the year's last day, with the homeroom
 * they are in that day and the outcome already chosen for them.
 */
export async function studentsAtYearEnd(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    year: { id: string; endsBefore: string };
  },
): Promise<YearEndStudent[]> {
  const last = addDays(input.year.endsBefore, -1);
  const rows = await tx.execute<{
    student_id: string;
    placement_id: string;
    grade_id: string | null;
    outcome: NextYearOutcome | null;
    class_id: string | null;
    full_name_en: string | null;
    full_name_ar: string | null;
  }>(sql`
    select p.student_user_id as student_id, p.id as placement_id,
           p.grade_level_descriptor_id as grade_id, p.next_year_outcome as outcome,
           u.full_name_en, u.full_name_ar,
           (select e.class_id from core.enrollments e
             where e.tenant_id = p.tenant_id and e.user_id = p.student_user_id
               and e.school_year_id = p.school_year_id and e.role = 'student'
               and e.class_type = 'homeroom' and e.status = 'active'
               and e.valid_during @> ${last}::date
             limit 1) as class_id
    from core.student_school_years p
    join core.users u on u.tenant_id = p.tenant_id and u.id = p.student_user_id
    where p.tenant_id = ${input.tenantId}::uuid and p.org_id = ${input.schoolId}::uuid
      and p.school_year_id = ${input.year.id}::uuid and p.status = 'active'
      and p.valid_during @> ${last}::date
    order by u.full_name_en, u.full_name_ar, p.student_user_id`);
  return rows.map((row) => ({
    studentId: row.student_id,
    placementId: row.placement_id,
    gradeId: row.grade_id,
    outcome: row.outcome,
    classId: row.class_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
  }));
}

export interface RolloverRow {
  id: string;
  version: number;
  state: RolloverState;
  plan: Record<string, unknown>;
  outcome: Record<string, unknown> | null;
}

export async function rolloverOf(
  tx: Tx,
  input: { tenantId: string; sourceYearId: string; targetYearId: string },
  lock = false,
): Promise<RolloverRow | null> {
  const [row] = await tx.execute<{
    id: string;
    version: number;
    state: RolloverState;
    plan: Record<string, unknown>;
    outcome: Record<string, unknown> | null;
  }>(sql`
    select id, version, state, plan, outcome from core.year_rollovers
    where tenant_id = ${input.tenantId}::uuid and source_year_id = ${input.sourceYearId}::uuid
      and target_year_id = ${input.targetYearId}::uuid and status = 'active'
    ${lock ? sql`for update` : sql``}`);
  return row ?? null;
}

/**
 * Stores the draft; null when it changed since the version the caller read,
 * where 0 means the caller saw none.
 */
export async function saveRolloverDraft(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    sourceYearId: string;
    targetYearId: string;
    expectedVersion: number;
    plan: Record<string, unknown>;
  },
): Promise<{ version: number } | null> {
  if (input.expectedVersion === 0) {
    const [created] = await tx
      .insert(yearRollovers)
      .values({
        tenantId: input.tenantId,
        orgId: input.schoolId,
        sourceYearId: input.sourceYearId,
        targetYearId: input.targetYearId,
        plan: input.plan,
      })
      .returning({ version: yearRollovers.version });
    return created ?? null;
  }
  const [updated] = await tx.execute<{ version: number }>(sql`
    update core.year_rollovers set plan = ${input.plan}::jsonb
    where tenant_id = ${input.tenantId}::uuid and source_year_id = ${input.sourceYearId}::uuid
      and target_year_id = ${input.targetYearId}::uuid and status = 'active'
      and state = 'draft' and version = ${input.expectedVersion}
    returning version`);
  return updated ?? null;
}

/** Records each placement's outcome for next year, touching only those that change. */
export async function setNextYearOutcomes(
  tx: Tx,
  tenantId: string,
  outcomes: { placementId: string; outcome: NextYearOutcome }[],
) {
  for (const row of outcomes)
    await tx.execute(sql`
      update core.student_school_years set next_year_outcome = ${row.outcome}
      where tenant_id = ${tenantId}::uuid and id = ${row.placementId}::uuid
        and next_year_outcome is distinct from ${row.outcome}`);
}

/** Marks placements as ending in a departure of the given exit type. */
export async function recordExits(
  tx: Tx,
  tenantId: string,
  placementIds: string[],
  exitTypeId: string,
) {
  for (const id of placementIds)
    await tx.execute(sql`
      update core.student_school_years set exit_type_descriptor_id = ${exitTypeId}::uuid
      where tenant_id = ${tenantId}::uuid and id = ${id}::uuid`);
}

export async function markRolloverApplied(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    userId: string;
    outcome: Record<string, unknown>;
  },
) {
  await tx.execute(sql`
    update core.year_rollovers
    set state = 'applied', outcome = ${input.outcome}::jsonb, applied_at = statement_timestamp(),
        applied_by_user_id = ${input.userId}::uuid
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid`);
}
