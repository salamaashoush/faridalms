import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { QuizAnswerState } from "../tables/coursework";

import { isoOf, textArray, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface QuizAnswerRow {
  attempt: number;
  blockId: string;
  response: Record<string, unknown>;
  fraction: number | null;
  state: QuizAnswerState;
  feedback: string | null;
  updatedAt: string;
}

/** A student's answers on a submission, every attempt or one, oldest attempt first. */
export async function quizAnswersOf(
  tx: Tx,
  input: { tenantId: string; submissionId: string; attempt?: number },
): Promise<QuizAnswerRow[]> {
  const rows = await tx.execute<{
    attempt: number;
    block_id: string;
    response: Record<string, unknown>;
    fraction: string | number | null;
    state: QuizAnswerState;
    feedback: string | null;
    updated_at: string;
  }>(sql`
    select attempt, block_id, response, fraction, state, feedback,
      ${isoOf(sql`date_last_modified`)} as updated_at
    from core.quiz_answers
    where tenant_id = ${input.tenantId}::uuid and submission_id = ${input.submissionId}::uuid
      and status = 'active'
      ${input.attempt === undefined ? sql`` : sql`and attempt = ${input.attempt}`}
    order by attempt, created_at`);
  return rows.map((row) => ({
    attempt: row.attempt,
    blockId: row.block_id,
    response: row.response,
    fraction: row.fraction === null ? null : Number(row.fraction),
    state: row.state,
    feedback: row.feedback,
    updatedAt: row.updated_at,
  }));
}

export interface QuizAnswerToMark {
  attemptId: string;
  attempt: number;
  submissionId: string;
  studentId: string;
  blockId: string;
  response: Record<string, unknown>;
  fraction: number | null;
  feedback: string | null;
  marked: boolean;
  sentAt: string;
}

/**
 * Every handed-in answer to the given questions of an assignment's quiz,
 * each attempt's own, for its teacher to mark question by question.
 */
export async function quizAnswersToMark(
  tx: Tx,
  input: {
    tenantId: string;
    assignmentId: string;
    blockIds: readonly string[];
  },
): Promise<QuizAnswerToMark[]> {
  if (input.blockIds.length === 0) return [];
  const rows = await tx.execute<{
    attempt_id: string;
    attempt: number;
    submission_id: string;
    student_id: string;
    block_id: string;
    response: Record<string, unknown>;
    fraction: string | number | null;
    feedback: string | null;
    marked: boolean;
    sent_at: string;
  }>(sql`
    select t.id as attempt_id, q.attempt, q.submission_id, q.student_user_id as student_id,
      q.block_id, q.response, q.fraction, q.feedback, q.state = 'marked' as marked,
      ${isoOf(sql`t.submitted_at`)} as sent_at
    from core.quiz_answers q
    join core.submissions s on s.tenant_id = q.tenant_id and s.id = q.submission_id
    join core.submission_attempts t on t.tenant_id = q.tenant_id
      and t.submission_id = q.submission_id and t.number = q.attempt and t.status = 'active'
    where q.tenant_id = ${input.tenantId}::uuid and s.assignment_id = ${input.assignmentId}::uuid
      and q.status = 'active' and q.state <> 'draft'
      and q.block_id = any(${uuidArray(input.blockIds)})
    order by t.submitted_at, q.attempt`);
  return rows.map((row) => ({
    attemptId: row.attempt_id,
    attempt: row.attempt,
    submissionId: row.submission_id,
    studentId: row.student_id,
    blockId: row.block_id,
    response: row.response,
    fraction: row.fraction === null ? null : Number(row.fraction),
    feedback: row.feedback,
    marked: row.marked,
    sentAt: row.sent_at,
  }));
}

/**
 * Keeps a student's answer to one question of the attempt they are on, or
 * clears it. Answers already marked are never touched.
 */
export async function saveQuizAnswer(
  tx: Tx,
  input: {
    tenantId: string;
    submissionId: string;
    studentId: string;
    attempt: number;
    blockId: string;
    response: Record<string, unknown> | null;
  },
): Promise<void> {
  if (input.response === null) {
    await tx.execute(sql`
      update core.quiz_answers set status = 'tobedeleted'
      where tenant_id = ${input.tenantId}::uuid and submission_id = ${input.submissionId}::uuid
        and attempt = ${input.attempt} and block_id = ${input.blockId}::uuid
        and status = 'active' and state = 'draft'`);
    return;
  }
  await tx.execute(sql`
    insert into core.quiz_answers (tenant_id, submission_id, student_user_id, attempt, block_id, response)
    values (${input.tenantId}::uuid, ${input.submissionId}::uuid, ${input.studentId}::uuid,
      ${input.attempt}, ${input.blockId}::uuid, ${input.response}::jsonb)
    on conflict (tenant_id, submission_id, attempt, block_id) where status = 'active' do update
      set response = excluded.response
      where core.quiz_answers.state = 'draft'`);
}

/** Marks the answers of an attempt as it is handed in. */
export async function markQuizAttempt(
  tx: Tx,
  input: {
    tenantId: string;
    submissionId: string;
    attempt: number;
    marks: readonly {
      blockId: string;
      fraction: number | null;
      state: Exclude<QuizAnswerState, "draft">;
    }[];
  },
): Promise<void> {
  for (const mark of input.marks)
    await tx.execute(sql`
      update core.quiz_answers set fraction = ${mark.fraction}, state = ${mark.state}
      where tenant_id = ${input.tenantId}::uuid and submission_id = ${input.submissionId}::uuid
        and attempt = ${input.attempt} and block_id = ${mark.blockId}::uuid
        and status = 'active'`);
}

/** A teacher's mark on one written answer. False when there is no such answer. */
export async function markQuizAnswer(
  tx: Tx,
  input: {
    tenantId: string;
    submissionId: string;
    attempt: number;
    blockId: string;
    fraction: number | null;
    feedback: string | null;
    userId: string;
  },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.quiz_answers
    set fraction = ${input.fraction}, feedback = ${input.feedback}, state = 'marked',
        marked_by_user_id = ${input.userId}::uuid
    where tenant_id = ${input.tenantId}::uuid and submission_id = ${input.submissionId}::uuid
      and attempt = ${input.attempt} and block_id = ${input.blockId}::uuid
      and status = 'active' and state <> 'draft'
    returning id`);
  return rows.length > 0;
}

/** Whether any student has begun the quiz, after which its questions stay as they are. */
export async function quizStarted(
  tx: Tx,
  tenantId: string,
  assignmentId: string,
): Promise<boolean> {
  const [row] = await tx.execute<{ started: boolean }>(sql`
    select exists (select 1 from core.quiz_answers q
      join core.submissions s on s.tenant_id = q.tenant_id and s.id = q.submission_id
      where q.tenant_id = ${tenantId}::uuid and s.assignment_id = ${assignmentId}::uuid
        and q.status = 'active')
    or exists (select 1 from core.quiz_draws d
      join core.submissions s on s.tenant_id = d.tenant_id and s.id = d.submission_id
      where d.tenant_id = ${tenantId}::uuid and s.assignment_id = ${assignmentId}::uuid
        and d.status = 'active') as started`);
  return row?.started ?? false;
}

export interface QuizDrawRow {
  attempt: number;
  drawId: string;
  bankQuestionId: string;
  question: Record<string, unknown>;
}

type DrawRecord = {
  attempt: number;
  draw_id: string;
  bank_question_id: string;
  question: Record<string, unknown>;
};

const drawOf = (row: DrawRecord): QuizDrawRow => ({
  attempt: row.attempt,
  drawId: row.draw_id,
  bankQuestionId: row.bank_question_id,
  question: row.question,
});

/** The questions drawn for a submission's attempts, each draw's in the order drawn. */
export async function quizDrawsOf(
  tx: Tx,
  input: { tenantId: string; submissionId: string },
): Promise<QuizDrawRow[]> {
  const rows = await tx.execute<DrawRecord>(sql`
    select attempt, draw_id, bank_question_id, question
    from core.quiz_draws
    where tenant_id = ${input.tenantId}::uuid and submission_id = ${input.submissionId}::uuid
      and status = 'active'
    order by attempt, draw_id, position`);
  return rows.map(drawOf);
}

/**
 * Every question any student of an assignment drew of the given kinds,
 * each once, for marking question by question.
 */
export async function drawnQuestionsOf(
  tx: Tx,
  input: { tenantId: string; assignmentId: string; kinds: readonly string[] },
): Promise<QuizDrawRow[]> {
  if (input.kinds.length === 0) return [];
  const rows = await tx.execute<DrawRecord>(sql`
    select distinct on (d.draw_id, d.bank_question_id)
      d.attempt, d.draw_id, d.bank_question_id, d.question
    from core.quiz_draws d
    join core.submissions s on s.tenant_id = d.tenant_id and s.id = d.submission_id
    where d.tenant_id = ${input.tenantId}::uuid and s.assignment_id = ${input.assignmentId}::uuid
      and d.status = 'active' and s.status = 'active'
      and d.question->>'kind' = any(${textArray(input.kinds)})
    order by d.draw_id, d.bank_question_id, d.created_at`);
  return rows.map(drawOf);
}

export interface DrawnQuestion {
  drawId: string;
  position: number;
  bankQuestionId: string;
  question: Record<string, unknown>;
}

/**
 * Keeps what an attempt drew. Should two openings of the attempt draw at
 * once, the first to be kept stands and the other keeps nothing.
 */
export async function storeQuizDraws(
  tx: Tx,
  input: {
    tenantId: string;
    submissionId: string;
    studentId: string;
    attempt: number;
    drawn: readonly DrawnQuestion[];
  },
): Promise<void> {
  if (input.drawn.length === 0) return;
  await tx.execute(sql`
    insert into core.quiz_draws (tenant_id, submission_id, student_user_id, attempt,
      draw_id, position, bank_question_id, question)
    values ${sql.join(
      input.drawn.map(
        (row) => sql`(${input.tenantId}::uuid, ${input.submissionId}::uuid,
          ${input.studentId}::uuid, ${input.attempt}, ${row.drawId}::uuid, ${row.position},
          ${row.bankQuestionId}::uuid, ${row.question}::jsonb)`,
      ),
      sql`, `,
    )}
    on conflict (tenant_id, submission_id, attempt, draw_id, position)
      where status = 'active' do nothing`);
}

/**
 * Whom a kept question was asked of by a school's quizzes, and in which
 * classes, each pair once.
 */
export async function questionAskedOf(
  tx: Tx,
  input: { tenantId: string; bankQuestionId: string; orgId: string },
): Promise<{ studentId: string; classId: string }[]> {
  const rows = await tx.execute<{ student_id: string; class_id: string }>(sql`
    select distinct d.student_user_id as student_id, a.class_id
    from core.quiz_draws d
    join core.submissions s on s.tenant_id = d.tenant_id and s.id = d.submission_id
    join core.assignments a on a.tenant_id = s.tenant_id and a.id = s.assignment_id
    where d.tenant_id = ${input.tenantId}::uuid
      and d.bank_question_id = ${input.bankQuestionId}::uuid
      and d.status = 'active' and a.org_id = ${input.orgId}::uuid
    limit 500`);
  return rows.map((row) => ({
    studentId: row.student_id,
    classId: row.class_id,
  }));
}
