import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { uuidArray } from "./sql";
import { insertSitting } from "./standards";

type Tx = CellTransaction;

/**
 * The sitting a student's handed-in work is, made the first time it gives
 * evidence or a judgement. A second writer that lost the race to make it
 * takes the one that stands and puts its own away.
 */
export async function workSitting(
  tx: Tx,
  input: { tenantId: string; submissionId: string; studentId: string },
): Promise<string> {
  const found = async () => {
    const [row] = await tx.execute<{ sitting_id: string }>(sql`
      select sitting_id from core.work_sittings
      where tenant_id = ${input.tenantId}::uuid and submission_id = ${input.submissionId}::uuid
        and status = 'active'`);
    return row?.sitting_id ?? null;
  };
  const existing = await found();
  if (existing) return existing;
  const made = await insertSitting(tx, {
    tenantId: input.tenantId,
    studentId: input.studentId,
    kind: "work",
  });
  const [linked] = await tx.execute<{ sitting_id: string }>(sql`
    insert into core.work_sittings (tenant_id, sitting_id, student_user_id, submission_id)
    values (${input.tenantId}::uuid, ${made}::uuid, ${input.studentId}::uuid,
      ${input.submissionId}::uuid)
    on conflict (tenant_id, submission_id) where status = 'active' do nothing
    returning sitting_id`);
  if (linked) return linked.sitting_id;
  await tx.execute(sql`
    update core.standard_sittings set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${made}::uuid`);
  const standing = await found();
  if (!standing) throw new Error("work sitting not found");
  return standing;
}

/** Handed-in work a sitting is, with what its student already knows of its results. */
export interface WorkOfSitting {
  submissionId: string;
  assignmentId: string;
  classId: string;
  title: string;
  /** A quiz whose answers a student sees as soon as they are marked. */
  quizShown: boolean;
  /** The attempts whose grade was given back. */
  releasedAttempts: number[];
}

/** The work each of these sittings is, for those that are work still in use. */
export async function workOfSittings(
  tx: Tx,
  input: { tenantId: string; sittingIds: readonly string[] },
): Promise<Map<string, WorkOfSitting>> {
  if (input.sittingIds.length === 0) return new Map();
  const rows = await tx.execute<{
    sitting_id: string;
    submission_id: string;
    assignment_id: string;
    class_id: string;
    title: string;
    quiz_shown: boolean;
    released: number[];
  }>(sql`
    select k.sitting_id, sb.id as submission_id, a.id as assignment_id, a.class_id, a.title,
      a.submission_format = 'quiz' and a.quiz_reveal is distinct from 'returned' as quiz_shown,
      array(select t.number from core.assessments x
        join core.submission_attempts t on t.tenant_id = x.tenant_id and t.id = x.attempt_id
        where x.tenant_id = sb.tenant_id and x.submission_id = sb.id and x.status = 'active'
          and x.released_at is not null) as released
    from core.work_sittings k
    join core.submissions sb on sb.tenant_id = k.tenant_id and sb.id = k.submission_id
    join core.assignments a on a.tenant_id = sb.tenant_id and a.id = sb.assignment_id
      and a.status = 'active'
    where k.tenant_id = ${input.tenantId}::uuid and k.status = 'active'
      and k.sitting_id = any(${uuidArray(input.sittingIds)})`);
  return new Map(
    rows.map((row) => [
      row.sitting_id,
      {
        submissionId: row.submission_id,
        assignmentId: row.assignment_id,
        classId: row.class_id,
        title: row.title,
        quizShown: row.quiz_shown,
        releasedAttempts: row.released,
      },
    ]),
  );
}

/** Whether a submission is the student's, to a quiz set to the class. */
export async function isClassQuizOf(
  tx: Tx,
  input: {
    tenantId: string;
    submissionId: string;
    studentId: string;
    classId: string;
  },
): Promise<boolean> {
  const [row] = await tx.execute<{ id: string }>(sql`
    select sb.id from core.submissions sb
    join core.assignments a on a.tenant_id = sb.tenant_id and a.id = sb.assignment_id
      and a.class_id = ${input.classId}::uuid and a.status = 'active'
      and a.submission_format = 'quiz'
    where sb.tenant_id = ${input.tenantId}::uuid and sb.id = ${input.submissionId}::uuid
      and sb.student_user_id = ${input.studentId}::uuid`);
  return row !== undefined;
}
