import type { FluencyMark } from "@faridalms/domain/learning";

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
  /** In a practice quiz: answers checked, hints asked for, and whether the answer was shown. */
  tries: number;
  hints: number;
  revealed: boolean;
}

/**
 * How each of these students voted in a quiz's poll: the options of their
 * answer in the earliest attempt that has one, one list a student.
 */
export async function quizPollVotes(
  tx: Tx,
  input: {
    tenantId: string;
    assignmentId: string;
    blockId: string;
    studentIds: readonly string[];
  },
): Promise<Map<string, string[]>> {
  if (input.studentIds.length === 0) return new Map();
  const rows = await tx.execute<{
    student_user_id: string;
    option_ids: unknown;
  }>(sql`
    select distinct on (a.student_user_id) a.student_user_id, a.response->'optionIds' as option_ids
    from core.quiz_answers a
    join core.submissions s on s.tenant_id = a.tenant_id and s.id = a.submission_id
    where a.tenant_id = ${input.tenantId}::uuid and s.assignment_id = ${input.assignmentId}::uuid
      and a.block_id = ${input.blockId}::uuid and a.status = 'active' and s.status = 'active'
      and a.student_user_id = any(${uuidArray(input.studentIds)})
      and jsonb_typeof(a.response->'optionIds') = 'array'
    order by a.student_user_id, a.attempt`);
  return new Map(
    rows.map((row) => [
      row.student_user_id,
      Array.isArray(row.option_ids)
        ? row.option_ids.filter((item) => typeof item === "string")
        : [],
    ]),
  );
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
    tries: number;
    hints: number;
    revealed: boolean;
  }>(sql`
    select attempt, block_id, response, fraction, state, feedback,
      ${isoOf(sql`date_last_modified`)} as updated_at, tries, hints, revealed
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
    tries: row.tries,
    hints: row.hints,
    revealed: row.revealed,
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
  /** How a passage read aloud was read, as the teacher last marked it. */
  fluency: FluencyMark | null;
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
    fluency: FluencyMark | null;
    marked: boolean;
    sent_at: string;
  }>(sql`
    select t.id as attempt_id, q.attempt, q.submission_id, q.student_user_id as student_id,
      q.block_id, q.response, q.fraction, q.feedback, q.fluency, q.state = 'marked' as marked,
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
    fluency: row.fluency,
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

/**
 * Keeps how a student stands on one question of a practice quiz: the last
 * answer checked, the tries and hints so far, and whether the answer was
 * shown. Answers already marked are never touched.
 */
export async function keepPracticeAnswer(
  tx: Tx,
  input: {
    tenantId: string;
    submissionId: string;
    studentId: string;
    attempt: number;
    blockId: string;
    response: Record<string, unknown>;
    tries: number;
    hints: number;
    revealed: boolean;
  },
): Promise<void> {
  await tx.execute(sql`
    insert into core.quiz_answers (tenant_id, submission_id, student_user_id, attempt, block_id,
      response, tries, hints, revealed)
    values (${input.tenantId}::uuid, ${input.submissionId}::uuid, ${input.studentId}::uuid,
      ${input.attempt}, ${input.blockId}::uuid, ${input.response}::jsonb, ${input.tries},
      ${input.hints}, ${input.revealed})
    on conflict (tenant_id, submission_id, attempt, block_id) where status = 'active' do update
      set response = excluded.response, tries = excluded.tries, hints = excluded.hints,
        revealed = excluded.revealed
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
    /** How a passage read aloud was read; a mark without it clears the last. */
    fluency?: FluencyMark | null;
    userId: string;
  },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.quiz_answers
    set fraction = ${input.fraction}, feedback = ${input.feedback}, state = 'marked',
        fluency = ${input.fluency ? JSON.stringify(input.fluency) : null}::text::jsonb,
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

export interface SittingRow {
  startedAt: Date;
  endsAt: Date | null;
  closedAt: Date | null;
  /** When the rest break under way began; null while the clock runs. */
  pausedAt: Date | null;
  breaks: number;
  breakSeconds: number;
}

type SittingRecord = {
  started_at: Date | string;
  ends_at: Date | string | null;
  closed_at: Date | string | null;
  paused_at: Date | string | null;
  breaks: number;
  break_seconds: number;
};

const sittingOf = (row: SittingRecord): SittingRow => ({
  startedAt: new Date(row.started_at),
  endsAt: row.ends_at === null ? null : new Date(row.ends_at),
  closedAt: row.closed_at === null ? null : new Date(row.closed_at),
  pausedAt: row.paused_at === null ? null : new Date(row.paused_at),
  breaks: row.breaks,
  breakSeconds: row.break_seconds,
});

const SITTING_COLUMNS = sql`started_at, ends_at, closed_at, paused_at, breaks, break_seconds`;

/** When each of a submission's timed attempts began and runs out, by attempt. */
export async function sittingsOf(
  tx: Tx,
  input: { tenantId: string; submissionId: string },
): Promise<Map<number, SittingRow>> {
  const rows = await tx.execute<SittingRecord & { attempt: number }>(sql`
    select attempt, ${SITTING_COLUMNS}
    from core.quiz_sittings
    where tenant_id = ${input.tenantId}::uuid and submission_id = ${input.submissionId}::uuid
      and status = 'active'`);
  return new Map(rows.map((row) => [row.attempt, sittingOf(row)]));
}

/**
 * Begins a timed attempt's clock, once: an attempt begun already keeps the
 * clock it began with.
 */
export async function beginSitting(
  tx: Tx,
  input: {
    tenantId: string;
    submissionId: string;
    studentId: string;
    attempt: number;
    startedAt: Date;
    endsAt: Date | null;
  },
): Promise<SittingRow> {
  await tx.execute(sql`
    insert into core.quiz_sittings (tenant_id, submission_id, student_user_id, attempt,
      started_at, ends_at)
    values (${input.tenantId}::uuid, ${input.submissionId}::uuid, ${input.studentId}::uuid,
      ${input.attempt}, ${input.startedAt.toISOString()}::timestamptz,
      ${input.endsAt?.toISOString() ?? null}::timestamptz)
    on conflict (tenant_id, submission_id, attempt) where status = 'active' do nothing`);
  const [row] = await tx.execute<SittingRecord>(sql`
    select ${SITTING_COLUMNS}
    from core.quiz_sittings
    where tenant_id = ${input.tenantId}::uuid and submission_id = ${input.submissionId}::uuid
      and attempt = ${input.attempt} and status = 'active'`);
  if (!row) throw new Error("sitting was not kept");
  return sittingOf(row);
}

/**
 * Stops a running clock for a rest break, while time is left on it. Its
 * questions stay out of sight until the break ends.
 */
export async function pauseSitting(
  tx: Tx,
  input: { tenantId: string; submissionId: string; attempt: number },
): Promise<boolean> {
  const rows = await tx.execute(sql`
    update core.quiz_sittings set paused_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and submission_id = ${input.submissionId}::uuid
      and attempt = ${input.attempt} and status = 'active' and closed_at is null
      and paused_at is null and ends_at > statement_timestamp()
    returning id`);
  return rows.length > 0;
}

/**
 * Ends a rest break: the clock runs on from where it stopped, its end moved
 * by the break's length, and the break is counted for the teacher to see.
 */
export async function resumeSitting(
  tx: Tx,
  input: { tenantId: string; submissionId: string; attempt: number },
): Promise<boolean> {
  const rows = await tx.execute(sql`
    update core.quiz_sittings set
      ends_at = ends_at + (statement_timestamp() - paused_at),
      breaks = breaks + 1,
      break_seconds = break_seconds
        + ceil(extract(epoch from statement_timestamp() - paused_at))::int,
      paused_at = null
    where tenant_id = ${input.tenantId}::uuid and submission_id = ${input.submissionId}::uuid
      and attempt = ${input.attempt} and status = 'active' and closed_at is null
      and paused_at is not null
    returning id`);
  return rows.length > 0;
}

/** Stops an attempt's clock as it is handed in. */
export async function closeSitting(
  tx: Tx,
  input: { tenantId: string; submissionId: string; attempt: number },
): Promise<void> {
  await tx.execute(sql`
    update core.quiz_sittings set closed_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and submission_id = ${input.submissionId}::uuid
      and attempt = ${input.attempt} and status = 'active' and closed_at is null`);
}

export interface ExpiredSitting {
  assignmentId: string;
  orgId: string;
  submissionId: string;
  studentId: string;
  attempt: number;
}

/**
 * Timed attempts whose time ran out before `before`, or whose rest break
 * has gone on an hour, and that nobody handed in, oldest first, each
 * locked so two passes never hand one in twice.
 */
export async function expiredSittings(
  tx: Tx,
  input: { tenantId: string; before: Date; limit: number },
): Promise<ExpiredSitting[]> {
  const rows = await tx.execute<{
    assignment_id: string;
    org_id: string;
    submission_id: string;
    student_user_id: string;
    attempt: number;
  }>(sql`
    select s.assignment_id, a.org_id, q.submission_id, q.student_user_id, q.attempt
    from core.quiz_sittings q
    join core.submissions s on s.tenant_id = q.tenant_id and s.id = q.submission_id
    join core.assignments a on a.tenant_id = s.tenant_id and a.id = s.assignment_id
    where q.tenant_id = ${input.tenantId}::uuid and q.status = 'active'
      and q.closed_at is null and q.ends_at is not null
      and (
        (q.paused_at is null and q.ends_at < ${input.before.toISOString()}::timestamptz)
        -- A rest break left open an hour is no rest break: the sitting ends.
        or q.paused_at < ${input.before.toISOString()}::timestamptz - interval '1 hour'
      )
    order by q.ends_at
    limit ${input.limit}
    for update of q skip locked`);
  return rows.map((row) => ({
    assignmentId: row.assignment_id,
    orgId: row.org_id,
    submissionId: row.submission_id,
    studentId: row.student_user_id,
    attempt: row.attempt,
  }));
}
