import { and, eq, sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { Scope } from "./students";

import { studentSchoolYears } from "../tables/school-years";
import { bounds, uuidArray } from "./sql";
import { ensureStudentRole } from "./students";

type Tx = CellTransaction;

export interface Placement {
  id: string;
  version: number;
  schoolYearId: string;
  yearTitleEn: string | null;
  yearTitleAr: string | null;
  from: string;
  to: string;
  gradeId: string | null;
  entryTypeId: string | null;
  exitTypeId: string | null;
  exitMeaning: string | null;
  previousSchool: string | null;
  destinationSchool: string | null;
}

export async function placements(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId">,
  studentId: string,
): Promise<Placement[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    school_year_id: string;
    title_en: string | null;
    title_ar: string | null;
    valid_during: string;
    grade_id: string | null;
    entry_id: string | null;
    exit_id: string | null;
    exit_meaning: string | null;
    previous_school: string | null;
    destination_school: string | null;
  }>(sql`
    select s.id, s.version, s.school_year_id, y.title_en, y.title_ar, s.valid_during::text as valid_during,
           s.grade_level_descriptor_id as grade_id, s.entry_type_descriptor_id as entry_id,
           s.exit_type_descriptor_id as exit_id, x.system_meaning as exit_meaning, s.previous_school,
           s.destination_school
    from core.student_school_years s
    join core.academic_sessions y on y.tenant_id = s.tenant_id and y.id = s.school_year_id
    left join core.descriptors x on x.tenant_id = s.tenant_id and x.id = s.exit_type_descriptor_id
    where s.tenant_id = ${scope.tenantId}::uuid and s.student_user_id = ${studentId}::uuid
      and s.org_id = ${scope.schoolId}::uuid and s.status = 'active'
    order by lower(s.valid_during) desc`);
  return rows.map((row) => {
    const range = bounds(row.valid_during);
    return {
      id: row.id,
      version: row.version,
      schoolYearId: row.school_year_id,
      yearTitleEn: row.title_en,
      yearTitleAr: row.title_ar,
      from: range.from,
      to: range.to ?? range.from,
      gradeId: row.grade_id,
      entryTypeId: row.entry_id,
      exitTypeId: row.exit_id,
      exitMeaning: row.exit_meaning,
      previousSchool: row.previous_school,
      destinationSchool: row.destination_school,
    };
  });
}

/** Records how a student came to a placement, and from which school. */
export async function saveArrival(
  tx: Tx,
  input: {
    tenantId: string;
    placementId: string;
    entryTypeId: string | null;
    previousSchool: string | null;
  },
) {
  await tx
    .update(studentSchoolYears)
    .set({
      entryTypeDescriptorId: input.entryTypeId,
      previousSchool: input.previousSchool,
    })
    .where(
      and(
        eq(studentSchoolYears.tenantId, input.tenantId),
        eq(studentSchoolYears.id, input.placementId),
      ),
    );
}

/**
 * Ends a placement in a departure: its last day, why the student left and
 * where they went. A placement that ends there anyway keeps its dates.
 */
export async function endPlacement(
  tx: Tx,
  input: {
    tenantId: string;
    placementId: string;
    /** The day after the student's last. */
    on: string;
    exitTypeId: string;
    destination: string | null;
  },
) {
  await tx.execute(sql`
    update core.student_school_years
    set valid_during = daterange(lower(valid_during), least(upper(valid_during), ${input.on}::date)),
        exit_type_descriptor_id = ${input.exitTypeId}::uuid, destination_school = ${input.destination}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.placementId}::uuid`);
}

/**
 * Takes a departure back: the placement runs to the end it had, without an
 * exit, and the placements dropped with it stand again.
 */
export async function reopenPlacement(
  tx: Tx,
  input: {
    tenantId: string;
    placementId: string;
    until: string;
    dropped: readonly string[];
  },
) {
  await tx.execute(sql`
    update core.student_school_years
    set valid_during = daterange(lower(valid_during), ${input.until}::date),
        exit_type_descriptor_id = null, destination_school = null
    where tenant_id = ${input.tenantId}::uuid and id = ${input.placementId}::uuid`);
  if (input.dropped.length > 0)
    await tx.execute(sql`
      update core.student_school_years set status = 'active'
      where tenant_id = ${input.tenantId}::uuid and id = any(${uuidArray(input.dropped)})`);
}

/** Drops the placements a student was to start on or after the date. */
export async function voidPlacementsFrom(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId">,
  input: { studentId: string; from: string },
): Promise<string[]> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.student_school_years set status = 'tobedeleted'
    where tenant_id = ${scope.tenantId}::uuid and org_id = ${scope.schoolId}::uuid
      and student_user_id = ${input.studentId}::uuid and status = 'active'
      and lower(valid_during) >= ${input.from}::date
    returning id`);
  return rows.map((row) => row.id);
}

/**
 * Places a student in a grade for a year. A student already placed that year
 * in another grade moves: the old placement ends and a new one starts, unless
 * it only began today, when it changes in place.
 */
export async function place(
  tx: Tx,
  scope: Scope,
  input: {
    studentId: string;
    year: { id: string; startsOn: string; endsBefore: string };
    gradeId: string;
    calendarId: string | null;
    /** The day the grade takes effect; today by default, never before the year. */
    from?: string;
    entryTypeId?: string | null;
    source?: "manual" | "rollover" | "admission";
  },
) {
  const wanted = input.from ?? scope.today;
  const start = wanted > input.year.startsOn ? wanted : input.year.startsOn;
  const existing = (await placements(tx, scope, input.studentId)).find(
    (row) =>
      row.schoolYearId === input.year.id && row.from <= start && start < row.to,
  );
  if (existing?.gradeId === input.gradeId) return { changed: false };
  if (existing && existing.from === start)
    await tx
      .update(studentSchoolYears)
      .set({ gradeLevelDescriptorId: input.gradeId })
      .where(
        and(
          eq(studentSchoolYears.tenantId, scope.tenantId),
          eq(studentSchoolYears.id, existing.id),
        ),
      );
  else {
    if (existing)
      await tx
        .update(studentSchoolYears)
        .set({ validDuring: `[${existing.from},${start})` })
        .where(
          and(
            eq(studentSchoolYears.tenantId, scope.tenantId),
            eq(studentSchoolYears.id, existing.id),
          ),
        );
    await tx.insert(studentSchoolYears).values({
      tenantId: scope.tenantId,
      studentUserId: input.studentId,
      orgId: scope.schoolId,
      schoolYearId: input.year.id,
      validDuring: `[${start},${input.year.endsBefore})`,
      gradeLevelDescriptorId: input.gradeId,
      calendarId: input.calendarId,
      entryTypeDescriptorId: input.entryTypeId ?? null,
      source: input.source ?? "manual",
    });
  }
  await ensureStudentRole(tx, scope, input.studentId, start);
  return { changed: true };
}

export async function calendarFor(tx: Tx, tenantId: string, yearId: string) {
  const rows = await tx.execute<{ id: string }>(sql`
    select id from core.calendars where tenant_id = ${tenantId}::uuid and school_year_id = ${yearId}::uuid
      and kind = 'school' and status = 'active' limit 1`);
  return rows[0]?.id ?? null;
}

/** A student in a year's list, as their placements there give them. */
export interface YearStudent {
  studentId: string;
  gradeId: string | null;
  status: "enrolled" | "pre_enrolled" | "left" | "graduated" | "unplaced";
}

/**
 * A year's students: those placed in it, with their grade there and where
 * they stand by their placements at the school (mirrors `placementStatus`).
 * The working year also lists every student whose role holds today, placed
 * or not.
 */
export async function yearStudents(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId" | "today">,
  input: { yearId: string; working: boolean },
): Promise<YearStudent[]> {
  const rows = await tx.execute<{
    student_id: string;
    grade_id: string | null;
    status: YearStudent["status"];
  }>(sql`
    with placed as (
      select distinct on (s.student_user_id) s.student_user_id, s.grade_level_descriptor_id
      from core.student_school_years s
      where s.tenant_id = ${scope.tenantId}::uuid and s.org_id = ${scope.schoolId}::uuid
        and s.school_year_id = ${input.yearId}::uuid and s.status = 'active'
      order by s.student_user_id, upper(s.valid_during) desc
    ), members as (
      select student_user_id from placed
      union
      select r.user_id from core.user_roles r
      where ${input.working} and r.tenant_id = ${scope.tenantId}::uuid and r.org_id = ${scope.schoolId}::uuid
        and r.role = 'student' and r.status = 'active' and r.valid_during @> ${scope.today}::date
    )
    select m.student_user_id as student_id, p.grade_level_descriptor_id as grade_id,
      case
        when exists (select 1 from core.student_school_years s where s.tenant_id = ${scope.tenantId}::uuid
                       and s.student_user_id = m.student_user_id and s.org_id = ${scope.schoolId}::uuid
                       and s.status = 'active' and s.valid_during @> ${scope.today}::date) then 'enrolled'
        when not exists (select 1 from core.student_school_years s where s.tenant_id = ${scope.tenantId}::uuid
                       and s.student_user_id = m.student_user_id and s.org_id = ${scope.schoolId}::uuid
                       and s.status = 'active') then 'unplaced'
        else (select case
                       when lower(s.valid_during) > ${scope.today}::date then 'pre_enrolled'
                       when x.system_meaning = 'graduated' then 'graduated'
                       when x.system_meaning is not null then 'left'
                       else 'enrolled' end
              from core.student_school_years s
              left join core.descriptors x on x.tenant_id = s.tenant_id and x.id = s.exit_type_descriptor_id
              where s.tenant_id = ${scope.tenantId}::uuid and s.student_user_id = m.student_user_id
                and s.org_id = ${scope.schoolId}::uuid and s.status = 'active'
              order by upper(s.valid_during) desc limit 1)
      end as status
    from members m
    left join placed p on p.student_user_id = m.student_user_id`);
  return rows.map((row) => ({
    studentId: row.student_id,
    gradeId: row.grade_id,
    status: row.status,
  }));
}
