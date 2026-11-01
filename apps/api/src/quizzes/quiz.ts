import type { AssignmentRow } from "@faridalms/database/stores/coursework";
import type {
  DrawnQuestion,
  QuizDrawRow,
} from "@faridalms/database/stores/quizzes";
import type { ContentDocument, ContentNode } from "@faridalms/domain/content";
import type {
  CheckBlock,
  CheckView,
  DrawBlock,
  LessonDocument,
  MarkedBlock,
  LessonResponse,
  QuizAnswer,
} from "@faridalms/domain/learning";
import type { PracticeKept } from "@faridalms/domain/practice";

import { drawFromBank } from "@faridalms/database/stores/bank";
import {
  assessmentOf,
  attemptsOf,
  insertAttempt,
  releaseAssessments,
  saveAssessment,
} from "@faridalms/database/stores/coursework";
import {
  documentOf,
  publishedVersion,
  snapshotPublish,
} from "@faridalms/database/stores/documents";
import {
  closeSitting,
  drawnQuestionsOf,
  markQuizAttempt,
  quizAnswersOf,
  quizDrawsOf,
  quizStarted,
  storeQuizDraws,
} from "@faridalms/database/stores/quizzes";
import { recordEvidence } from "@faridalms/database/stores/standards";
import { bankQuestionOf } from "@faridalms/domain/bank";
import {
  attemptQuiz,
  attemptScore,
  effectiveScore,
  keptScore,
} from "@faridalms/domain/coursework";
import {
  checkBlocks,
  isAuto,
  isCheck,
  isTeacherMarked,
  markResponse,
  responseSchema,
  upgradeLesson,
} from "@faridalms/domain/learning";
import {
  briefWithQuiz,
  drawnQuestion,
  holdsQuestions,
  quizOfBrief,
} from "@faridalms/domain/lesson-content";
import { practised, practiceStanding } from "@faridalms/domain/practice";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

/** What reading and marking a quiz needs of a unit of work; a worker's pass has it too. */
export type QuizUnit = Pick<UnitContext, "tx" | "tenantId">;

/**
 * Where a quiz's questions were kept before they were written in its brief.
 * Quizzes not edited since still read them from here.
 */
export const quizHost = (assignmentId: string) => ({
  type: "assignment_quiz",
  id: assignmentId,
});

const briefHost = (assignmentId: string) => ({
  type: "assignment",
  id: assignmentId,
});

/** The questions kept apart from the brief, as last saved or as last sent. */
async function keptApart(
  context: QuizUnit,
  assignmentId: string,
  sent: boolean,
): Promise<LessonDocument | null> {
  const document = await documentOf(
    context.tx,
    context.tenantId,
    quizHost(assignmentId),
  );
  if (!document) return null;
  if (!sent) return upgradeLesson(document.content);
  const published = await publishedVersion(
    context.tx,
    context.tenantId,
    document.id,
  );
  return published ? upgradeLesson(published.content) : null;
}

/** The questions as the teacher last saved them. */
export async function draftQuiz(
  context: UnitContext,
  assignmentId: string,
): Promise<LessonDocument | null> {
  const brief = await documentOf(
    context.tx,
    context.tenantId,
    briefHost(assignmentId),
  );
  const content = brief?.content as ContentDocument | undefined;
  if (content && holdsQuestions(content)) return quizOfBrief(content);
  return (
    (await keptApart(context, assignmentId, false)) ??
    (content ? quizOfBrief(content) : null)
  );
}

/** The questions students answer: those in the brief as last sent to them. */
export async function publishedQuiz(
  context: QuizUnit,
  assignmentId: string,
): Promise<LessonDocument | null> {
  const content = await publishedBrief(context, assignmentId);
  if (content && holdsQuestions(content)) return quizOfBrief(content);
  return keptApart(context, assignmentId, true);
}

/** The brief as its students were last shown it, a quiz's questions and all. */
export async function publishedBrief(
  context: QuizUnit,
  assignmentId: string,
): Promise<ContentDocument | null> {
  const brief = await documentOf(
    context.tx,
    context.tenantId,
    briefHost(assignmentId),
  );
  const published = brief
    ? await publishedVersion(context.tx, context.tenantId, brief.id)
    : null;
  return (published?.content as ContentDocument | undefined) ?? null;
}

/**
 * The brief as its teacher edits it: a quiz whose questions are still kept
 * apart has them written in, so the next save keeps them in the brief.
 */
export async function briefForEditing(
  context: UnitContext,
  assignmentId: string,
  brief: ContentDocument,
  sent: boolean,
): Promise<ContentDocument> {
  if (holdsQuestions(brief)) return brief;
  const apart = await keptApart(context, assignmentId, sent);
  return apart ? briefWithQuiz(brief, apart) : brief;
}

/** The same value whatever order its keys were stored in. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .toSorted()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  return JSON.stringify(value);
}

/** What a quiz asks: its questions and its draws from the bank. */
const asked = (document: LessonDocument) =>
  document.blocks.filter((block) => block.type === "draw" || isCheck(block));

/**
 * Once a student has started a quiz its questions stay as they are, so no
 * answer is ever marked against a question that changed; its other words
 * may still be edited.
 */
export async function keepStartedQuestions(
  context: UnitContext,
  input: { assignmentId: string; brief: ContentDocument },
): Promise<void> {
  const current = await draftQuiz(context, input.assignmentId);
  if (
    canonical(asked(current ?? { version: 2, blocks: [] })) !==
      canonical(asked(quizOfBrief(input.brief))) &&
    (await quizStarted(context.tx, context.tenantId, input.assignmentId))
  )
    throw new ORPCError("CONFLICT", { message: "coursework.quiz_started" });
}

export const drawsOf = (document: LessonDocument): DrawBlock[] =>
  document.blocks.filter((block) => block.type === "draw");

/** Drawn questions as each draw asks them, in the order drawn. */
function drawnBlocks(
  draws: ReadonlyMap<string, DrawBlock>,
  rows: readonly QuizDrawRow[],
): Map<string, CheckBlock[]> {
  const drawn = new Map<string, CheckBlock[]>();
  for (const row of rows) {
    const draw = draws.get(row.drawId);
    const block = draw
      ? drawnQuestion(
          draw,
          row.bankQuestionId,
          row.question as unknown as ContentNode,
        )
      : null;
    if (block) drawn.set(row.drawId, [...(drawn.get(row.drawId) ?? []), block]);
  }
  return drawn;
}

/**
 * The questions of a quiz only its teacher can mark, in the quiz's order,
 * each draw standing for those of its questions any student drew.
 */
export async function markedQuestions(
  context: UnitContext,
  assignmentId: string,
  document: LessonDocument,
): Promise<MarkedBlock[]> {
  const draws = new Map(drawsOf(document).map((draw) => [draw.id, draw]));
  const rows = draws.size
    ? await drawnQuestionsOf(context.tx, {
        tenantId: context.tenantId,
        assignmentId,
        kinds: ["written", "scratch", "project"],
      })
    : [];
  return checkBlocks(attemptQuiz(document, drawnBlocks(draws, rows))).filter(
    isTeacherMarked,
  );
}

/** A quiz as each attempt of one student's submission asks it. */
export interface AttemptQuizzes {
  of: (attempt: number) => LessonDocument;
  /** Whether the attempt has draws still to make before it is answered. */
  undrawn: (attempt: number) => boolean;
}

/**
 * Reads what each attempt drew from the bank, once for the submission. A
 * quiz that draws nothing is every attempt's quiz as it stands.
 */
export async function attemptQuizzes(
  context: QuizUnit,
  document: LessonDocument,
  submissionId: string | null,
): Promise<AttemptQuizzes> {
  const draws = new Map(drawsOf(document).map((draw) => [draw.id, draw]));
  if (draws.size === 0) return { of: () => document, undrawn: () => false };
  const rows = submissionId
    ? await quizDrawsOf(context.tx, {
        tenantId: context.tenantId,
        submissionId,
      })
    : [];
  const byAttempt = new Map<number, Map<string, CheckBlock[]>>();
  for (const attempt of new Set(rows.map((row) => row.attempt)))
    byAttempt.set(
      attempt,
      drawnBlocks(
        draws,
        rows.filter((row) => row.attempt === attempt),
      ),
    );
  return {
    of: (attempt) => attemptQuiz(document, byAttempt.get(attempt) ?? new Map()),
    undrawn: (attempt) => !byAttempt.has(attempt),
  };
}

/**
 * Draws an attempt's questions from the bank as it opens: the school's
 * questions with each draw's tag and those of the teacher who set the quiz,
 * never one question twice, kept so the attempt asks them until it is done.
 */
export async function drawAttempt(
  context: UnitContext,
  input: {
    assignment: AssignmentRow;
    document: LessonDocument;
    submissionId: string;
    studentId: string;
    attempt: number;
  },
): Promise<void> {
  const draws = drawsOf(input.document);
  if (draws.length === 0) return;
  const kept = await quizDrawsOf(context.tx, {
    tenantId: context.tenantId,
    submissionId: input.submissionId,
  });
  if (kept.some((row) => row.attempt === input.attempt)) return;
  const taken: string[] = [];
  const drawn: DrawnQuestion[] = [];
  for (const draw of draws) {
    const picked = await drawFromBank(context.tx, {
      tenantId: context.tenantId,
      orgId: input.assignment.orgId,
      authorUserId: input.assignment.authorUserId,
      tag: draw.tag,
      count: draw.count,
      exclude: taken,
    });
    const questions = picked.flatMap((row) => {
      const question = bankQuestionOf(
        row.content as unknown as ContentDocument,
      );
      return question ? [{ id: row.id, question }] : [];
    });
    taken.push(...questions.map((item) => item.id));
    drawn.push(
      ...questions.map((item, position) => ({
        drawId: draw.id,
        position,
        bankQuestionId: item.id,
        question: item.question as unknown as Record<string, unknown>,
      })),
    );
  }
  await storeQuizDraws(context.tx, {
    tenantId: context.tenantId,
    submissionId: input.submissionId,
    studentId: input.studentId,
    attempt: input.attempt,
    drawn,
  });
}

/** Freezes questions still kept apart from the brief as the quiz goes out. */
export async function publishKeptApart(
  context: UnitContext,
  assignmentId: string,
) {
  const document = await documentOf(
    context.tx,
    context.tenantId,
    quizHost(assignmentId),
  );
  if (document)
    await snapshotPublish(context.tx, {
      tenantId: context.tenantId,
      documentId: document.id,
      userId: context.actor.userId,
    });
}

/** A submission's answers grouped by attempt. */
export async function answersByAttempt(
  context: QuizUnit,
  submissionId: string,
): Promise<Map<number, QuizAnswer[]>> {
  const rows = await quizAnswersOf(context.tx, {
    tenantId: context.tenantId,
    submissionId,
  });
  const byAttempt = new Map<number, QuizAnswer[]>();
  for (const row of rows)
    byAttempt.set(row.attempt, [...(byAttempt.get(row.attempt) ?? []), row]);
  return byAttempt;
}

/** How a practice quiz's student stands on one question, from the answer kept. */
export function keptOf(answer: QuizAnswer | undefined): PracticeKept {
  const response = answer ? v.safeParse(responseSchema, answer.response) : null;
  return {
    response: response?.success ? response.output : null,
    tries: answer?.tries ?? 0,
    hints: answer?.hints ?? 0,
    revealed: answer?.revealed ?? false,
  };
}

/** Each question of a practice quiz attempt as its student stands on it. */
export function practiceViews(
  quiz: LessonDocument,
  answers: readonly QuizAnswer[],
): Record<string, CheckView> {
  return Object.fromEntries(
    checkBlocks(quiz)
      .filter(practised)
      .map((block) => [
        block.id,
        practiceStanding(
          block,
          keptOf(answers.find((answer) => answer.blockId === block.id)),
        ).view,
      ]),
  );
}

const fractionsOf = (answers: readonly QuizAnswer[]) =>
  Object.fromEntries(
    answers.map((answer) => [answer.blockId, answer.fraction]),
  );

/**
 * Works out every attempt's score and writes the one that counts onto the
 * latest attempt's assessment, where the gradebook reads it. It is released
 * at once when the quiz shows results and nothing waits for the teacher.
 */
export async function rescoreQuiz(
  context: QuizUnit & { today: string },
  input: {
    assignment: AssignmentRow;
    quizzes: AttemptQuizzes;
    submissionId: string;
    studentId: string;
    /** Null keeps who graded it before; a quiz marking itself leaves it empty. */
    graderId: string | null;
    release: boolean;
  },
): Promise<{ scores: number[]; kept: number | null; pending: boolean }> {
  const [attempts, byAttempt] = await Promise.all([
    attemptsOf(context.tx, context.tenantId, input.submissionId),
    answersByAttempt(context, input.submissionId),
  ]);
  const latest = attempts.at(-1);
  if (!latest) return { scores: [], kept: null, pending: false };
  const scores = attempts.map((attempt) =>
    attemptScore(
      input.quizzes.of(attempt.number),
      fractionsOf(byAttempt.get(attempt.number) ?? []),
    ),
  );
  await recordEvidence(context.tx, {
    tenantId: context.tenantId,
    studentId: input.studentId,
    sitting: { source: "quiz", submissionId: input.submissionId },
    marks: attempts.flatMap((attempt) => {
      const blocks = checkBlocks(input.quizzes.of(attempt.number));
      return (byAttempt.get(attempt.number) ?? []).flatMap((answer) => {
        const block = blocks.find((item) => item.id === answer.blockId);
        return block?.standards?.length &&
          answer.state === "marked" &&
          answer.fraction !== null
          ? [
              {
                attempt: attempt.number,
                blockId: block.id,
                standards: block.standards,
                fraction: answer.fraction,
              },
            ]
          : [];
      });
    }),
    replace: true,
  });
  const kept = keptScore(scores, input.assignment.quizKeep ?? "highest");
  const pending = (byAttempt.get(latest.number) ?? []).some(
    (answer) => answer.state === "needs_marking",
  );
  const previous = await assessmentOf(context.tx, context.tenantId, latest.id);
  await saveAssessment(context.tx, {
    tenantId: context.tenantId,
    attemptId: latest.id,
    submissionId: input.submissionId,
    studentId: input.studentId,
    score: kept,
    effectiveScore: effectiveScore(kept, latest.isLate, input.assignment),
    rubricScores: null,
    rubricComments: previous?.rubricComments ?? null,
    feedback: previous?.feedback ?? null,
    privateNote: previous?.privateNote ?? null,
    userId: input.graderId ?? previous?.gradedByUserId ?? null,
    today: context.today,
  });
  if (input.release && !pending && input.assignment.quizReveal !== "returned")
    await releaseAssessments(context.tx, context.tenantId, [latest.id]);
  return { scores, kept, pending };
}

interface QuizMark {
  blockId: string;
  fraction: number | null;
  state: "marked" | "needs_marking";
}

/**
 * Hands in an attempt as it stands: each kept answer marked, a written one
 * left for its teacher, the score that counts written where the gradebook
 * reads it, and the attempt's clock stopped. Null when the quiz is gone.
 */
export async function handInAttempt(
  unit: QuizUnit & { today: string },
  input: {
    assignment: AssignmentRow;
    submissionId: string;
    studentId: string;
    attempt: number;
    isLate: boolean;
  },
): Promise<{ attemptId: string; returned: boolean } | null> {
  const document = await publishedQuiz(unit, input.assignment.id);
  if (!document) return null;
  const [quizzes, answers] = await Promise.all([
    attemptQuizzes(unit, document, input.submissionId),
    quizAnswersOf(unit.tx, {
      tenantId: unit.tenantId,
      submissionId: input.submissionId,
      attempt: input.attempt,
    }),
  ]);
  const attemptId = await insertAttempt(unit.tx, {
    tenantId: unit.tenantId,
    submissionId: input.submissionId,
    studentId: input.studentId,
    number: input.attempt,
    isLate: input.isLate,
    userId: input.studentId,
  });
  const blocks = checkBlocks(quizzes.of(input.attempt));
  await markQuizAttempt(unit.tx, {
    tenantId: unit.tenantId,
    submissionId: input.submissionId,
    attempt: input.attempt,
    marks: answers.flatMap((answer): QuizMark[] => {
      const block = blocks.find((item) => item.id === answer.blockId);
      const response = v.safeParse(responseSchema, answer.response);
      if (!block) return [];
      // A practice quiz's question was checked as it was answered, and
      // earns what its tries and hints left it.
      if (input.assignment.quizPractice && practised(block))
        return [
          {
            blockId: block.id,
            fraction: practiceStanding(block, keptOf(answer)).credit,
            state: "marked",
          },
        ];
      if (isAuto(block))
        return [
          {
            blockId: block.id,
            fraction: response.success
              ? markResponse(block, response.output).fraction
              : 0,
            state: "marked",
          },
        ];
      return [
        {
          blockId: block.id,
          fraction: null,
          state: block.points > 0 ? "needs_marking" : "marked",
        },
      ];
    }),
  });
  const scored = await rescoreQuiz(unit, {
    assignment: input.assignment,
    quizzes,
    submissionId: input.submissionId,
    studentId: input.studentId,
    graderId: null,
    release: true,
  });
  await closeSitting(unit.tx, {
    tenantId: unit.tenantId,
    submissionId: input.submissionId,
    attempt: input.attempt,
  });
  return {
    attemptId,
    returned: !scored.pending && input.assignment.quizReveal !== "returned",
  };
}

/**
 * Answers by question as their student sees them: a code exercise without
 * how its tests went, which only the quiz's revealed answers show.
 */
export function ownResponsesOf(
  answers: readonly QuizAnswer[],
): Record<string, LessonResponse> {
  return Object.fromEntries(
    Object.entries(responsesOf(answers)).map(([blockId, response]) => [
      blockId,
      response.type === "program"
        ? { type: "program", code: response.code }
        : response,
    ]),
  );
}

/**
 * Answers as a teacher reads them: a vote in a poll counted without names
 * stays answered, but without what it chose.
 */
export function namelessVotes(
  quiz: LessonDocument,
  answers: readonly QuizAnswer[],
): QuizAnswer[] {
  const hidden = new Set(
    quiz.blocks.flatMap((block) =>
      block.type === "poll" && block.anonymous ? [block.id] : [],
    ),
  );
  return answers.map((answer) =>
    hidden.has(answer.blockId)
      ? { ...answer, response: { type: "poll", optionIds: [] } }
      : answer,
  );
}

/** Answers by question, as the typed responses they were saved as. */
export function responsesOf(
  answers: readonly QuizAnswer[],
): Record<string, LessonResponse> {
  return Object.fromEntries(
    answers.flatMap((answer) => {
      const parsed = v.safeParse(responseSchema, answer.response);
      return parsed.success ? [[answer.blockId, parsed.output]] : [];
    }),
  );
}
