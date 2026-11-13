import type { GradeStretch } from "@faridalms/domain/grade-levels";

import { gradeChange, gradeOn } from "@faridalms/domain/grade-levels";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { StudentGradeSource } from "../tables/grade-levels";

import { bounds, uuidArray } from "./sql";

type Tx = CellTransaction;

interface School {
  tenantId: string;
  orgId: string;
}

export interface StudentGradeRow extends GradeStretch {
  source: StudentGradeSource;
}

/** A student's grades at the school, earliest first. */
export async function gradeHistory(
  tx: Tx,
  input: School & { studentId: string },
): Promise<StudentGradeRow[]> {
  const rows = await tx.execute<{
    id: string;
    grade_id: string;
    valid_during: string;
    source: StudentGradeSource;
  }>(sql`
    select id, grade_level_descriptor_id as grade_id, valid_during::text as valid_during, source
    from core.student_grades
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and student_user_id = ${input.studentId}::uuid and status = 'active'
    order by lower(valid_during)`);
  return rows.map((row) => {
    const range = bounds(row.valid_during);
    return {
      id: row.id,
      gradeId: row.grade_id,
      from: range.from,
      until: range.to,
      source: row.source,
    };
  });
}

/** Each student's grade on a day, of those given, or of every student at the school. */
export async function gradesOn(
  tx: Tx,
  input: School & { on: string; studentIds: readonly string[] | null },
): Promise<Map<string, string>> {
  if (input.studentIds?.length === 0) return new Map();
  const rows = await tx.execute<{ student_id: string; grade_id: string }>(sql`
    select student_user_id as student_id, grade_level_descriptor_id as grade_id
    from core.student_grades
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and status = 'active' and valid_during @> ${input.on}::date
      and (${input.studentIds === null} or student_user_id = any(${uuidArray(input.studentIds ?? [])}))`);
  return new Map(rows.map((row) => [row.student_id, row.grade_id]));
}

/**
 * Sets a student's grade from a day (`gradeChange`), or with `onlyIfNone`
 * only where they hold none that day. Answers whether anything changed.
 */
export async function setStudentGrade(
  tx: Tx,
  input: School & {
    studentId: string;
    gradeId: string;
    from: string;
    source: StudentGradeSource;
    onlyIfNone?: boolean;
  },
): Promise<boolean> {
  await tx.execute(sql`
    select 1 from core.users
    where tenant_id = ${input.tenantId}::uuid and id = ${input.studentId}::uuid
    for update`);
  const rows = await gradeHistory(tx, input);
  if (input.onlyIfNone && gradeOn(rows, input.from)) return false;
  const writes = gradeChange(rows, {
    gradeId: input.gradeId,
    from: input.from,
  });
  if (writes.kind === "none") return false;
  if (writes.kind === "regrade") {
    await tx.execute(sql`
      update core.student_grades set grade_level_descriptor_id = ${writes.gradeId}::uuid, source = ${input.source}
      where tenant_id = ${input.tenantId}::uuid and id = ${writes.id}::uuid`);
    return true;
  }
  if (writes.end)
    await tx.execute(sql`
      update core.student_grades set valid_during = daterange(lower(valid_during), ${writes.from}::date)
      where tenant_id = ${input.tenantId}::uuid and id = ${writes.end}::uuid`);
  await tx.execute(sql`
    insert into core.student_grades (tenant_id, org_id, student_user_id, grade_level_descriptor_id,
      valid_during, source)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.studentId}::uuid,
      ${input.gradeId}::uuid, daterange(${writes.from}::date, ${writes.until}::date), ${input.source})`);
  return true;
}

export interface GradesEnded {
  endedId: string | null;
  until: string | null;
  dropped: string[];
}

/**
 * Ends a leaver's grade on the day they leave and drops the grades they
 * were to start on or after it; answers what to give back.
 */
export async function endGrades(
  tx: Tx,
  input: School & { studentId: string; leftOn: string },
): Promise<GradesEnded> {
  const rows = await gradeHistory(tx, input);
  const running = rows.find(
    (row) =>
      row.from < input.leftOn &&
      (row.until === null || row.until > input.leftOn),
  );
  const dropped = rows.filter((row) => row.from >= input.leftOn);
  if (running)
    await tx.execute(sql`
      update core.student_grades set valid_during = daterange(lower(valid_during), ${input.leftOn}::date)
      where tenant_id = ${input.tenantId}::uuid and id = ${running.id}::uuid`);
  if (dropped.length > 0)
    await tx.execute(sql`
      update core.student_grades set status = 'tobedeleted'
      where tenant_id = ${input.tenantId}::uuid and id = any(${uuidArray(dropped.map((row) => row.id))})`);
  return {
    endedId: running?.id ?? null,
    until: running?.until ?? null,
    dropped: dropped.map((row) => row.id),
  };
}

/** Gives back what `endGrades` ended. */
export async function restoreGrades(
  tx: Tx,
  input: { tenantId: string } & GradesEnded,
) {
  if (input.dropped.length > 0)
    await tx.execute(sql`
      update core.student_grades set status = 'active'
      where tenant_id = ${input.tenantId}::uuid and id = any(${uuidArray(input.dropped)})`);
  if (input.endedId)
    await tx.execute(sql`
      update core.student_grades set valid_during = daterange(lower(valid_during), ${input.until}::date)
      where tenant_id = ${input.tenantId}::uuid and id = ${input.endedId}::uuid`);
}

/** The grade a student was in over each stretch, by its fixed meaning. */
export async function gradeMeaningsOver(
  tx: Tx,
  input: School & { studentId: string },
): Promise<{ from: string; before: string | null; meaning: string | null }[]> {
  const rows = await tx.execute<{
    from: string;
    before: string | null;
    meaning: string | null;
  }>(sql`
    select lower(s.valid_during)::text as from, upper(s.valid_during)::text as before,
      d.system_meaning as meaning
    from core.student_grades s
    join core.descriptors d on d.tenant_id = s.tenant_id and d.id = s.grade_level_descriptor_id
    where s.tenant_id = ${input.tenantId}::uuid and s.org_id = ${input.orgId}::uuid
      and s.student_user_id = ${input.studentId}::uuid and s.status = 'active'
    order by lower(s.valid_during)`);
  return rows;
}

/** How many students hold a grade on or after a day, by grade. */
export async function studentsHolding(
  tx: Tx,
  input: School & { from: string },
): Promise<Map<string, number>> {
  const rows = await tx.execute<{ grade_id: string; n: number }>(sql`
    select grade_level_descriptor_id as grade_id, count(distinct student_user_id)::int as n
    from core.student_grades
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid and status = 'active'
      and (upper_inf(valid_during) or upper(valid_during) > ${input.from}::date)
    group by grade_level_descriptor_id`);
  return new Map(rows.map((row) => [row.grade_id, row.n]));
}
