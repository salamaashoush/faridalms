import * as v from "valibot";

import type {
  AutoBlock,
  CheckView,
  LessonDocument,
  LessonResponse,
  ResponseRow,
  StoredTry,
} from "./learning";

import {
  autoBlocks,
  checkStates,
  describeCheck,
  markResponse,
  responseSchema,
  shuffled,
} from "./learning";

/** Questions in one mixed review: enough to mix lessons, few enough to finish. */
export const PRACTICE_SIZE = 8;
/** Fewer than this and there is nothing to mix yet. */
export const PRACTICE_LEAST = 3;

export interface PracticeSource {
  lessonId: string;
  document: LessonDocument;
  /** The student's tries in the lesson's first attempt. */
  rows: readonly ResponseRow[];
}

export interface PracticeItem {
  lessonId: string;
  block: AutoBlock;
  /** Not right the first time the student met it. */
  missed: boolean;
}

/** Takes from each list in turn, so neighbours come from different lessons. */
function inTurn<T>(lists: readonly T[][]): T[] {
  const result: T[] = [];
  const longest = Math.max(0, ...lists.map((list) => list.length));
  for (let index = 0; index < longest; index++)
    for (const list of lists) {
      const item = list[index];
      if (item !== undefined) result.push(item);
    }
  return result;
}

/**
 * A mixed review from lessons a student has done: questions they missed the
 * first time come first, and lessons take turns so no two neighbours share
 * one, as interleaved practice does (grade 7, 61 against 38 percent a month
 * on). The same seed gives the same set.
 */
export function practiceItems(
  sources: readonly PracticeSource[],
  seed: string,
  size = PRACTICE_SIZE,
): PracticeItem[] {
  const perLesson = shuffled([...sources], `${seed}:lessons`).map((source) => {
    const states = checkStates(source.document, source.rows);
    return shuffled(
      autoBlocks(source.document).map((block) => ({
        lessonId: source.lessonId,
        block,
        missed: !states[block.id]?.firstTryCorrect,
      })),
      `${seed}:${source.lessonId}`,
    );
  });
  const missed = inTurn(
    perLesson.map((items) => items.filter((item) => item.missed)),
  );
  const rest = inTurn(
    perLesson.map((items) => items.filter((item) => !item.missed)),
  );
  return [...missed, ...rest].slice(0, size);
}

/**
 * How a practice question stands after one more try, or after asking for
 * the answer: marked as a lesson marks it, its hint after a miss and its
 * answer once settled, with nothing kept.
 */
export function practiceView(
  block: AutoBlock,
  before: number,
  answer: { response: LessonResponse } | { reveal: true },
): CheckView {
  // Earlier tries were misses, or the question would be settled already.
  const earlier: StoredTry[] = Array.from({ length: before }, (_, index) => ({
    blockId: block.id,
    try: index + 1,
    state: "answered",
    fraction: 0,
    response: {},
    feedback: null,
  }));
  const last: StoredTry =
    "reveal" in answer
      ? {
          blockId: block.id,
          try: before,
          state: "revealed",
          fraction: 0,
          response: {},
          feedback: null,
        }
      : {
          blockId: block.id,
          try: before + 1,
          state: "answered",
          fraction: markResponse(block, answer.response).fraction,
          response: answer.response,
          feedback: null,
        };
  const rows = [...earlier, last];
  // Practice answers at once, whenever the lesson it came from waited.
  const now = { ...block, feedbackAt: "now" as const };
  return describeCheck(
    now,
    rows,
    checkStates({ version: 2, blocks: [now] }, rows)[block.id],
  );
}

const id = v.pipe(v.string(), v.uuid());

export const practiceSetSchema = v.object({
  moduleId: id,
  /** Another set of the same lessons, for one more go the same day. */
  round: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(50)),
    0,
  ),
});

export const practiceCheckSchema = v.object({
  lessonId: id,
  blockId: id,
  /** Tries already made at this question in the review. */
  before: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(20)),
  answer: v.variant("kind", [
    v.object({ kind: v.literal("response"), response: responseSchema }),
    v.object({ kind: v.literal("reveal") }),
  ]),
});
