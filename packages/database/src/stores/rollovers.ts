import type {
  NextYearIntention,
  NextYearOutcome,
} from "@faridalms/domain/rollover";

import { addDays } from "@faridalms/domain/school";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { RolloverState } from "../tables/calendar";

import { yearRollovers } from "../tables/calendar";
import { uuidArray } from "./sql";

type Tx = CellTransaction;

export interface YearEndStudent {
  studentId: string;
  placementId: string;
  gradeId: string | null;
  outcome: NextYearOutcome | null;
  /** What the family, or the office for them, said of next year. */
  intention: NextYearIntention | null;
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
    intention: NextYearIntention | null;
    class_id: string | null;
    full_name_en: string | null;
    full_name_ar: string | null;
  }>(sql`
    select p.student_user_id as student_id, p.id as placement_id,
           p.grade_level_descriptor_id as grade_id, p.next_year_outcome as outcome,
           p.next_year_intention as intention,
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
    intention: row.intention,
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

/** Marks the year in which families were asked about the next; false when they already were. */
export async function openReenrolment(
  tx: Tx,
  input: { tenantId: string; schoolId: string; yearId: string },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.academic_sessions set reenrolment_opened_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.schoolId}::uuid
      and id = ${input.yearId}::uuid and type = 'school_year' and status = 'active'
      and reenrolment_opened_at is null
    returning id`);
  return rows.length > 0;
}

export interface Reenrolment {
  studentId: string;
  placementId: string;
  yearId: string;
  intention: NextYearIntention | null;
}

/**
 * The students' placements today in a year whose families were asked about
 * the next, with what was said so far.
 */
export async function openReenrolments(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    studentIds: readonly string[];
    today: string;
  },
): Promise<Reenrolment[]> {
  if (input.studentIds.length === 0) return [];
  const rows = await tx.execute<{
    student_id: string;
    placement_id: string;
    year_id: string;
    intention: NextYearIntention | null;
  }>(sql`
    select p.student_user_id as student_id, p.id as placement_id, p.school_year_id as year_id,
           p.next_year_intention as intention
    from core.student_school_years p
    join core.academic_sessions y on y.tenant_id = p.tenant_id and y.id = p.school_year_id
    where p.tenant_id = ${input.tenantId}::uuid and p.org_id = ${input.schoolId}::uuid
      and p.status = 'active' and p.valid_during @> ${input.today}::date
      and p.student_user_id = any(${uuidArray(input.studentIds)})
      and y.reenrolment_opened_at is not null and y.status = 'active'`);
  return rows.map((row) => ({
    studentId: row.student_id,
    placementId: row.placement_id,
    yearId: row.year_id,
    intention: row.intention,
  }));
}

/** Records what was said of a student's next year on their placement. */
export async function recordIntention(
  tx: Tx,
  input: {
    tenantId: string;
    placementId: string;
    intention: NextYearIntention;
    byUserId: string;
  },
): Promise<void> {
  await tx.execute(sql`
    update core.student_school_years set next_year_intention = ${input.intention},
      intention_by_user_id = ${input.byUserId}::uuid, intention_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and id = ${input.placementId}::uuid and status = 'active'`);
}
