import type {
  LessonRow,
  lessonResponses,
} from "@faridalms/database/stores/learning";
import type {
  CheckBlock,
  LessonDocument,
  LessonResponse,
} from "@faridalms/domain/learning";

import {
  insertResponse,
  progressIn,
  recordProgress,
} from "@faridalms/database/stores/learning";
import {
  checkStates,
  completionMet,
  lessonScore,
} from "@faridalms/domain/learning";

import type { ModuleScope } from "../core/extension";

import { tellMarkedLesson } from "./points";

/** A changed mark for one try at a question, and for code, how running it again went. */
export interface Remark {
  studentId: string;
  attempt: number;
  block: CheckBlock;
  try: number;
  fraction: number;
  response?: LessonResponse;
}

/**
 * Keeps each changed mark beside the answer it marks, and works out each
 * student's score, best score and evidence again. A finished lesson stays
 * finished.
 */
export async function applyRemarks(
  unit: ModuleScope,
  shown: LessonRow,
  published: { content: LessonDocument; versionId: string },
  rows: Awaited<ReturnType<typeof lessonResponses>>,
  changes: readonly Remark[],
): Promise<number> {
  const { content } = published;
  for (const change of changes)
    await insertResponse(unit.tx, {
      tenantId: unit.tenantId,
      lessonId: shown.id,
      documentVersionId: published.versionId,
      studentId: change.studentId,
      blockId: change.block.id,
      attempt: change.attempt,
      try: change.try,
      kind: change.block.type,
      response: change.response ?? {},
      fraction: change.fraction,
      state: "remarked",
    });
  const students = [...new Set(changes.map((change) => change.studentId))];
  const cells = await progressIn(unit.tx, {
    tenantId: unit.tenantId,
    lessonIds: [shown.id],
    studentIds: students,
  });
  for (const studentId of students) {
    const own = cells.find((cell) => cell.studentUserId === studentId);
    const theirs = [
      ...rows.filter((row) => row.studentId === studentId),
      ...changes
        .filter((change) => change.studentId === studentId)
        .map((change) => ({
          blockId: change.block.id,
          attempt: change.attempt,
          try: change.try,
          state: "remarked" as const,
          fraction: change.fraction,
        })),
    ];
    const current = own?.attempts ?? 1;
    const statesOf = (attempt: number) =>
      checkStates(
        content,
        theirs.filter((row) => row.attempt === attempt),
      );
    const earlier = [...new Set(theirs.map((row) => row.attempt))]
      .filter((attempt) => attempt < current)
      .map((attempt) => lessonScore(content, statesOf(attempt)))
      .filter((score) => score !== null);
    const best = earlier.length > 0 ? Math.max(...earlier) : null;
    const now = lessonScore(content, statesOf(current));
    const met =
      shown.completion !== "watch" &&
      completionMet(shown, content, statesOf(current));
    await recordProgress(unit.tx, {
      tenantId: unit.tenantId,
      lessonId: shown.id,
      studentId,
      score: now === null ? best : Math.max(now, best ?? 0),
      bestScore: best,
      ...(met ? { completed: { by: "student" as const } } : {}),
    });
    // The evidence a question gives is its first answer in each attempt.
    for (const change of changes.filter(
      (item) =>
        item.studentId === studentId &&
        item.try === 1 &&
        item.block.standards?.length,
    ))
      await tellMarkedLesson(unit, {
        lessonId: shown.id,
        studentId,
        marks: [
          {
            attempt: change.attempt,
            blockId: change.block.id,
            standards: change.block.standards ?? [],
            fraction: change.fraction,
          },
        ],
        replace: true,
      });
  }
  return changes.length;
}
