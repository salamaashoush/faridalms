import type { AssignmentRow } from "@faridalms/database/stores/coursework";
import type { ContentDocument } from "@faridalms/domain/content";
import type {
  LessonDocument,
  LessonResponse,
  QuizAnswer,
} from "@faridalms/domain/learning";

import {
  assessmentOf,
  attemptsOf,
  releaseAssessments,
  saveAssessment,
} from "@faridalms/database/stores/coursework";
import {
  documentOf,
  publishedVersion,
  snapshotPublish,
} from "@faridalms/database/stores/documents";
import { quizAnswersOf, quizStarted } from "@faridalms/database/stores/quizzes";
import {
  attemptScore,
  effectiveScore,
  keptScore,
} from "@faridalms/domain/coursework";
import {
  checkBlocks,
  responseSchema,
  upgradeLesson,
} from "@faridalms/domain/learning";
import {
  briefWithQuiz,
  holdsQuestions,
  quizOfBrief,
} from "@faridalms/domain/lesson-content";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "./context";

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
  context: UnitContext,
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
  context: UnitContext,
  assignmentId: string,
): Promise<LessonDocument | null> {
  const brief = await documentOf(
    context.tx,
    context.tenantId,
    briefHost(assignmentId),
  );
  const published = brief
    ? await publishedVersion(context.tx, context.tenantId, brief.id)
    : null;
  const content = published?.content as ContentDocument | undefined;
  if (content && holdsQuestions(content)) return quizOfBrief(content);
  return keptApart(context, assignmentId, true);
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
    canonical(checkBlocks(current ?? { version: 2, blocks: [] })) !==
      canonical(checkBlocks(quizOfBrief(input.brief))) &&
    (await quizStarted(context.tx, context.tenantId, input.assignmentId))
  )
    throw new ORPCError("CONFLICT", { message: "coursework.quiz_started" });
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
  context: UnitContext,
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
  context: UnitContext,
  input: {
    assignment: AssignmentRow;
    document: LessonDocument;
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
      input.document,
      fractionsOf(byAttempt.get(attempt.number) ?? []),
    ),
  );
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
