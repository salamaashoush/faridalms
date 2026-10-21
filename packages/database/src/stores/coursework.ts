import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type {
  AssignmentState,
  Audience,
  LatePolicy,
  RecipientSource,
  QuizKeep,
  QuizReveal,
  SubmissionFormat,
  SubmissionState,
} from "../tables/coursework";
import type { ClassType } from "../tables/teaching";
import type { Scope } from "./students";

import { rosterOf, taughtClasses } from "./classes";
import { isoOf, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface AssignmentRow {
  id: string;
  version: number;
  orgId: string;
  classId: string;
  classType: ClassType;
  schoolYearId: string;
  gradingPeriodId: string | null;
  categoryId: string | null;
  authorUserId: string;
  title: string;
  state: AssignmentState;
  audience: Audience;
  availableFrom: string | null;
  dueAt: string | null;
  closesAt: string | null;
  latePolicy: LatePolicy;
  lateDeductionPercent: number | null;
  submissionFormat: SubmissionFormat;
  maxFiles: number;
  resubmission: boolean;
  points: number | null;
  rubric: Record<string, unknown> | null;
  quizAttempts: number | null;
  quizKeep: QuizKeep | null;
  quizReveal: QuizReveal | null;
  quizShuffle: boolean;
  quizTimeLimit: number | null;
  gradeAfterAnswers: boolean;
  publishedAt: string | null;
}

type AssignmentRecord = {
  id: string;
  version: number;
  org_id: string;
  class_id: string;
  class_type: ClassType;
  school_year_id: string;
  grading_period_id: string | null;
  category_id: string | null;
  author_user_id: string;
  title: string;
  state: AssignmentState;
  audience: Audience;
  available_from: string | null;
  due_at: string | null;
  closes_at: string | null;
  late_policy: LatePolicy;
  late_deduction_percent: number | null;
  submission_format: SubmissionFormat;
  max_files: number;
  resubmission: boolean;
  points: string | null;
  rubric: Record<string, unknown> | null;
  quiz_attempts: number | null;
  quiz_keep: QuizKeep | null;
  quiz_reveal: QuizReveal | null;
  quiz_shuffle: boolean;
  quiz_time_limit: number | null;
  grade_after_answers: boolean;
  published_at: string | null;
};

const assignmentColumns = sql`a.id, a.version, a.org_id, a.class_id, a.class_type, a.school_year_id,
  a.grading_period_id, a.category_id, a.author_user_id, a.title, a.state, a.audience,
  to_char(a.available_from at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as available_from,
  to_char(a.due_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as due_at,
  to_char(a.closes_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as closes_at,
  a.late_policy, a.late_deduction_percent, a.submission_format, a.max_files, a.resubmission,
  a.points::text as points, a.rubric, a.quiz_attempts, a.quiz_keep, a.quiz_reveal, a.quiz_shuffle,
  a.quiz_time_limit, a.grade_after_answers,
  to_char(a.published_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as published_at`;

function assignmentOf(row: AssignmentRecord): AssignmentRow {
  return {
    id: row.id,
    version: row.version,
    orgId: row.org_id,
    classId: row.class_id,
    classType: row.class_type,
    schoolYearId: row.school_year_id,
    gradingPeriodId: row.grading_period_id,
    categoryId: row.category_id,
    authorUserId: row.author_user_id,
    title: row.title,
    state: row.state,
    audience: row.audience,
    availableFrom: row.available_from,
    dueAt: row.due_at,
    closesAt: row.closes_at,
    latePolicy: row.late_policy,
    lateDeductionPercent: row.late_deduction_percent,
    submissionFormat: row.submission_format,
    maxFiles: row.max_files,
    resubmission: row.resubmission,
    points: row.points === null ? null : Number(row.points),
    rubric: row.rubric,
    quizAttempts: row.quiz_attempts,
    quizKeep: row.quiz_keep,
    quizReveal: row.quiz_reveal,
    quizShuffle: row.quiz_shuffle,
    quizTimeLimit: row.quiz_time_limit,
    gradeAfterAnswers: row.grade_after_answers,
    publishedAt: row.published_at,
  };
}

export async function assignmentById(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<AssignmentRow | null> {
  const [row] = await tx.execute<AssignmentRecord>(sql`
    select ${assignmentColumns} from core.assignments a
    where a.tenant_id = ${tenantId}::uuid and a.id = ${id}::uuid and a.status = 'active'`);
  return row ? assignmentOf(row) : null;
}

export interface AssignmentFields {
  title: string;
  audience: Audience;
  availableFrom: string | null;
  dueAt: string | null;
  closesAt: string | null;
  latePolicy: LatePolicy;
  lateDeductionPercent: number | null;
  submissionFormat: SubmissionFormat;
  maxFiles: number;
  resubmission: boolean;
  points: number | null;
  rubric: Record<string, unknown> | null;
  gradingPeriodId: string | null;
  categoryId: string | null;
  quizAttempts: number | null;
  quizKeep: QuizKeep | null;
  quizReveal: QuizReveal | null;
  quizShuffle: boolean;
  quizTimeLimit: number | null;
  gradeAfterAnswers: boolean;
}

export async function insertAssignment(
  tx: Tx,
  input: AssignmentFields & {
    tenantId: string;
    orgId: string;
    classRow: { id: string; classType: ClassType; schoolYearId: string };
    authorUserId: string;
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.assignments (tenant_id, org_id, class_id, class_type, school_year_id,
      grading_period_id, author_user_id, title, audience, available_from, due_at, closes_at,
      late_policy, late_deduction_percent, submission_format, max_files, resubmission, points, rubric,
      quiz_attempts, quiz_keep, quiz_reveal, quiz_shuffle, quiz_time_limit, category_id,
      grade_after_answers)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.classRow.id}::uuid,
      ${input.classRow.classType}, ${input.classRow.schoolYearId}::uuid,
      ${input.gradingPeriodId}::uuid, ${input.authorUserId}::uuid, ${input.title},
      ${input.audience}, ${input.availableFrom}::timestamptz, ${input.dueAt}::timestamptz,
      ${input.closesAt}::timestamptz, ${input.latePolicy}, ${input.lateDeductionPercent},
      ${input.submissionFormat}, ${input.maxFiles}, ${input.resubmission}, ${input.points},
      ${input.rubric}::jsonb, ${input.quizAttempts}, ${input.quizKeep}, ${input.quizReveal},
      ${input.quizShuffle}, ${input.quizTimeLimit}, ${input.categoryId}::uuid,
      ${input.gradeAfterAnswers})
    returning id, version`);
  if (!row) throw new Error("assignment was not created");
  return row;
}

/** Null when the assignment changed since the version the caller read. */
export async function updateAssignment(
  tx: Tx,
  input: AssignmentFields & {
    tenantId: string;
    id: string;
    expectedVersion: number;
    classRow: { id: string; classType: ClassType; schoolYearId: string };
  },
): Promise<{ version: number } | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.assignments
    set class_id = ${input.classRow.id}::uuid, class_type = ${input.classRow.classType},
        school_year_id = ${input.classRow.schoolYearId}::uuid,
        title = ${input.title}, audience = ${input.audience},
        available_from = ${input.availableFrom}::timestamptz, due_at = ${input.dueAt}::timestamptz,
        closes_at = ${input.closesAt}::timestamptz, late_policy = ${input.latePolicy},
        late_deduction_percent = ${input.lateDeductionPercent},
        submission_format = ${input.submissionFormat}, max_files = ${input.maxFiles},
        resubmission = ${input.resubmission}, points = ${input.points},
        rubric = ${input.rubric}::jsonb, grading_period_id = ${input.gradingPeriodId}::uuid,
        category_id = ${input.categoryId}::uuid,
        quiz_attempts = ${input.quizAttempts}, quiz_keep = ${input.quizKeep},
        quiz_reveal = ${input.quizReveal}, quiz_shuffle = ${input.quizShuffle},
        quiz_time_limit = ${input.quizTimeLimit},
        grade_after_answers = ${input.gradeAfterAnswers}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active' and state <> 'archived'
    returning version`);
  return row ?? null;
}

export async function setAssignmentState(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    state: AssignmentState;
  },
): Promise<{ version: number } | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.assignments
    set state = ${input.state},
        published_at = case when ${input.state} = 'published' then coalesce(published_at, statement_timestamp()) else published_at end,
        archived_at = case when ${input.state} = 'archived' then statement_timestamp() else null end
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row ?? null;
}

export interface TeacherListRow {
  id: string;
  title: string;
  state: AssignmentState;
  classId: string;
  classCode: string;
  classTitleEn: string | null;
  classTitleAr: string | null;
  availableFrom: string | null;
  dueAt: string | null;
  closesAt: string | null;
  latePolicy: LatePolicy;
  points: number | null;
  recipients: number;
  handedIn: number;
  toGrade: number;
  missing: number;
}

/**
 * Coursework in the classes the viewer reaches for a year, with the counts
 * its list shows: who it is for, who handed in, what waits for grading and
 * what is missing.
 */
export async function teacherAssignments(
  tx: Tx,
  scope: Scope,
  filter: {
    yearId: string;
    classId: string;
    q: string;
    now: Date;
    graceMs: number;
  },
): Promise<TeacherListRow[]> {
  const q = filter.q.trim();
  const now = filter.now.toISOString();
  const rows = await tx.execute<{
    id: string;
    title: string;
    state: AssignmentState;
    class_id: string;
    class_code: string;
    class_title_en: string | null;
    class_title_ar: string | null;
    available_from: string | null;
    due_at: string | null;
    closes_at: string | null;
    late_policy: LatePolicy;
    points: string | null;
    recipients: number;
    handed_in: number;
    to_grade: number;
    missing: number;
  }>(sql`
    with work as (
      select a.*, c.code as class_code, c.title_en as class_title_en, c.title_ar as class_title_ar
      from core.assignments a
      join core.classes c on c.tenant_id = a.tenant_id and c.id = a.class_id
      where a.tenant_id = ${scope.tenantId}::uuid and a.org_id = ${scope.schoolId}::uuid
        and a.school_year_id = ${filter.yearId}::uuid and a.status = 'active'
        and a.class_id in ${taughtClasses(scope)}
        and (${filter.classId === ""} or a.class_id = ${filter.classId || null}::uuid)
        and (${q === ""} or a.title ilike ${`%${q}%`})
    ), learners as (
      select r.assignment_id, r.student_user_id, coalesce(r.due_at, w.due_at) as due_at,
             s.excused, s.id as submission_id,
             (select t.id from core.submission_attempts t
               where t.tenant_id = r.tenant_id and t.submission_id = s.id and t.status = 'active'
               order by t.number desc limit 1) as attempt_id
      from core.assignment_recipients r
      join work w on w.id = r.assignment_id
      left join core.submissions s on s.tenant_id = r.tenant_id and s.assignment_id = r.assignment_id
        and s.student_user_id = r.student_user_id and s.status = 'active'
      where r.tenant_id = ${scope.tenantId}::uuid and r.status = 'active'
    )
    select w.id, w.title, w.state, w.class_id, w.class_code, w.class_title_en, w.class_title_ar,
      to_char(w.available_from at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as available_from,
      to_char(w.due_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as due_at,
      to_char(w.closes_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as closes_at,
      w.late_policy, w.points::text as points,
      count(l.student_user_id)::int as recipients,
      count(l.attempt_id)::int as handed_in,
      count(l.attempt_id) filter (where not coalesce(l.excused, false) and not exists (
        select 1 from core.assessments x
        where x.tenant_id = w.tenant_id and x.attempt_id = l.attempt_id and x.status = 'active'
          and (x.released_at is not null or x.comments_released_at is not null)))::int as to_grade,
      count(l.student_user_id) filter (where l.attempt_id is null and not coalesce(l.excused, false)
        and l.due_at is not null
        and l.due_at + ${filter.graceMs} * interval '1 millisecond' < ${now}::timestamptz)::int as missing
    from work w
    left join learners l on l.assignment_id = w.id
    group by w.id, w.title, w.state, w.class_id, w.class_code, w.class_title_en, w.class_title_ar,
      w.available_from, w.due_at, w.closes_at, w.late_policy, w.points, w.created_at
    order by w.due_at desc nulls first, w.created_at desc`);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    state: row.state,
    classId: row.class_id,
    classCode: row.class_code,
    classTitleEn: row.class_title_en,
    classTitleAr: row.class_title_ar,
    availableFrom: row.available_from,
    dueAt: row.due_at,
    closesAt: row.closes_at,
    latePolicy: row.late_policy,
    points: row.points === null ? null : Number(row.points),
    recipients: row.recipients,
    handedIn: row.handed_in,
    toGrade: row.to_grade,
    missing: row.missing,
  }));
}

export interface Selection {
  groupIds: string[];
  studentIds: string[];
}

/** The groups and students a draft was set to go to. */
export async function selectionOf(
  tx: Tx,
  tenantId: string,
  assignmentId: string,
): Promise<Selection> {
  const rows = await tx.execute<{
    source: RecipientSource;
    group_id: string | null;
    student_user_id: string;
  }>(sql`
    select source, group_id, student_user_id from core.assignment_recipients
    where tenant_id = ${tenantId}::uuid and assignment_id = ${assignmentId}::uuid and status = 'active'`);
  return {
    groupIds: [
      ...new Set(rows.flatMap((row) => (row.group_id ? [row.group_id] : []))),
    ],
    studentIds: rows
      .filter((row) => row.source === "student")
      .map((row) => row.student_user_id),
  };
}

/** Students on a class's roster on the date, through its homeroom if it follows one. */
/**
 * Records who the work is for. The class goes to its roster on the date;
 * a selection goes to the current members of its groups and to the students
 * named, provided they are on the roster. Recipients no longer included are
 * tombstoned, so work given to someone who later left stays on record.
 */
export async function setRecipients(
  tx: Tx,
  input: {
    tenantId: string;
    assignmentId: string;
    classId: string;
    audience: Audience;
    selection: Selection;
    on: string;
  },
): Promise<number> {
  const roster = new Set(
    await rosterOf(tx, input.tenantId, input.classId, input.on),
  );
  const wanted = new Map<
    string,
    { source: RecipientSource; groupId: string | null }
  >();
  if (input.audience === "class")
    for (const id of roster) wanted.set(id, { source: "class", groupId: null });
  else {
    const members = input.selection.groupIds.length
      ? await tx.execute<{ group_id: string; student_user_id: string }>(sql`
          select m.group_id, m.student_user_id from core.class_group_members m
          join core.class_groups g on g.tenant_id = m.tenant_id and g.id = m.group_id
          where m.tenant_id = ${input.tenantId}::uuid and m.status = 'active' and g.status = 'active'
            and g.class_id = ${input.classId}::uuid
            and m.group_id = any(${uuidArray(input.selection.groupIds)})`)
      : [];
    for (const row of members)
      if (roster.has(row.student_user_id))
        wanted.set(row.student_user_id, {
          source: "group",
          groupId: row.group_id,
        });
    for (const id of input.selection.studentIds)
      if (roster.has(id)) wanted.set(id, { source: "student", groupId: null });
  }
  const current = await tx.execute<{
    id: string;
    student_user_id: string;
    source: RecipientSource;
    group_id: string | null;
  }>(sql`
    select id, student_user_id, source, group_id from core.assignment_recipients
    where tenant_id = ${input.tenantId}::uuid and assignment_id = ${input.assignmentId}::uuid
      and status = 'active'`);
  for (const row of current) {
    const next = wanted.get(row.student_user_id);
    if (!next)
      await tx.execute(sql`
        update core.assignment_recipients set status = 'tobedeleted'
        where tenant_id = ${input.tenantId}::uuid and id = ${row.id}::uuid`);
    else if (next.source !== row.source || next.groupId !== row.group_id)
      await tx.execute(sql`
        update core.assignment_recipients set source = ${next.source}, group_id = ${next.groupId}::uuid
        where tenant_id = ${input.tenantId}::uuid and id = ${row.id}::uuid`);
    wanted.delete(row.student_user_id);
  }
  for (const [studentId, next] of wanted)
    await tx.execute(sql`
      insert into core.assignment_recipients (tenant_id, assignment_id, student_user_id, source, group_id)
      values (${input.tenantId}::uuid, ${input.assignmentId}::uuid, ${studentId}::uuid,
        ${next.source}, ${next.groupId}::uuid)`);
  const [count] = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from core.assignment_recipients
    where tenant_id = ${input.tenantId}::uuid and assignment_id = ${input.assignmentId}::uuid
      and status = 'active'`);
  return count?.n ?? 0;
}

/**
 * Gives chosen recipients a due time of their own, or the assignment's again
 * when `dueAt` is null. Returns how many recipients changed.
 */
export async function setRecipientDue(
  tx: Tx,
  input: {
    tenantId: string;
    assignmentId: string;
    studentIds: readonly string[];
    dueAt: string | null;
  },
): Promise<number> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.assignment_recipients set due_at = ${input.dueAt}::timestamptz
    where tenant_id = ${input.tenantId}::uuid and assignment_id = ${input.assignmentId}::uuid
      and student_user_id = any(${uuidArray(input.studentIds)}) and status = 'active'
    returning id`);
  return rows.length;
}

export async function isRecipient(
  tx: Tx,
  tenantId: string,
  assignmentId: string,
  studentId: string,
): Promise<{ dueAt: string | null } | null> {
  const [row] = await tx.execute<{ due_at: string | null }>(sql`
    select to_char(due_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as due_at
    from core.assignment_recipients
    where tenant_id = ${tenantId}::uuid and assignment_id = ${assignmentId}::uuid
      and student_user_id = ${studentId}::uuid and status = 'active'`);
  return row ? { dueAt: row.due_at } : null;
}

export interface WorkRow {
  studentId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  dueAt: string | null;
  /** The student has a due time of their own rather than the assignment's. */
  extended: boolean;
  submissionId: string | null;
  submissionVersion: number | null;
  state: SubmissionState | null;
  excused: boolean;
  needsRevision: boolean;
  hasDraft: boolean;
  attempts: number;
  attemptId: string | null;
  isLate: boolean;
  submittedAt: string | null;
  assessmentId: string | null;
  score: number | null;
  effectiveScore: number | null;
  released: boolean;
  /** The latest attempt is shared with the student's family. */
  shared: boolean;
  gradeScaleVersionId: string | null;
  /** Comments the student answered that wait for a grader's reply. */
  awaiting: number;
  /** Returned with its grade held until the student answers the comments. */
  held: boolean;
}

/**
 * Each recipient's standing on one assignment, or one student's when
 * `studentId` is given: their submission, latest attempt and its assessment.
 */
export async function studentWork(
  tx: Tx,
  input: { tenantId: string; assignmentId: string; studentId?: string },
): Promise<WorkRow[]> {
  const rows = await tx.execute<{
    student_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    due_at: string | null;
    extended: boolean;
    submission_id: string | null;
    submission_version: number | null;
    state: SubmissionState | null;
    excused: boolean | null;
    needs_revision: boolean | null;
    has_draft: boolean;
    attempts: number;
    attempt_id: string | null;
    is_late: boolean | null;
    submitted_at: string | null;
    assessment_id: string | null;
    score: string | null;
    effective_score: string | null;
    released: boolean | null;
    shared: boolean;
    grade_scale_version_id: string | null;
    awaiting: number;
    held: boolean;
  }>(sql`
    select r.student_user_id as student_id, u.full_name_en, u.full_name_ar,
      to_char(coalesce(r.due_at, a.due_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as due_at,
      r.due_at is not null as extended,
      s.id as submission_id, s.version as submission_version, s.state, s.excused, s.needs_revision,
      exists (select 1 from core.documents d where d.tenant_id = r.tenant_id and d.host_type = 'submission'
        and d.host_id = s.id and d.status = 'active' and d.plain_text <> '')
        or exists (select 1 from core.files f where f.tenant_id = r.tenant_id and f.host_type = 'submission'
          and f.host_id = s.id and f.status = 'active') as has_draft,
      (select count(*)::int from core.submission_attempts t
        where t.tenant_id = r.tenant_id and t.submission_id = s.id and t.status = 'active') as attempts,
      t.id as attempt_id, t.is_late,
      to_char(t.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as submitted_at,
      x.id as assessment_id, x.score::text as score, x.effective_score::text as effective_score,
      x.released_at is not null as released, x.grade_scale_version_id,
      x.comments_released_at is not null and x.released_at is null as held,
      exists (select 1 from core.family_shares h where h.tenant_id = r.tenant_id
        and h.attempt_id = t.id and h.status = 'active') as shared,
      -- Comments the student answered that no grader has replied to since:
      -- marked not understood, or with the student's reply last.
      (select count(*)::int from core.work_comments c
        where c.tenant_id = r.tenant_id and c.attempt_id = t.id and c.status = 'active'
          and (
            exists (select 1 from core.work_comment_answers a
              where a.tenant_id = c.tenant_id and a.comment_id = c.id
                and a.status = 'active' and a.state = 'unclear'
                and not exists (select 1 from core.work_comment_replies g
                  where g.tenant_id = c.tenant_id and g.comment_id = c.id
                    and g.status = 'active' and g.author_user_id <> r.student_user_id
                    and g.created_at > a.date_last_modified))
            or (select x.author_user_id from core.work_comment_replies x
                where x.tenant_id = c.tenant_id and x.comment_id = c.id
                  and x.status = 'active'
                order by x.created_at desc, x.id desc limit 1) = r.student_user_id)
      ) as awaiting
    from core.assignment_recipients r
    join core.assignments a on a.tenant_id = r.tenant_id and a.id = r.assignment_id
    join core.users u on u.tenant_id = r.tenant_id and u.id = r.student_user_id
    left join core.submissions s on s.tenant_id = r.tenant_id and s.assignment_id = r.assignment_id
      and s.student_user_id = r.student_user_id and s.status = 'active'
    left join lateral (
      select id, is_late, submitted_at from core.submission_attempts t
      where t.tenant_id = r.tenant_id and t.submission_id = s.id and t.status = 'active'
      order by t.number desc limit 1) t on true
    left join core.assessments x on x.tenant_id = r.tenant_id and x.attempt_id = t.id and x.status = 'active'
    where r.tenant_id = ${input.tenantId}::uuid and r.assignment_id = ${input.assignmentId}::uuid
      and r.status = 'active'
      and (${input.studentId ?? null}::uuid is null or r.student_user_id = ${input.studentId ?? null}::uuid)
    order by u.full_name_en, u.full_name_ar, r.student_user_id`);
  return rows.map((row) => ({
    studentId: row.student_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    dueAt: row.due_at,
    extended: row.extended,
    submissionId: row.submission_id,
    submissionVersion: row.submission_version,
    state: row.state,
    excused: row.excused ?? false,
    needsRevision: row.needs_revision ?? false,
    hasDraft: row.has_draft,
    attempts: row.attempts,
    attemptId: row.attempt_id,
    isLate: row.is_late ?? false,
    submittedAt: row.submitted_at,
    assessmentId: row.assessment_id,
    score: row.score === null ? null : Number(row.score),
    effectiveScore:
      row.effective_score === null ? null : Number(row.effective_score),
    released: row.released ?? false,
    shared: row.shared,
    gradeScaleVersionId: row.grade_scale_version_id,
    awaiting: row.awaiting,
    held: row.held,
  }));
}

/** Shares handed-in work with each student's family; sharing twice keeps one. */
export async function shareAttempts(
  tx: Tx,
  input: {
    tenantId: string;
    shares: readonly { attemptId: string; studentId: string }[];
    userId: string;
  },
): Promise<void> {
  for (const share of input.shares)
    await tx.execute(sql`
      insert into core.family_shares (tenant_id, attempt_id, student_user_id, shared_by_user_id)
      values (${input.tenantId}::uuid, ${share.attemptId}::uuid, ${share.studentId}::uuid,
        ${input.userId}::uuid)
      on conflict (tenant_id, attempt_id) where status = 'active' do nothing`);
}

export async function unshareAttempts(
  tx: Tx,
  input: { tenantId: string; attemptIds: readonly string[] },
): Promise<void> {
  if (input.attemptIds.length === 0) return;
  await tx.execute(sql`
    update core.family_shares set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and attempt_id = any(${uuidArray(input.attemptIds)})
      and status = 'active'`);
}

export async function isShared(
  tx: Tx,
  tenantId: string,
  attemptId: string,
): Promise<boolean> {
  const [row] = await tx.execute<{ shared: boolean }>(sql`
    select exists (select 1 from core.family_shares where tenant_id = ${tenantId}::uuid
      and attempt_id = ${attemptId}::uuid and status = 'active') as shared`);
  return row?.shared ?? false;
}

export interface SharedPiece {
  attemptId: string;
  assignmentId: string;
  title: string;
  classCode: string;
  sharedAt: string;
}

/** The work a student's teachers have shared with their family, newest first. */
export async function sharedWorkOf(
  tx: Tx,
  input: { tenantId: string; studentId: string },
): Promise<SharedPiece[]> {
  const rows = await tx.execute<{
    attempt_id: string;
    assignment_id: string;
    title: string;
    class_code: string;
    shared_at: string;
  }>(sql`
    select h.attempt_id, a.id as assignment_id, a.title, c.code as class_code,
      ${isoOf(sql`h.created_at`)} as shared_at
    from core.family_shares h
    join core.submission_attempts t on t.tenant_id = h.tenant_id and t.id = h.attempt_id
      and t.status = 'active'
    join core.submissions s on s.tenant_id = t.tenant_id and s.id = t.submission_id
    join core.assignments a on a.tenant_id = s.tenant_id and a.id = s.assignment_id
      and a.status = 'active'
    join core.classes c on c.tenant_id = a.tenant_id and c.id = a.class_id
    where h.tenant_id = ${input.tenantId}::uuid and h.student_user_id = ${input.studentId}::uuid
      and h.status = 'active'
    order by h.created_at desc
    limit 200`);
  return rows.map((row) => ({
    attemptId: row.attempt_id,
    assignmentId: row.assignment_id,
    title: row.title,
    classCode: row.class_code,
    sharedAt: row.shared_at,
  }));
}

/** The student's submission for the assignment, created the first time. */
export async function ensureSubmission(
  tx: Tx,
  input: { tenantId: string; assignmentId: string; studentId: string },
): Promise<{ id: string; version: number; state: SubmissionState }> {
  await tx.execute(sql`
    insert into core.submissions (tenant_id, assignment_id, student_user_id)
    select ${input.tenantId}::uuid, ${input.assignmentId}::uuid, ${input.studentId}::uuid
    where not exists (
      select 1 from core.submissions
      where tenant_id = ${input.tenantId}::uuid and assignment_id = ${input.assignmentId}::uuid
        and student_user_id = ${input.studentId}::uuid and status = 'active')
    on conflict do nothing`);
  const [row] = await tx.execute<{
    id: string;
    version: number;
    state: SubmissionState;
  }>(sql`
    select id, version, state from core.submissions
    where tenant_id = ${input.tenantId}::uuid and assignment_id = ${input.assignmentId}::uuid
      and student_user_id = ${input.studentId}::uuid and status = 'active'
    for update`);
  if (!row) throw new Error("submission was not created");
  return row;
}

export async function touchSubmission(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    state?: SubmissionState;
    needsRevision?: boolean;
    excused?: boolean;
  },
): Promise<{ version: number } | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.submissions
    set state = coalesce(${input.state ?? null}, state),
        needs_revision = coalesce(${input.needsRevision ?? null}::boolean, needs_revision),
        excused = coalesce(${input.excused ?? null}::boolean, excused)
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row ?? null;
}

export interface AttemptRow {
  id: string;
  number: number;
  isLate: boolean;
  submittedAt: string;
  /** A teacher handed it in for the student, as for work done on paper. */
  byTeacher: boolean;
}

export async function attemptsOf(
  tx: Tx,
  tenantId: string,
  submissionId: string,
): Promise<AttemptRow[]> {
  const rows = await tx.execute<{
    id: string;
    number: number;
    is_late: boolean;
    submitted_at: string;
    by_teacher: boolean;
  }>(sql`
    select id, number, is_late,
      to_char(submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as submitted_at,
      submitted_by_user_id <> student_user_id as by_teacher
    from core.submission_attempts
    where tenant_id = ${tenantId}::uuid and submission_id = ${submissionId}::uuid and status = 'active'
    order by number`);
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    isLate: row.is_late,
    submittedAt: row.submitted_at,
    byTeacher: row.by_teacher,
  }));
}

export async function insertAttempt(
  tx: Tx,
  input: {
    tenantId: string;
    submissionId: string;
    studentId: string;
    number: number;
    isLate: boolean;
    userId: string;
  },
): Promise<string> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.submission_attempts (tenant_id, submission_id, student_user_id, number,
      is_late, submitted_by_user_id)
    values (${input.tenantId}::uuid, ${input.submissionId}::uuid, ${input.studentId}::uuid,
      ${input.number}, ${input.isLate}, ${input.userId}::uuid)
    returning id`);
  if (!row) throw new Error("attempt was not recorded");
  return row.id;
}

/** An attempt is withdrawn only while nobody has assessed it. */
export async function withdrawAttempt(
  tx: Tx,
  tenantId: string,
  attemptId: string,
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.submission_attempts set status = 'tobedeleted'
    where tenant_id = ${tenantId}::uuid and id = ${attemptId}::uuid and status = 'active'
      and not exists (select 1 from core.assessments x where x.tenant_id = ${tenantId}::uuid
        and x.attempt_id = ${attemptId}::uuid and x.status = 'active')
    returning id`);
  return rows.length > 0;
}

export interface AssessmentRow {
  id: string;
  version: number;
  score: number | null;
  effectiveScore: number | null;
  rubricScores: Record<string, string> | null;
  rubricComments: Record<string, string> | null;
  feedback: string | null;
  privateNote: string | null;
  /** Null when a quiz marked itself. */
  gradedByUserId: string | null;
  releasedAt: string | null;
  commentsReleasedAt: string | null;
  gradedAt: string;
  gradeScaleVersionId: string | null;
}

export async function assessmentOf(
  tx: Tx,
  tenantId: string,
  attemptId: string,
): Promise<AssessmentRow | null> {
  const [row] = await tx.execute<{
    id: string;
    version: number;
    score: string | null;
    effective_score: string | null;
    rubric_scores: Record<string, string> | null;
    rubric_comments: Record<string, string> | null;
    feedback: string | null;
    private_note: string | null;
    graded_by_user_id: string | null;
    released_at: string | null;
    comments_released_at: string | null;
    graded_at: string;
    grade_scale_version_id: string | null;
  }>(sql`
    select id, version, score::text as score, effective_score::text as effective_score,
      rubric_scores, rubric_comments, feedback, private_note, graded_by_user_id,
      grade_scale_version_id,
      to_char(released_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as released_at,
      to_char(comments_released_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        as comments_released_at,
      to_char(graded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as graded_at
    from core.assessments
    where tenant_id = ${tenantId}::uuid and attempt_id = ${attemptId}::uuid and status = 'active'`);
  return row
    ? {
        id: row.id,
        version: row.version,
        score: row.score === null ? null : Number(row.score),
        effectiveScore:
          row.effective_score === null ? null : Number(row.effective_score),
        rubricScores: row.rubric_scores,
        rubricComments: row.rubric_comments,
        feedback: row.feedback,
        privateNote: row.private_note,
        gradedByUserId: row.graded_by_user_id,
        releasedAt: row.released_at,
        commentsReleasedAt: row.comments_released_at,
        gradedAt: row.graded_at,
        gradeScaleVersionId: row.grade_scale_version_id,
      }
    : null;
}

/** Saves the grader's draft judgement; it stays private until released. */
export async function saveAssessment(
  tx: Tx,
  input: {
    tenantId: string;
    attemptId: string;
    submissionId: string;
    studentId: string;
    score: number | null;
    effectiveScore: number | null;
    rubricScores: Record<string, string> | null;
    rubricComments: Record<string, string> | null;
    feedback: string | null;
    privateNote: string | null;
    /** Null when a quiz marked itself. */
    userId: string | null;
    /** The school's day, which picks the scale bands a new score is graded on. */
    today: string;
  },
): Promise<{ id: string; version: number }> {
  // A score keeps the bands it was first given under until the score itself
  // changes, so a school changing its scale leaves earlier grades as given.
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.assessments (tenant_id, attempt_id, submission_id, student_user_id, score,
      effective_score, rubric_scores, rubric_comments, feedback, private_note,
      graded_by_user_id, grade_scale_version_id)
    values (${input.tenantId}::uuid, ${input.attemptId}::uuid, ${input.submissionId}::uuid,
      ${input.studentId}::uuid, ${input.score}, ${input.effectiveScore}, ${input.rubricScores}::jsonb,
      ${input.rubricComments}::jsonb, ${input.feedback}, ${input.privateNote}, ${input.userId}::uuid,
      case when ${input.score}::numeric is null then null else (
        select app.scale_version_of(a.class_id, ${input.today}::date)
        from core.submissions s
        join core.assignments a on a.tenant_id = s.tenant_id and a.id = s.assignment_id
        where s.tenant_id = ${input.tenantId}::uuid and s.id = ${input.submissionId}::uuid) end)
    on conflict (tenant_id, attempt_id) where status = 'active' do update
      set score = excluded.score, effective_score = excluded.effective_score,
          rubric_scores = excluded.rubric_scores,
          rubric_comments = excluded.rubric_comments, feedback = excluded.feedback,
          private_note = excluded.private_note, graded_by_user_id = excluded.graded_by_user_id,
          grade_scale_version_id = case
            when core.assessments.score is not distinct from excluded.score
              and core.assessments.grade_scale_version_id is not null
            then core.assessments.grade_scale_version_id
            else excluded.grade_scale_version_id end,
          graded_at = statement_timestamp()
    returning id, version`);
  if (!row) throw new Error("assessment was not saved");
  return row;
}

export interface CommentRow {
  id: string;
  version: number;
  attemptId: string;
  authorId: string;
  authorNameEn: string | null;
  authorNameAr: string | null;
  anchor: Record<string, unknown>;
  body: string;
  kind: "fix" | "think" | "next" | null;
  criterionId: string | null;
  studentState: "fixed" | "unclear" | null;
  replies: ReplyRow[];
  createdAt: string;
  editedAt: string | null;
}

export interface ReplyRow {
  id: string;
  authorId: string;
  authorNameEn: string | null;
  authorNameAr: string | null;
  body: string;
  createdAt: string;
}

/** The comments on an attempt, in the order they were made. */
export async function commentsOf(
  tx: Tx,
  tenantId: string,
  attemptId: string,
): Promise<CommentRow[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    attempt_id: string;
    author_user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    anchor: Record<string, unknown>;
    body: string;
    kind: "fix" | "think" | "next" | null;
    criterion_id: string | null;
    student_state: "fixed" | "unclear" | null;
    created_at: string;
    edited_at: string | null;
  }>(sql`
    select c.id, c.version, c.attempt_id, c.author_user_id, u.full_name_en, u.full_name_ar,
      c.anchor, c.body, c.kind, c.criterion_id, a.state as student_state,
      ${isoOf(sql`c.created_at`)} as created_at,
      case when c.version > 1 then ${isoOf(sql`c.date_last_modified`)} end as edited_at
    from core.work_comments c
    join core.users u on u.tenant_id = c.tenant_id and u.id = c.author_user_id
    left join core.work_comment_answers a on a.tenant_id = c.tenant_id
      and a.comment_id = c.id and a.status = 'active'
    where c.tenant_id = ${tenantId}::uuid and c.attempt_id = ${attemptId}::uuid
      and c.status = 'active'
    order by c.created_at, c.id`);
  const replies = await tx.execute<{
    id: string;
    comment_id: string;
    author_user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    body: string;
    created_at: string;
  }>(sql`
    select r.id, r.comment_id, r.author_user_id, u.full_name_en, u.full_name_ar, r.body,
      ${isoOf(sql`r.created_at`)} as created_at
    from core.work_comment_replies r
    join core.work_comments c on c.tenant_id = r.tenant_id and c.id = r.comment_id
    join core.users u on u.tenant_id = r.tenant_id and u.id = r.author_user_id
    where r.tenant_id = ${tenantId}::uuid and c.attempt_id = ${attemptId}::uuid
      and r.status = 'active'
    order by r.created_at, r.id`);
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    attemptId: row.attempt_id,
    authorId: row.author_user_id,
    authorNameEn: row.full_name_en,
    authorNameAr: row.full_name_ar,
    anchor: row.anchor,
    body: row.body,
    kind: row.kind,
    criterionId: row.criterion_id,
    studentState: row.student_state,
    replies: replies
      .filter((reply) => reply.comment_id === row.id)
      .map((reply) => ({
        id: reply.id,
        authorId: reply.author_user_id,
        authorNameEn: reply.full_name_en,
        authorNameAr: reply.full_name_ar,
        body: reply.body,
        createdAt: reply.created_at,
      })),
    createdAt: row.created_at,
    editedAt: row.edited_at,
  }));
}

export async function commentById(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<{ id: string; attemptId: string; authorId: string } | null> {
  const [row] = await tx.execute<{
    id: string;
    attempt_id: string;
    author_user_id: string;
  }>(sql`
    select id, attempt_id, author_user_id from core.work_comments
    where tenant_id = ${tenantId}::uuid and id = ${id}::uuid and status = 'active'`);
  return row
    ? { id: row.id, attemptId: row.attempt_id, authorId: row.author_user_id }
    : null;
}

export async function insertComment(
  tx: Tx,
  input: {
    tenantId: string;
    attemptId: string;
    userId: string;
    anchor: Record<string, unknown>;
    body: string;
    bankCommentId: string | null;
    kind: string | null;
    criterionId: string | null;
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.work_comments (tenant_id, attempt_id, author_user_id, anchor, body,
      bank_comment_id, kind, criterion_id)
    values (${input.tenantId}::uuid, ${input.attemptId}::uuid, ${input.userId}::uuid,
      ${input.anchor}::jsonb, ${input.body}, ${input.bankCommentId}::uuid, ${input.kind},
      ${input.criterionId})
    returning id, version`);
  if (!row) throw new Error("comment was not saved");
  return row;
}

/** Null when someone changed or removed the comment since it was read. */
export async function updateComment(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    anchor: Record<string, unknown>;
    body: string;
    kind: string | null;
    criterionId: string | null;
  },
): Promise<{ id: string; version: number } | null> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    update core.work_comments set anchor = ${input.anchor}::jsonb, body = ${input.body},
      kind = ${input.kind}, criterion_id = ${input.criterionId}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning id, version`);
  return row ?? null;
}

/** Brings back a comment its writer just removed; false when there is none. */
export async function restoreComment(
  tx: Tx,
  input: { tenantId: string; id: string; userId: string },
): Promise<{ attemptId: string } | null> {
  const [row] = await tx.execute<{ attempt_id: string }>(sql`
    update core.work_comments set status = 'active'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and author_user_id = ${input.userId}::uuid and status = 'tobedeleted'
    returning attempt_id`);
  return row ? { attemptId: row.attempt_id } : null;
}

/** The student's answer to a comment, or none to take it back. */
export async function setCommentState(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    studentId: string;
    state: "fixed" | "unclear" | null;
  },
): Promise<void> {
  if (input.state === null) {
    await tx.execute(sql`
      update core.work_comment_answers set status = 'tobedeleted'
      where tenant_id = ${input.tenantId}::uuid and comment_id = ${input.id}::uuid
        and status = 'active'`);
    return;
  }
  await tx.execute(sql`
    insert into core.work_comment_answers (tenant_id, comment_id, student_user_id, state)
    values (${input.tenantId}::uuid, ${input.id}::uuid, ${input.studentId}::uuid,
      ${input.state})
    on conflict (tenant_id, comment_id) where status = 'active'
    do update set state = excluded.state`);
}

export async function insertReply(
  tx: Tx,
  input: { tenantId: string; commentId: string; userId: string; body: string },
): Promise<{ id: string }> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.work_comment_replies (tenant_id, comment_id, author_user_id, body)
    values (${input.tenantId}::uuid, ${input.commentId}::uuid, ${input.userId}::uuid,
      ${input.body})
    returning id`);
  if (!row) throw new Error("reply was not saved");
  return row;
}

export async function removeComment(
  tx: Tx,
  input: { tenantId: string; id: string; expectedVersion: number },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.work_comments set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning id`);
  return rows.length > 0;
}

export interface BankCommentRow {
  id: string;
  version: number;
  ownerId: string;
  body: string;
  shared: boolean;
  /** How often this grader has commented with it. */
  uses: number;
}

/** A grader's own and the school's shared comments, those they use most first. */
export async function bankCommentsOf(
  tx: Tx,
  input: { tenantId: string; orgId: string; userId: string },
): Promise<BankCommentRow[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    owner_user_id: string;
    body: string;
    shared: boolean;
    uses: number;
  }>(sql`
    select b.id, b.version, b.owner_user_id, b.body, b.shared,
      (select count(*)::int from core.work_comments c
        where c.tenant_id = b.tenant_id and c.bank_comment_id = b.id
          and c.author_user_id = ${input.userId}::uuid) as uses
    from core.bank_comments b
    where b.tenant_id = ${input.tenantId}::uuid and b.org_id = ${input.orgId}::uuid
      and b.status = 'active'
      and (b.owner_user_id = ${input.userId}::uuid or b.shared)
    order by uses desc, b.owner_user_id = ${input.userId}::uuid desc,
      b.date_last_modified desc
    limit 500`);
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    ownerId: row.owner_user_id,
    body: row.body,
    shared: row.shared,
    uses: row.uses,
  }));
}

export async function bankCommentById(
  tx: Tx,
  input: { tenantId: string; orgId: string; id: string },
): Promise<{ id: string; ownerId: string; shared: boolean } | null> {
  const [row] = await tx.execute<{
    id: string;
    owner_user_id: string;
    shared: boolean;
  }>(sql`
    select id, owner_user_id, shared from core.bank_comments
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and status = 'active'`);
  return row
    ? { id: row.id, ownerId: row.owner_user_id, shared: row.shared }
    : null;
}

export async function insertBankComment(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    userId: string;
    body: string;
    shared: boolean;
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.bank_comments (tenant_id, org_id, owner_user_id, body, shared)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.userId}::uuid,
      ${input.body}, ${input.shared})
    returning id, version`);
  if (!row) throw new Error("bank comment was not saved");
  return row;
}

/** Null when someone changed or removed the comment since it was read. */
export async function updateBankComment(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    body: string;
    shared: boolean;
  },
): Promise<{ id: string; version: number } | null> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    update core.bank_comments set body = ${input.body}, shared = ${input.shared}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning id, version`);
  return row ?? null;
}

export async function removeBankComment(
  tx: Tx,
  input: { tenantId: string; id: string; expectedVersion: number },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.bank_comments set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning id`);
  return rows.length > 0;
}

/** Returns the work with its grade held: the comments go out, the grade waits. */
export async function releaseComments(
  tx: Tx,
  tenantId: string,
  attemptIds: readonly string[],
): Promise<void> {
  if (attemptIds.length === 0) return;
  await tx.execute(sql`
    update core.assessments set comments_released_at = statement_timestamp()
    where tenant_id = ${tenantId}::uuid and attempt_id = any(${uuidArray(attemptIds)})
      and status = 'active' and released_at is null and comments_released_at is null`);
}

/** How many of an attempt's comments the student has not yet answered. */
export async function unansweredComments(
  tx: Tx,
  tenantId: string,
  attemptId: string,
): Promise<number> {
  const [row] = await tx.execute<{ count: number }>(sql`
    select count(*)::int as count from core.work_comments c
    where c.tenant_id = ${tenantId}::uuid and c.attempt_id = ${attemptId}::uuid
      and c.status = 'active'
      and not exists (select 1 from core.work_comment_answers a
        where a.tenant_id = c.tenant_id and a.comment_id = c.id and a.status = 'active')`);
  return row?.count ?? 0;
}

/** Releases the assessments of the given attempts, returning the work. */
export async function releaseAssessments(
  tx: Tx,
  tenantId: string,
  attemptIds: readonly string[],
): Promise<number> {
  if (attemptIds.length === 0) return 0;
  const rows = await tx.execute<{ id: string }>(sql`
    update core.assessments set released_at = statement_timestamp()
    where tenant_id = ${tenantId}::uuid and attempt_id = any(${uuidArray(attemptIds)})
      and status = 'active' and released_at is null
    returning id`);
  return rows.length;
}

export interface LearnerRow {
  assignmentId: string;
  title: string;
  classId: string;
  classTitleEn: string | null;
  classTitleAr: string | null;
  classCode: string;
  availableFrom: string | null;
  dueAt: string | null;
  closesAt: string | null;
  latePolicy: LatePolicy;
  submissionFormat: SubmissionFormat;
  points: number | null;
  excused: boolean;
  needsRevision: boolean;
  hasDraft: boolean;
  attemptId: string | null;
  isLate: boolean;
  submittedAt: string | null;
  released: boolean;
  releasedAt: string | null;
  effectiveScore: number | null;
  gradeScaleVersionId: string | null;
  /** Returned with its grade held until the student answers the comments. */
  held: boolean;
}

/** The published work a student was given in a year, with their standing on each. */
export async function learnerAssignments(
  tx: Tx,
  input: { tenantId: string; studentId: string; yearId: string },
): Promise<LearnerRow[]> {
  const rows = await tx.execute<{
    assignment_id: string;
    title: string;
    class_id: string;
    class_title_en: string | null;
    class_title_ar: string | null;
    class_code: string;
    available_from: string | null;
    due_at: string | null;
    closes_at: string | null;
    late_policy: LatePolicy;
    submission_format: SubmissionFormat;
    points: string | null;
    excused: boolean | null;
    needs_revision: boolean | null;
    has_draft: boolean;
    attempt_id: string | null;
    is_late: boolean | null;
    submitted_at: string | null;
    released_at: string | null;
    held: boolean | null;
    effective_score: string | null;
    grade_scale_version_id: string | null;
  }>(sql`
    select a.id as assignment_id, a.title, a.class_id, c.title_en as class_title_en,
      c.title_ar as class_title_ar, c.code as class_code,
      to_char(a.available_from at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as available_from,
      to_char(coalesce(r.due_at, a.due_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as due_at,
      to_char(a.closes_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as closes_at,
      a.late_policy, a.submission_format, a.points::text as points,
      s.excused, s.needs_revision,
      exists (select 1 from core.documents d where d.tenant_id = r.tenant_id and d.host_type = 'submission'
        and d.host_id = s.id and d.status = 'active' and d.plain_text <> '')
        or exists (select 1 from core.files f where f.tenant_id = r.tenant_id and f.host_type = 'submission'
          and f.host_id = s.id and f.status = 'active') as has_draft,
      t.id as attempt_id, t.is_late,
      to_char(t.submitted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as submitted_at,
      to_char(x.released_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as released_at,
      x.comments_released_at is not null and x.released_at is null as held,
      case when x.released_at is not null then x.effective_score::text end as effective_score,
      case when x.released_at is not null then x.grade_scale_version_id end as grade_scale_version_id
    from core.assignment_recipients r
    join core.assignments a on a.tenant_id = r.tenant_id and a.id = r.assignment_id
    join core.classes c on c.tenant_id = a.tenant_id and c.id = a.class_id
    left join core.submissions s on s.tenant_id = r.tenant_id and s.assignment_id = r.assignment_id
      and s.student_user_id = r.student_user_id and s.status = 'active'
    left join lateral (
      select id, is_late, submitted_at from core.submission_attempts t
      where t.tenant_id = r.tenant_id and t.submission_id = s.id and t.status = 'active'
      order by t.number desc limit 1) t on true
    left join core.assessments x on x.tenant_id = r.tenant_id and x.attempt_id = t.id and x.status = 'active'
    where r.tenant_id = ${input.tenantId}::uuid and r.student_user_id = ${input.studentId}::uuid
      and r.status = 'active' and a.status = 'active' and a.state = 'published'
      and a.school_year_id = ${input.yearId}::uuid
    order by coalesce(r.due_at, a.due_at) nulls last, a.title`);
  return rows.map((row) => ({
    assignmentId: row.assignment_id,
    title: row.title,
    classId: row.class_id,
    classTitleEn: row.class_title_en,
    classTitleAr: row.class_title_ar,
    classCode: row.class_code,
    availableFrom: row.available_from,
    dueAt: row.due_at,
    closesAt: row.closes_at,
    latePolicy: row.late_policy,
    submissionFormat: row.submission_format,
    points: row.points === null ? null : Number(row.points),
    excused: row.excused ?? false,
    needsRevision: row.needs_revision ?? false,
    hasDraft: row.has_draft,
    attemptId: row.attempt_id,
    isLate: row.is_late ?? false,
    submittedAt: row.submitted_at,
    released: row.released_at !== null,
    releasedAt: row.released_at,
    held: row.held ?? false,
    effectiveScore:
      row.effective_score === null ? null : Number(row.effective_score),
    gradeScaleVersionId: row.grade_scale_version_id,
  }));
}

export interface GroupRow {
  id: string;
  version: number;
  titleEn: string | null;
  titleAr: string | null;
  studentIds: string[];
}

export async function groupsOf(
  tx: Tx,
  tenantId: string,
  classId: string,
): Promise<GroupRow[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    title_en: string | null;
    title_ar: string | null;
    student_ids: string[] | null;
  }>(sql`
    select g.id, g.version, g.title_en, g.title_ar,
      array(select m.student_user_id from core.class_group_members m
        where m.tenant_id = g.tenant_id and m.group_id = g.id and m.status = 'active')::text[] as student_ids
    from core.class_groups g
    where g.tenant_id = ${tenantId}::uuid and g.class_id = ${classId}::uuid and g.status = 'active'
    order by coalesce(g.title_en, g.title_ar), g.id`);
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    titleEn: row.title_en,
    titleAr: row.title_ar,
    studentIds: row.student_ids ?? [],
  }));
}

export async function saveGroup(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    id?: string;
    classRow: { id: string; classType: ClassType; schoolYearId: string };
    titleEn: string | null;
    titleAr: string | null;
    studentIds: readonly string[];
    userId: string;
  },
): Promise<string> {
  let groupId = input.id;
  if (groupId)
    await tx.execute(sql`
      update core.class_groups set title_en = ${input.titleEn}, title_ar = ${input.titleAr}
      where tenant_id = ${input.tenantId}::uuid and id = ${groupId}::uuid`);
  else {
    const [row] = await tx.execute<{ id: string }>(sql`
      insert into core.class_groups (tenant_id, org_id, class_id, class_type, school_year_id,
        title_en, title_ar, created_by_user_id)
      values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.classRow.id}::uuid,
        ${input.classRow.classType}, ${input.classRow.schoolYearId}::uuid, ${input.titleEn},
        ${input.titleAr}, ${input.userId}::uuid)
      returning id`);
    if (!row) throw new Error("group was not created");
    groupId = row.id;
  }
  await tx.execute(sql`
    update core.class_group_members set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and group_id = ${groupId}::uuid and status = 'active'
      and not (student_user_id = any(${uuidArray(input.studentIds)}))`);
  await tx.execute(sql`
    insert into core.class_group_members (tenant_id, group_id, student_user_id)
    select ${input.tenantId}::uuid, ${groupId}::uuid, id from unnest(${uuidArray(input.studentIds)}) as id
    where not exists (select 1 from core.class_group_members m
      where m.tenant_id = ${input.tenantId}::uuid and m.group_id = ${groupId}::uuid
        and m.student_user_id = id and m.status = 'active')`);
  return groupId;
}

export async function removeGroup(tx: Tx, tenantId: string, id: string) {
  await tx.execute(sql`
    update core.class_groups set status = 'tobedeleted'
    where tenant_id = ${tenantId}::uuid and id = ${id}::uuid`);
}

export interface RubricRow {
  id: string;
  version: number;
  title: string;
  criteria: Record<string, unknown>;
}

export async function rubricsOf(
  tx: Tx,
  tenantId: string,
  ownerId: string,
): Promise<RubricRow[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    title: string;
    criteria: Record<string, unknown>;
  }>(sql`
    select id, version, title, criteria from core.rubrics
    where tenant_id = ${tenantId}::uuid and owner_user_id = ${ownerId}::uuid and status = 'active'
    order by title, id`);
  return rows;
}

export async function saveRubric(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    id?: string;
    ownerId: string;
    title: string;
    criteria: Record<string, unknown>;
  },
): Promise<string | null> {
  if (input.id) {
    const rows = await tx.execute<{ id: string }>(sql`
      update core.rubrics set title = ${input.title}, criteria = ${input.criteria}::jsonb
      where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
        and owner_user_id = ${input.ownerId}::uuid and status = 'active'
      returning id`);
    return rows[0]?.id ?? null;
  }
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.rubrics (tenant_id, org_id, owner_user_id, title, criteria)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.ownerId}::uuid, ${input.title},
      ${input.criteria}::jsonb)
    returning id`);
  return row?.id ?? null;
}

/**
 * The class and student behind a coursework file host: an assignment's
 * resources, a draft or a handed-in attempt.
 */
export async function courseworkHost(
  tx: Tx,
  tenantId: string,
  host: { type: string; id: string },
): Promise<{
  assignmentId: string;
  classId: string;
  studentId: string | null;
} | null> {
  const [row] = await tx.execute<{
    assignment_id: string;
    class_id: string;
    student_id: string | null;
  }>(
    host.type === "assignment"
      ? sql`select a.id as assignment_id, a.class_id, null::uuid as student_id from core.assignments a
          where a.tenant_id = ${tenantId}::uuid and a.id = ${host.id}::uuid`
      : host.type === "submission"
        ? sql`select a.id as assignment_id, a.class_id, s.student_user_id as student_id
            from core.submissions s
            join core.assignments a on a.tenant_id = s.tenant_id and a.id = s.assignment_id
            where s.tenant_id = ${tenantId}::uuid and s.id = ${host.id}::uuid`
        : sql`select a.id as assignment_id, a.class_id, t.student_user_id as student_id
            from core.submission_attempts t
            join core.submissions s on s.tenant_id = t.tenant_id and s.id = t.submission_id
            join core.assignments a on a.tenant_id = s.tenant_id and a.id = s.assignment_id
            where t.tenant_id = ${tenantId}::uuid and t.id = ${host.id}::uuid`,
  );
  return row
    ? {
        assignmentId: row.assignment_id,
        classId: row.class_id,
        studentId: row.student_id,
      }
    : null;
}

export async function attemptById(
  tx: Tx,
  tenantId: string,
  attemptId: string,
): Promise<{
  submissionId: string;
  studentId: string;
  assignmentId: string;
  number: number;
  isLate: boolean;
} | null> {
  const [row] = await tx.execute<{
    submission_id: string;
    student_id: string;
    assignment_id: string;
    number: number;
    is_late: boolean;
  }>(sql`
    select t.submission_id, t.student_user_id as student_id, s.assignment_id, t.number, t.is_late
    from core.submission_attempts t
    join core.submissions s on s.tenant_id = t.tenant_id and s.id = t.submission_id
    where t.tenant_id = ${tenantId}::uuid and t.id = ${attemptId}::uuid and t.status = 'active'`);
  return row
    ? {
        submissionId: row.submission_id,
        studentId: row.student_id,
        assignmentId: row.assignment_id,
        number: row.number,
        isLate: row.is_late,
      }
    : null;
}

export async function namesOf(
  tx: Tx,
  tenantId: string,
  ids: readonly string[],
): Promise<
  { id: string; fullNameEn: string | null; fullNameAr: string | null }[]
> {
  if (ids.length === 0) return [];
  const rows = await tx.execute<{
    id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
  }>(sql`
    select id, full_name_en, full_name_ar from core.users
    where tenant_id = ${tenantId}::uuid and id = any(${uuidArray(ids)})
    order by full_name_en, full_name_ar, id`);
  return rows.map((row) => ({
    id: row.id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
  }));
}

/** The student a piece of work belongs to, for files hosted on it. */
export async function studentOf(
  tx: Tx,
  tenantId: string,
  file: { hostType: string | null; hostId: string | null },
): Promise<string | null> {
  if (file.hostType !== "submission" && file.hostType !== "submission_attempt")
    return null;
  const table =
    file.hostType === "submission"
      ? sql`core.submissions`
      : sql`core.submission_attempts`;
  const [row] = await tx.execute<{ student_user_id: string }>(sql`
    select student_user_id from ${table}
    where tenant_id = ${tenantId}::uuid and id = ${file.hostId}::uuid`);
  return row?.student_user_id ?? null;
}

export interface PortfolioRow {
  assignmentId: string;
  title: string;
  classCode: string;
  attemptId: string;
  submittedAt: string;
  isLate: boolean;
}

/**
 * Every piece of work a student has handed in, in any year, with its
 * latest attempt: what their portfolio holds.
 */
export async function handedInWork(
  tx: Tx,
  input: { tenantId: string; orgId: string; studentId: string },
): Promise<PortfolioRow[]> {
  const rows = await tx.execute<{
    assignment_id: string;
    title: string;
    class_code: string;
    attempt_id: string;
    submitted_at: string;
    is_late: boolean;
  }>(sql`
    select a.id as assignment_id, a.title, c.code as class_code, t.id as attempt_id,
      ${isoOf(sql`t.submitted_at`)} as submitted_at, t.is_late
    from core.submissions s
    join core.assignments a on a.tenant_id = s.tenant_id and a.id = s.assignment_id
      and a.status = 'active' and a.org_id = ${input.orgId}::uuid
    join core.classes c on c.tenant_id = a.tenant_id and c.id = a.class_id
    join lateral (
      select id, is_late, submitted_at from core.submission_attempts t
      where t.tenant_id = s.tenant_id and t.submission_id = s.id and t.status = 'active'
      order by t.number desc limit 1) t on true
    where s.tenant_id = ${input.tenantId}::uuid and s.student_user_id = ${input.studentId}::uuid
      and s.status = 'active'
    order by t.submitted_at, a.id`);
  return rows.map((row) => ({
    assignmentId: row.assignment_id,
    title: row.title,
    classCode: row.class_code,
    attemptId: row.attempt_id,
    submittedAt: row.submitted_at,
    isLate: row.is_late,
  }));
}
