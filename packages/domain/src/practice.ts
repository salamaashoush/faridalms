import * as v from "valibot";

import type {
  AutoBlock,
  CheckBlock,
  CheckState,
  CheckView,
  LessonDocument,
  LessonResponse,
  ResponseRow,
  StoredTry,
} from "./learning";

import {
  autoBlocks,
  checkStates,
  creditOf,
  describeCheck,
  isAuto,
  markResponse,
  MAX_HINTS,
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
      // A poll asks an opinion, which is nothing to practise.
      autoBlocks(source.document)
        .filter((block) => block.type !== "poll")
        .map((block) => ({
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

/** What a student does next at a practice question. */
export type PracticeAnswer =
  | { kind: "response"; response: LessonResponse }
  | { kind: "reveal" }
  | { kind: "hint"; last: LessonResponse | null };

/**
 * How a practice question stands after one more try, after asking for its
 * next hint or for the answer, or before anything: marked as a lesson marks
 * it, a hint after each miss and each asked for, and its answer once
 * settled, with nothing kept.
 */
export function practiceView(
  block: AutoBlock,
  before: number,
  hints: number,
  answer: PracticeAnswer | null,
): CheckView {
  // Earlier tries were misses, or the question would be settled already.
  // Only the last of them shows, as the answer the student is looking at.
  const missed = (at: number, response: LessonResponse | null): StoredTry => ({
    blockId: block.id,
    try: at,
    state: "answered",
    fraction: response ? markResponse(block, response).fraction : 0,
    response: response ?? {},
    feedback: null,
  });
  const last = answer?.kind === "hint" ? answer.last : null;
  const earlier = Array.from({ length: before }, (_, index) =>
    missed(index + 1, index === before - 1 ? last : null),
  );
  const asked = Array.from(
    { length: hints + (answer?.kind === "hint" ? 1 : 0) },
    (): StoredTry => ({
      blockId: block.id,
      try: Math.max(1, before),
      state: "hint",
      fraction: null,
      response: {},
      feedback: null,
    }),
  );
  const next: StoredTry[] =
    answer?.kind === "response"
      ? [
          {
            blockId: block.id,
            try: before + 1,
            state: "answered",
            fraction: markResponse(block, answer.response).fraction,
            response: answer.response,
            feedback: null,
          },
        ]
      : answer?.kind === "reveal"
        ? [
            {
              blockId: block.id,
              try: before,
              state: "revealed",
              fraction: 0,
              response: {},
              feedback: null,
            },
          ]
        : [];
  const rows = [...earlier, ...asked, ...next];
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
  /** Hints already asked for at it. */
  hints: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(MAX_HINTS)),
    0,
  ),
  answer: v.variant("kind", [
    v.object({ kind: v.literal("response"), response: responseSchema }),
    v.object({ kind: v.literal("reveal") }),
    v.object({ kind: v.literal("hint"), last: v.nullable(responseSchema) }),
  ]),
});

/** What a practice quiz keeps of one question: the last answer, and how it came. */
export interface PracticeKept {
  response: LessonResponse | null;
  tries: number;
  hints: number;
  revealed: boolean;
}

/** Whether a question in a practice quiz is checked as it is answered; a program is marked by running it. */
export const practised = (block: CheckBlock): block is AutoBlock =>
  isAuto(block) && block.type !== "program";

/**
 * A practice quiz question as its student stands on it: its tries before
 * the last were misses, or it would have settled, so it reads as a lesson
 * question would, with the credit its tries and hints leave.
 */
export function practiceStanding(
  block: AutoBlock,
  kept: PracticeKept,
): { state: CheckState; view: CheckView; credit: number } {
  const now = { ...block, feedbackAt: "now" as const };
  const tried = (
    at: number,
    fraction: number,
    response: object,
  ): StoredTry => ({
    blockId: block.id,
    try: at,
    state: "answered",
    fraction,
    response: response as Record<string, unknown>,
    feedback: null,
  });
  const rows: StoredTry[] = [
    ...Array.from({ length: Math.max(0, kept.tries - 1) }, (_, index) =>
      tried(index + 1, 0, {}),
    ),
    ...(kept.tries > 0 && kept.response
      ? [
          tried(
            kept.tries,
            markResponse(now, kept.response).fraction,
            kept.response,
          ),
        ]
      : []),
    ...Array.from({ length: kept.hints }, (): StoredTry => ({
      blockId: block.id,
      try: Math.max(1, kept.tries),
      state: "hint",
      fraction: null,
      response: {},
      feedback: null,
    })),
    ...(kept.revealed
      ? [
          {
            blockId: block.id,
            try: Math.max(1, kept.tries),
            state: "revealed" as const,
            fraction: 0,
            response: {},
            feedback: null,
          },
        ]
      : []),
  ];
  const state = checkStates({ version: 2, blocks: [now] }, rows)[block.id] ?? {
    tries: 0,
    fraction: 0,
    correct: false,
    revealed: false,
    marked: false,
    firstTryCorrect: false,
    once: false,
    hints: 0,
    review: null,
  };
  return {
    state,
    view: describeCheck(now, rows, state),
    credit: creditOf(state),
  };
}
