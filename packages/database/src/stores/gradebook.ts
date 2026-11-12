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
      and a.status = 'active' and a.state <> 'draft'`);
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
