import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

type Tx = CellTransaction;

export interface ResultCell {
  assignmentId: string;
  studentId: string;
  score: number | null;
  effectiveScore: number | null;
  released: boolean;
  isLate: boolean;
  excused: boolean;
  gradeScaleVersionId: string | null;
}

/** Every recipient's latest result on the class's published work. */
export async function classResults(
  tx: Tx,
  tenantId: string,
  classId: string,
): Promise<ResultCell[]> {
  const rows = await tx.execute<{
    assignment_id: string;
    student_id: string;
    score: string | null;
    effective_score: string | null;
    released: boolean | null;
    is_late: boolean | null;
    excused: boolean | null;
    grade_scale_version_id: string | null;
  }>(sql`
    select r.assignment_id, r.student_user_id as student_id, x.score::text as score,
      x.effective_score::text as effective_score, x.released_at is not null as released,
      t.is_late, s.excused, x.grade_scale_version_id
    from core.assignment_recipients r
    join core.assignments a on a.tenant_id = r.tenant_id and a.id = r.assignment_id
    left join core.submissions s on s.tenant_id = r.tenant_id and s.assignment_id = r.assignment_id
      and s.student_user_id = r.student_user_id and s.status = 'active'
    left join lateral (
      select id, is_late from core.submission_attempts t
      where t.tenant_id = r.tenant_id and t.submission_id = s.id and t.status = 'active'
      order by t.number desc limit 1) t on true
    left join core.assessments x on x.tenant_id = r.tenant_id and x.attempt_id = t.id and x.status = 'active'
    where r.tenant_id = ${tenantId}::uuid and a.class_id = ${classId}::uuid and r.status = 'active'
      and a.status = 'active' and a.state <> 'draft'`);
  return rows.map((row) => ({
    assignmentId: row.assignment_id,
    studentId: row.student_id,
    score: row.score === null ? null : Number(row.score),
    effectiveScore:
      row.effective_score === null ? null : Number(row.effective_score),
    released: row.released ?? false,
    isLate: row.is_late ?? false,
    excused: row.excused ?? false,
    gradeScaleVersionId: row.grade_scale_version_id,
  }));
}

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
    classRow: { id: string; classType: string; schoolYearId: string };
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
      where tenant_id = ${input.tenantId}::uuid and class_id = ${input.classRow.id}::uuid
        and grading_period_id = ${input.periodId}::uuid
        and student_user_id = ${input.studentId}::uuid and status = 'active'
    ), saved as (
    insert into core.period_grades (tenant_id, org_id, class_id, class_type, school_year_id,
      grading_period_id, student_user_id, score, max_score, comment, recorded_by_user_id,
      grade_scale_version_id)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.classRow.id}::uuid,
      ${input.classRow.classType}, ${input.classRow.schoolYearId}::uuid, ${input.periodId}::uuid,
      ${input.studentId}::uuid, ${input.score}, ${input.maxScore}, ${input.comment},
      ${input.userId}::uuid,
      case when ${input.score}::numeric is null then null
        else app.scale_version_of(${input.classRow.id}::uuid, ${input.today}::date) end)
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
      and g.school_year_id = ${input.yearId}::uuid and g.status = 'active'
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

/** A class's published work, the gradebook's columns, in due order. */
export async function classWork(
  tx: Tx,
  tenantId: string,
  classId: string,
): Promise<
  {
    id: string;
    title: string;
    dueAt: string | null;
    points: number | null;
    gradingPeriodId: string | null;
    categoryId: string | null;
  }[]
> {
  const rows = await tx.execute<{
    id: string;
    title: string;
    due_at: string | null;
    points: string | null;
    grading_period_id: string | null;
    category_id: string | null;
  }>(sql`
    select id, title, points::text as points, grading_period_id, category_id,
      to_char(due_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as due_at
    from core.assignments
    where tenant_id = ${tenantId}::uuid and class_id = ${classId}::uuid
      and status = 'active' and state <> 'draft'
    order by due_at nulls last, created_at`);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    dueAt: row.due_at,
    points: row.points === null ? null : Number(row.points),
    gradingPeriodId: row.grading_period_id,
    categoryId: row.category_id,
  }));
}
