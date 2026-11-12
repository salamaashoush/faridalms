import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { uuidArray } from "./sql";

type Tx = CellTransaction;

export interface PeriodGradeRow {
  id: string;
  studentId: string;
  score: number | null;
  maxScore: number;
  comment: string | null;
  releasedAt: string | null;
  gradeScaleVersionId: string | null;
}

export async function periodGradesOf(
  tx: Tx,
  input: { tenantId: string; classId: string; periodId: string },
): Promise<PeriodGradeRow[]> {
  const rows = await tx.execute<{
    id: string;
    student_id: string;
    score: string | null;
    max_score: string;
    comment: string | null;
    released_at: string | null;
    grade_scale_version_id: string | null;
  }>(sql`
    select id, student_user_id as student_id, score::text as score, max_score::text as max_score,
      comment, grade_scale_version_id, to_char(released_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as released_at
    from core.period_grades
    where tenant_id = ${input.tenantId}::uuid and class_id = ${input.classId}::uuid
      and grading_period_id = ${input.periodId}::uuid and status = 'active'`);
  return rows.map((row) => ({
    id: row.id,
    studentId: row.student_id,
    score: row.score === null ? null : Number(row.score),
    maxScore: Number(row.max_score),
    comment: row.comment,
    releasedAt: row.released_at,
    gradeScaleVersionId: row.grade_scale_version_id,
  }));
}

/**
 * Records a student's grade for the term. A changed grade that families
 * already saw goes back to unreleased until it is released again.
 */
export async function savePeriodGrade(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    classId: string;
    periodId: string;
    studentId: string;
    score: number | null;
    maxScore: number;
    comment: string | null;
    userId: string;
    /** The school's day, which picks the scale bands a new score is graded on. */
    today: string;
  },
): Promise<{
  before: {
    score: number | null;
    maxScore: number;
    comment: string | null;
  } | null;
}> {
  const rows = await tx.execute<{
    score: string | null;
    max_score: string;
    comment: string | null;
  }>(sql`
    with was as (
      select score, max_score, comment from core.period_grades
      where tenant_id = ${input.tenantId}::uuid and class_id = ${input.classId}::uuid
        and grading_period_id = ${input.periodId}::uuid
        and student_user_id = ${input.studentId}::uuid and status = 'active'
    ), saved as (
    insert into core.period_grades (tenant_id, org_id, class_id, grading_period_id, student_user_id, score, max_score, comment, recorded_by_user_id,
      grade_scale_version_id)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.classId}::uuid,
      ${input.periodId}::uuid,
      ${input.studentId}::uuid, ${input.score}, ${input.maxScore}, ${input.comment},
      ${input.userId}::uuid,
      case when ${input.score}::numeric is null then null
        else app.scale_version_of(${input.classId}::uuid, ${input.today}::date) end)
    on conflict (tenant_id, class_id, grading_period_id, student_user_id) where status = 'active'
    do update set
      released_at = case
        when core.period_grades.score is distinct from excluded.score
          or core.period_grades.comment is distinct from excluded.comment then null
        else core.period_grades.released_at end,
      grade_scale_version_id = case
        when core.period_grades.score is not distinct from excluded.score
          and core.period_grades.max_score = excluded.max_score
          and core.period_grades.grade_scale_version_id is not null
        then core.period_grades.grade_scale_version_id
        else excluded.grade_scale_version_id end,
      score = excluded.score, max_score = excluded.max_score, comment = excluded.comment,
      recorded_by_user_id = excluded.recorded_by_user_id
    returning 1)
    select was.score, was.max_score, was.comment from was`);
  const was = rows[0];
  return {
    before: was
      ? {
          score: was.score === null ? null : Number(was.score),
          maxScore: Number(was.max_score),
          comment: was.comment,
        }
      : null,
  };
}

/** Releases a class's recorded grades for a period, answering whose went out. */
export async function releasePeriodGrades(
  tx: Tx,
  input: { tenantId: string; classId: string; periodId: string },
): Promise<string[]> {
  const rows = await tx.execute<{ student_user_id: string }>(sql`
    update core.period_grades set released_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and class_id = ${input.classId}::uuid
      and grading_period_id = ${input.periodId}::uuid and status = 'active'
      and released_at is null and score is not null
    returning student_user_id`);
  return rows.map((row) => row.student_user_id);
}

export interface StudentGradeRow {
  classId: string;
  classCode: string;
  classTitleEn: string | null;
  classTitleAr: string | null;
  subjectId: string | null;
  periodId: string;
  periodTitleEn: string | null;
  periodTitleAr: string | null;
  score: number | null;
  maxScore: number;
  comment: string | null;
  gradeScaleVersionId: string | null;
}

/** A student's released term grades in a year, by class and term. */
export async function studentPeriodGrades(
  tx: Tx,
  input: { tenantId: string; studentId: string; yearId: string },
): Promise<StudentGradeRow[]> {
  const rows = await tx.execute<{
    class_id: string;
    class_code: string;
    class_title_en: string | null;
    class_title_ar: string | null;
    subject_id: string | null;
    period_id: string;
    period_title_en: string | null;
    period_title_ar: string | null;
    score: string | null;
    max_score: string;
    comment: string | null;
    grade_scale_version_id: string | null;
  }>(sql`
    select g.class_id, c.code as class_code, c.title_en as class_title_en, c.title_ar as class_title_ar,
      c.subject_descriptor_id as subject_id, g.grading_period_id as period_id,
      p.title_en as period_title_en, p.title_ar as period_title_ar,
      g.score::text as score, g.max_score::text as max_score, g.comment,
      g.grade_scale_version_id
    from core.period_grades g
    join core.classes c on c.tenant_id = g.tenant_id and c.id = g.class_id
    join core.academic_sessions p on p.tenant_id = g.tenant_id and p.id = g.grading_period_id
    where g.tenant_id = ${input.tenantId}::uuid and g.student_user_id = ${input.studentId}::uuid
      and p.school_year_id = ${input.yearId}::uuid and g.status = 'active'
      and g.released_at is not null
    order by c.code, lower(p.span)`);
  return rows.map((row) => ({
    classId: row.class_id,
    classCode: row.class_code,
    classTitleEn: row.class_title_en,
    classTitleAr: row.class_title_ar,
    subjectId: row.subject_id,
    periodId: row.period_id,
    periodTitleEn: row.period_title_en,
    periodTitleAr: row.period_title_ar,
    score: row.score === null ? null : Number(row.score),
    maxScore: Number(row.max_score),
    comment: row.comment,
    gradeScaleVersionId: row.grade_scale_version_id,
  }));
}

/** The term each of these assignments counts toward, for those given one. */
export async function termsOfWork(
  tx: Tx,
  input: { tenantId: string; assignmentIds: readonly string[] },
): Promise<Map<string, string>> {
  if (input.assignmentIds.length === 0) return new Map();
  const rows = await tx.execute<{
    assignment_id: string;
    grading_period_id: string;
  }>(sql`
    select assignment_id, grading_period_id from core.assignment_terms
    where tenant_id = ${input.tenantId}::uuid and status = 'active'
      and assignment_id = any(${uuidArray(input.assignmentIds)})`);
  return new Map(rows.map((row) => [row.assignment_id, row.grading_period_id]));
}

/** Sets the term an assignment counts toward, or takes it out of every term. */
export async function setTermOfWork(
  tx: Tx,
  input: { tenantId: string; assignmentId: string; periodId: string | null },
): Promise<void> {
  await tx.execute(sql`
    update core.assignment_terms set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and assignment_id = ${input.assignmentId}::uuid
      and status = 'active'
      and grading_period_id is distinct from ${input.periodId}::uuid`);
  if (input.periodId)
    await tx.execute(sql`
      insert into core.assignment_terms (tenant_id, assignment_id, grading_period_id)
      values (${input.tenantId}::uuid, ${input.assignmentId}::uuid, ${input.periodId}::uuid)
      on conflict (tenant_id, assignment_id) where status = 'active' do nothing`);
}

/**
 * Grades a term's work again on the bands in force today: its term grades
 * and the scores of the work set for it. Only what has a score changes.
 */
export async function regradeTerm(
  tx: Tx,
  input: { tenantId: string; orgId: string; periodId: string; today: string },
): Promise<{ terms: number; work: number }> {
  const terms = await tx.execute<{ id: string }>(sql`
    update core.period_grades g
    set grade_scale_version_id = app.scale_version_of(g.class_id, ${input.today}::date)
    where g.tenant_id = ${input.tenantId}::uuid and g.org_id = ${input.orgId}::uuid
      and g.grading_period_id = ${input.periodId}::uuid and g.status = 'active'
      and g.score is not null
    returning g.id`);
  const work = await tx.execute<{ id: string }>(sql`
    update core.assessments x
    set grade_scale_version_id = app.scale_version_of(a.class_id, ${input.today}::date)
    from core.submissions s
    join core.assignments a on a.tenant_id = s.tenant_id and a.id = s.assignment_id
    join core.assignment_terms w on w.tenant_id = a.tenant_id and w.assignment_id = a.id
      and w.status = 'active'
    where x.tenant_id = ${input.tenantId}::uuid and s.tenant_id = x.tenant_id
      and s.id = x.submission_id and a.org_id = ${input.orgId}::uuid
      and w.grading_period_id = ${input.periodId}::uuid and x.status = 'active'
      and x.score is not null
    returning x.id`);
  return { terms: terms.length, work: work.length };
}
