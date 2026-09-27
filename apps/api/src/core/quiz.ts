import type { AssignmentRow } from "@faridalms/database/stores/coursework";
import type { QuizSettings } from "@faridalms/domain/coursework";
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
  saveDocument,
  snapshotPublish,
} from "@faridalms/database/stores/documents";
import { quizAnswersOf, quizStarted } from "@faridalms/database/stores/quizzes";
import {
  attemptScore,
  effectiveScore,
  keptScore,
} from "@faridalms/domain/coursework";
import {
  lessonFileIds,
  lessonPlainText,
  responseSchema,
  upgradeLesson,
} from "@faridalms/domain/learning";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "./context";

/** A quiz's questions live in a lesson document hosted beside the assignment's brief. */
export const quizHost = (assignmentId: string) => ({
  type: "assignment_quiz",
  id: assignmentId,
});

/** The questions as the teacher last saved them. */
export async function draftQuiz(
  context: UnitContext,
  assignmentId: string,
): Promise<LessonDocument | null> {
  const document = await documentOf(
    context.tx,
    context.tenantId,
    quizHost(assignmentId),
  );
  return document ? upgradeLesson(document.content) : null;
}

/** The questions students answer: the version frozen when the quiz last went out. */
export async function publishedQuiz(
  context: UnitContext,
  assignmentId: string,
): Promise<LessonDocument | null> {
  const document = await documentOf(
    context.tx,
    context.tenantId,
    quizHost(assignmentId),
  );
  if (!document) return null;
  const published = await publishedVersion(
    context.tx,
    context.tenantId,
    document.id,
  );
  return published ? upgradeLesson(published.content) : null;
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
 * Saves the questions. Once the quiz is out they are frozen again at once,
 * but only until a student starts: after that they stay as they are, so no
 * answer is ever marked against a question that changed.
 */
export async function saveQuiz(
  context: UnitContext,
  input: { assignmentId: string; quiz: QuizSettings; published: boolean },
): Promise<void> {
  if (input.published) {
    const current = await draftQuiz(context, input.assignmentId);
    if (
      canonical(current) !== canonical(input.quiz.content) &&
      (await quizStarted(context.tx, context.tenantId, input.assignmentId))
    )
      throw new ORPCError("CONFLICT", { message: "coursework.quiz_started" });
  }
  const saved = await saveDocument(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    host: quizHost(input.assignmentId),
    kind: "lesson",
    content: input.quiz.content,
    plainText: lessonPlainText(input.quiz.content),
    mediaIds: lessonFileIds(input.quiz.content),
    userId: context.actor.userId,
  });
  if (input.published)
    await snapshotPublish(context.tx, {
      tenantId: context.tenantId,
      documentId: saved.id,
      userId: context.actor.userId,
    });
}

/** Freezes the questions as the quiz goes out. */
export async function publishQuiz(context: UnitContext, assignmentId: string) {
  const document = await documentOf(
    context.tx,
    context.tenantId,
    quizHost(assignmentId),
  );
  if (!document)
    throw new ORPCError("BAD_REQUEST", {
      message: "coursework.quiz_questions",
    });
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
    feedback: previous?.feedback ?? null,
    privateNote: previous?.privateNote ?? null,
    userId: input.graderId ?? previous?.gradedByUserId ?? null,
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
