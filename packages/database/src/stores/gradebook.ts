import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

type Tx = CellTransaction;

export interface ResultCell {
  assignmentId: string;
  studentId: string;
  score: number | null;
  effectiveScore: number | null;
  released: boolean;
  /** An attempt is in, whether or not it has been marked. */
  handedIn: boolean;
  isLate: boolean;
  excused: boolean;
  /** When this student's work is due: their own extension, else the work's. */
  dueAt: string | null;
  gradeScaleVersionId: string | null;
}

/** Every recipient's latest result on the class's published work, or one student's. */
export async function classResults(
  tx: Tx,
  tenantId: string,
  classId: string,
  studentId: string | null = null,
): Promise<ResultCell[]> {
  const rows = await tx.execute<{
    assignment_id: string;
    student_id: string;
    score: string | null;
    effective_score: string | null;
    released: boolean | null;
    handed_in: boolean;
    is_late: boolean | null;
    excused: boolean | null;
    due_at: string | null;
    grade_scale_version_id: string | null;
  }>(sql`
    select r.assignment_id, r.student_user_id as student_id, x.score::text as score,
      x.effective_score::text as effective_score, x.released_at is not null as released,
      t.id is not null as handed_in, t.is_late, s.excused, x.grade_scale_version_id,
      to_char(coalesce(r.due_at, a.due_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as due_at
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
      and a.status = 'active' and a.state <> 'draft'
      and (${studentId}::uuid is null or r.student_user_id = ${studentId}::uuid)`);
  return rows.map((row) => ({
    assignmentId: row.assignment_id,
    studentId: row.student_id,
    score: row.score === null ? null : Number(row.score),
    effectiveScore:
      row.effective_score === null ? null : Number(row.effective_score),
    released: row.released ?? false,
    handedIn: row.handed_in,
    isLate: row.is_late ?? false,
    excused: row.excused ?? false,
    dueAt: row.due_at,
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
    categoryId: string | null;
  }[]
> {
  const rows = await tx.execute<{
    id: string;
    title: string;
    due_at: string | null;
    points: string | null;
    category_id: string | null;
  }>(sql`
    select id, title, points::text as points, category_id,
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
    categoryId: row.category_id,
  }));
}

/** Whether classes show learners their running grade where the teacher has not chosen. */
export async function gradebookSettingsOf(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<{ runningShown: boolean; version: number }> {
  const [row] = await tx.execute<{
    running_shown: boolean;
    version: number;
  }>(sql`
    select running_shown, version from core.gradebook_settings
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and status = 'active'`);
  return row
    ? { runningShown: row.running_shown, version: row.version }
    : { runningShown: false, version: 0 };
}

/**
 * Sets whether new classes show learners their running grade, if nobody
 * changed it since `expectedVersion`. Every class that follows the
 * default keeps what it shows now, so only classes made afterwards follow
 * the new one. Null when the version moved on.
 */
export async function saveRunningDefault(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    runningShown: boolean;
    expectedVersion: number;
  },
): Promise<{ version: number; kept: number } | null> {
  const current = await gradebookSettingsOf(tx, input);
  if (current.version !== input.expectedVersion) return null;
  const kept = await tx.execute<{ id: string }>(sql`
    insert into core.class_running_grades (tenant_id, org_id, class_id, shown)
    select c.tenant_id, c.org_id, c.id, ${current.runningShown}
    from core.classes c
    where c.tenant_id = ${input.tenantId}::uuid and c.org_id = ${input.orgId}::uuid
      and c.status = 'active'
      and not exists (select 1 from core.class_running_grades g
        where g.tenant_id = c.tenant_id and g.class_id = c.id and g.status = 'active')
    returning id`);
  const [row] =
    input.expectedVersion === 0
      ? await tx.execute<{ version: number }>(sql`
          insert into core.gradebook_settings (tenant_id, org_id, running_shown)
          values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.runningShown})
          on conflict do nothing
          returning version`)
      : await tx.execute<{ version: number }>(sql`
          update core.gradebook_settings set running_shown = ${input.runningShown}
          where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
            and status = 'active' and version = ${input.expectedVersion}
          returning version`);
  return row ? { version: row.version, kept: kept.length } : null;
}

/** Whether a class shows learners their running grade: its own choice, else the school's default. */
export async function runningShownOf(
  tx: Tx,
  input: { tenantId: string; orgId: string; classId: string },
): Promise<{ shown: boolean; version: number }> {
  const [row] = await tx.execute<{ shown: boolean; version: number }>(sql`
    select shown, version from core.class_running_grades
    where tenant_id = ${input.tenantId}::uuid and class_id = ${input.classId}::uuid
      and status = 'active'`);
  if (row) return { shown: row.shown, version: row.version };
  return {
    shown: (await gradebookSettingsOf(tx, input)).runningShown,
    version: 0,
  };
}

/** Sets whether a class shows learners their running grade, if unchanged since `expectedVersion`. */
export async function setRunningShown(
  tx: Tx,
  input: {
    tenantId: string;
    classId: string;
    shown: boolean;
    expectedVersion: number;
  },
): Promise<number | null> {
  const [row] =
    input.expectedVersion === 0
      ? await tx.execute<{ version: number }>(sql`
          insert into core.class_running_grades (tenant_id, org_id, class_id, shown)
          select c.tenant_id, c.org_id, c.id, ${input.shown}
          from core.classes c
          where c.tenant_id = ${input.tenantId}::uuid and c.id = ${input.classId}::uuid
            and c.status = 'active'
          on conflict do nothing
          returning version`)
      : await tx.execute<{ version: number }>(sql`
          update core.class_running_grades set shown = ${input.shown}
          where tenant_id = ${input.tenantId}::uuid and class_id = ${input.classId}::uuid
            and status = 'active' and version = ${input.expectedVersion}
          returning version`);
  return row?.version ?? null;
}

/**
 * The classes a student is in today that show learners their running
 * grade, running today, in the order their titles sort.
 */
export async function classesShowingRunning(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    studentId: string;
    today: string;
  },
): Promise<string[]> {
  const rows = await tx.execute<{ id: string }>(sql`
    select c.id from core.classes c
    left join core.class_running_grades g on g.tenant_id = c.tenant_id
      and g.class_id = c.id and g.status = 'active'
    left join core.gradebook_settings s on s.tenant_id = c.tenant_id
      and s.org_id = c.org_id and s.status = 'active'
    where c.tenant_id = ${input.tenantId}::uuid and c.org_id = ${input.orgId}::uuid
      and c.status = 'active' and c.runs @> ${input.today}::date
      and coalesce(g.shown, s.running_shown, false)
      and exists (select 1 from core.enrollments e
        where e.tenant_id = c.tenant_id and e.class_id = c.id and e.role = 'student'
          and e.status = 'active' and e.user_id = ${input.studentId}::uuid
          and e.valid_during @> ${input.today}::date)
    order by lower(coalesce(c.title_en, c.title_ar, c.code)), c.code, c.id`);
  return rows.map((row) => row.id);
}
