import * as v from "valibot";

import type { ContentDocument } from "./content";

import { matchAnswer, parseNumber } from "./answers";
import { contentDocumentSchema, contentPlainText } from "./content";

export const SCHOOL_FEATURES = ["elearning"] as const;
export type SchoolFeature = (typeof SCHOOL_FEATURES)[number];

export const MODULE_STATES = ["draft", "published", "archived"] as const;
export type ModuleState = (typeof MODULE_STATES)[number];
export const LESSON_COMPLETIONS = [
  "view",
  "mark",
  "quiz",
  "score",
  "reflection",
] as const;
export type LessonCompletion = (typeof LESSON_COMPLETIONS)[number];
export const LESSON_MEDIA_BYTES = 200 * 1024 * 1024;
export const MAX_LESSON_BLOCKS = 60;
export const MAX_CHOICE_OPTIONS = 8;
export const MAX_ACCEPTED_ANSWERS = 10;
export const MAX_GAPS = 20;
export const MAX_PAIRS = 8;
export const MAX_DISTRACTORS = 4;
export const MAX_ORDER_ITEMS = 10;
export const MAX_SORT_GROUPS = 4;
export const MAX_SORT_ITEMS = 20;
export const MAX_MODULE_CLASSES = 20;
/** Taken off a check's credit for each try after the first, as Moodle's interactive mode does. */
export const TRY_PENALTY = 1 / 3;

const id = v.pipe(v.string(), v.uuid());
const optionalId = v.optional(v.union([v.literal(""), id]), "");
const text = (max: number) => v.pipe(v.string(), v.trim(), v.maxLength(max));
const requiredText = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
const version = (min: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min));

/** A soundtrack needs captions, or for audio alone a transcript (WCAG 1.2.1). */
export function needsCaptions(mediaType: string): boolean {
  return mediaType.startsWith("video/");
}
export const needsTranscript = (mediaType: string) =>
  mediaType.startsWith("audio/");

/** What every question shares: how it is asked, what it is worth, and how it helps. */
const checkFields = {
  id,
  prompt: requiredText(1000),
  /** 0 counts for nothing; a practice question still gives feedback. */
  points: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100)),
  hint: text(500),
  explanation: text(1000),
  /** Tries before the answer is shown; null lets the student keep trying until they ask. */
  tries: v.nullable(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10)),
  ),
};

const accepted = v.pipe(
  v.array(requiredText(200)),
  v.minLength(1),
  v.maxLength(MAX_ACCEPTED_ANSWERS),
);

const matching = {
  caseSensitive: v.boolean(),
  /** Forgive a slip or two in spelling. */
  closeEnough: v.boolean(),
  tehMarbuta: v.boolean(),
};

export const choiceOptionSchema = v.object({
  id,
  text: requiredText(300),
  /** Shown to a student who picks this option. */
  feedback: text(300),
});

const gapSegment = v.variant("type", [
  v.object({
    type: v.literal("text"),
    text: v.pipe(v.string(), v.maxLength(2000)),
  }),
  v.pipe(
    v.object({
      type: v.literal("gap"),
      id,
      answers: accepted,
      /** Words to choose from; none for a gap the student types into. */
      options: v.pipe(
        v.array(requiredText(100)),
        v.maxLength(MAX_CHOICE_OPTIONS),
      ),
    }),
    v.check(
      (gap) =>
        gap.options.length === 0 ||
        (gap.options.length >= 2 &&
          gap.answers.every((answer) => gap.options.includes(answer))),
      "learning.gap_options",
    ),
  ),
]);

export const lessonBlockSchema = v.variant("type", [
  v.object({ id, type: v.literal("content"), content: contentDocumentSchema }),
  v.pipe(
    v.object({
      id,
      type: v.literal("media"),
      fileId: id,
      name: requiredText(255),
      mediaType: requiredText(128),
      sizeBytes: v.pipe(v.number(), v.integer(), v.minValue(1)),
      caption: text(500),
      captionsFileId: v.nullable(id),
      captionsLang: v.picklist(["en", "ar"]),
      /** For audio alone, a transcript stands in for captions. */
      transcript: text(20000),
    }),
    v.check(
      (block) =>
        (!needsCaptions(block.mediaType) || block.captionsFileId !== null) &&
        (!needsTranscript(block.mediaType) ||
          block.captionsFileId !== null ||
          block.transcript !== ""),
      "learning.captions_required",
    ),
  ),
  v.object({
    id,
    type: v.literal("gate"),
    /** What opens the rest of the lesson; only work a student can finish alone. */
    requires: v.picklist(["above"]),
  }),
  v.pipe(
    v.object({
      ...checkFields,
      type: v.literal("choice"),
      options: v.pipe(
        v.array(choiceOptionSchema),
        v.minLength(2),
        v.maxLength(MAX_CHOICE_OPTIONS),
      ),
      correctOptionIds: v.pipe(v.array(id), v.minLength(1)),
      multiple: v.boolean(),
      shuffle: v.boolean(),
    }),
    v.check(
      (block) =>
        block.correctOptionIds.every((optionId) =>
          block.options.some((option) => option.id === optionId),
        ) &&
        (block.multiple || block.correctOptionIds.length === 1),
      "learning.correct_option",
    ),
  ),
  v.object({
    ...checkFields,
    ...matching,
    type: v.literal("text"),
    answers: accepted,
  }),
  v.pipe(
    v.object({
      ...checkFields,
      ...matching,
      type: v.literal("gaps"),
      segments: v.pipe(v.array(gapSegment), v.maxLength(MAX_GAPS * 2 + 1)),
    }),
    v.check((block) => {
      const gaps = block.segments.filter((segment) => segment.type === "gap");
      return gaps.length >= 1 && gaps.length <= MAX_GAPS;
    }, "learning.gaps_needed"),
  ),
  v.pipe(
    v.object({
      ...checkFields,
      type: v.literal("number"),
      /** An exact value within a tolerance, or any value in a range. */
      mode: v.picklist(["exact", "range"]),
      value: v.number(),
      tolerance: v.pipe(v.number(), v.minValue(0)),
      percent: v.boolean(),
      min: v.number(),
      max: v.number(),
    }),
    v.check(
      (block) => block.mode === "exact" || block.min <= block.max,
      "learning.number_range",
    ),
  ),
  v.object({
    ...checkFields,
    type: v.literal("matching"),
    pairs: v.pipe(
      v.array(
        v.object({ id, prompt: requiredText(300), answer: requiredText(300) }),
      ),
      v.minLength(2),
      v.maxLength(MAX_PAIRS),
    ),
    /** Answers that match no prompt, so the last pair is still a choice. */
    distractors: v.pipe(
      v.array(v.object({ id, text: requiredText(300) })),
      v.maxLength(MAX_DISTRACTORS),
    ),
  }),
  v.object({
    ...checkFields,
    type: v.literal("ordering"),
    /** In their right order; students see them shuffled. */
    items: v.pipe(
      v.array(v.object({ id, text: requiredText(300) })),
      v.minLength(2),
      v.maxLength(MAX_ORDER_ITEMS),
    ),
    /** Credit for the whole order only, or for each neighbouring pair in order. */
    scoring: v.picklist(["all", "neighbours"]),
  }),
  v.pipe(
    v.object({
      ...checkFields,
      type: v.literal("sorting"),
      groups: v.pipe(
        v.array(v.object({ id, name: requiredText(100) })),
        v.minLength(2),
        v.maxLength(MAX_SORT_GROUPS),
      ),
      items: v.pipe(
        v.array(v.object({ id, text: requiredText(300), groupId: id })),
        v.minLength(2),
        v.maxLength(MAX_SORT_ITEMS),
      ),
    }),
    v.check(
      (block) =>
        block.items.every((item) =>
          block.groups.some((group) => group.id === item.groupId),
        ),
      "learning.sort_group",
    ),
  ),
  v.object({
    ...checkFields,
    type: v.literal("written"),
    /** Null for no limit. */
    wordLimit: v.nullable(
      v.pipe(v.number(), v.integer(), v.minValue(10), v.maxValue(5000)),
    ),
  }),
]);
export type LessonBlock = v.InferOutput<typeof lessonBlockSchema>;
export type LessonBlockType = LessonBlock["type"];
export type ChoiceBlock = Extract<LessonBlock, { type: "choice" }>;
export type TextBlock = Extract<LessonBlock, { type: "text" }>;
export type GapsBlock = Extract<LessonBlock, { type: "gaps" }>;
export type NumberBlock = Extract<LessonBlock, { type: "number" }>;
export type MatchingBlock = Extract<LessonBlock, { type: "matching" }>;
export type OrderingBlock = Extract<LessonBlock, { type: "ordering" }>;
export type SortingBlock = Extract<LessonBlock, { type: "sorting" }>;
export type WrittenBlock = Extract<LessonBlock, { type: "written" }>;
/** A question the server marks the moment it is answered. */
export type AutoBlock =
  | ChoiceBlock
  | TextBlock
  | GapsBlock
  | NumberBlock
  | MatchingBlock
  | OrderingBlock
  | SortingBlock;
export type CheckBlock = AutoBlock | WrittenBlock;

const AUTO_TYPES = new Set<LessonBlockType>([
  "choice",
  "text",
  "gaps",
  "number",
  "matching",
  "ordering",
  "sorting",
]);

export const isAuto = (block: LessonBlock): block is AutoBlock =>
  AUTO_TYPES.has(block.type);
export const isCheck = (block: LessonBlock): block is CheckBlock =>
  isAuto(block) || block.type === "written";

export const lessonDocumentSchema = v.pipe(
  v.object({
    version: v.literal(2),
    blocks: v.pipe(v.array(lessonBlockSchema), v.maxLength(MAX_LESSON_BLOCKS)),
  }),
  v.check(
    (document) =>
      new Set(document.blocks.map((block) => block.id)).size ===
      document.blocks.length,
    "learning.duplicate_ids",
  ),
);
export type LessonDocument = v.InferOutput<typeof lessonDocumentSchema>;

export function emptyLesson(): LessonDocument {
  return { version: 2, blocks: [] };
}

export function contentBlock(content: ContentDocument): LessonBlock {
  return { id: crypto.randomUUID(), type: "content", content };
}

/**
 * A lesson saved before questions had points, hints and feedback, in today's
 * shape: its quizzes become choice questions and its reflections unmarked
 * written answers. Published versions keep whatever shape they had.
 */
export function upgradeLesson(value: unknown): LessonDocument {
  const document = (value ?? {}) as {
    version?: number;
    blocks?: Record<string, unknown>[];
  };
  if (document.version === 2) return document as LessonDocument;
  const blocks = (document.blocks ?? []).map((block): LessonBlock => {
    switch (block.type) {
      case "quiz": {
        const correct = (block.correctOptionIds as string[] | undefined) ?? [];
        return {
          id: block.id as string,
          type: "choice",
          prompt: (block.question as string | undefined) ?? "",
          points: 1,
          hint: "",
          explanation: (block.explanation as string | undefined) ?? "",
          tries: null,
          options: (
            (block.options as { id: string; text: string }[] | undefined) ?? []
          ).map((option) => ({ ...option, feedback: "" })),
          correctOptionIds: correct,
          multiple: correct.length > 1,
          shuffle: false,
        };
      }
      case "reflection":
        return {
          id: block.id as string,
          type: "written",
          prompt: (block.prompt as string | undefined) ?? "",
          points: 0,
          hint: "",
          explanation: "",
          tries: null,
          wordLimit: null,
        };
      case "media":
        return { transcript: "", ...block } as LessonBlock;
      default:
        return block as LessonBlock;
    }
  });
  return { version: 2, blocks };
}

type GapSegment = GapsBlock["segments"][number];

/**
 * A passage with its blanks in square brackets, as a teacher types it:
 * [answer/another] for a blank typed into, any of them accepted, and
 * [right|wrong|wrong] for one chosen from a list, the first choice right.
 * Blanks keep the ids they had by position, so answers already given still
 * line up after an edit.
 */
export function parseGaps(
  source: string,
  ids: readonly string[] = [],
): GapSegment[] {
  const segments: GapSegment[] = [];
  let at = 0;
  let gap = 0;
  for (const match of source.matchAll(/\[([^[\]]*)\]/g)) {
    if (match.index > at)
      segments.push({ type: "text", text: source.slice(at, match.index) });
    const inner = match[1] ?? "";
    const listed = inner.includes("|");
    const parts = inner
      .split(listed ? "|" : "/")
      .map((part) => part.trim())
      .filter(Boolean);
    segments.push({
      type: "gap",
      id: ids[gap] ?? crypto.randomUUID(),
      answers: listed ? parts.slice(0, 1) : parts,
      options: listed ? [...new Set(parts)] : [],
    });
    gap++;
    at = match.index + match[0].length;
  }
  if (at < source.length)
    segments.push({ type: "text", text: source.slice(at) });
  return segments;
}

export function gapsSource(segments: readonly GapSegment[]): string {
  return segments
    .map((segment) => {
      if (segment.type === "text") return segment.text;
      if (segment.options.length === 0) return `[${segment.answers.join("/")}]`;
      const right = segment.answers[0] ?? "";
      return `[${[right, ...segment.options.filter((option) => option !== right)].join("|")}]`;
    })
    .join("");
}

function gapText(block: GapsBlock): string {
  return block.segments
    .map((segment) => (segment.type === "text" ? segment.text : "___"))
    .join("");
}

export function lessonPlainText(document: LessonDocument): string {
  return document.blocks
    .map((block) => {
      switch (block.type) {
        case "content":
          return contentPlainText(block.content);
        case "media":
          return [block.name, block.caption, block.transcript]
            .filter(Boolean)
            .join("\n");
        case "gate":
          return "";
        case "gaps":
          return [block.prompt, gapText(block)].join("\n");
        case "matching":
          return [
            block.prompt,
            ...block.pairs.map((pair) => `${pair.prompt}: ${pair.answer}`),
          ].join("\n");
        case "ordering":
          return [block.prompt, ...block.items.map((item) => item.text)].join(
            "\n",
          );
        case "sorting":
          return [
            block.prompt,
            ...block.groups.map((group) => group.name),
            ...block.items.map((item) => item.text),
          ].join("\n");
        default:
          return block.prompt;
      }
    })
    .filter(Boolean)
    .join("\n\n");
}

/** Files the lesson shows, with the pictures and files its text embeds. */
export function lessonFileIds(document: LessonDocument): string[] {
  return [
    ...new Set(
      document.blocks.flatMap((block) =>
        block.type === "media"
          ? [
              block.fileId,
              ...(block.captionsFileId ? [block.captionsFileId] : []),
            ]
          : [],
      ),
    ),
  ];
}

export const checkBlocks = (document: LessonDocument): CheckBlock[] =>
  document.blocks.filter(isCheck);
export const autoBlocks = (document: LessonDocument): AutoBlock[] =>
  document.blocks.filter(isAuto);

/** What a student sends for each kind of question. */
export const responseSchema = v.variant("type", [
  v.object({
    type: v.literal("choice"),
    optionIds: v.pipe(
      v.array(id),
      v.minLength(1),
      v.maxLength(MAX_CHOICE_OPTIONS),
    ),
  }),
  v.object({ type: v.literal("text"), text: requiredText(500) }),
  v.object({
    type: v.literal("gaps"),
    answers: v.record(id, text(200)),
  }),
  v.object({ type: v.literal("number"), text: requiredText(60) }),
  v.object({ type: v.literal("matching"), pairs: v.record(id, id) }),
  v.object({
    type: v.literal("ordering"),
    order: v.pipe(v.array(id), v.minLength(2), v.maxLength(MAX_ORDER_ITEMS)),
  }),
  v.object({ type: v.literal("sorting"), groups: v.record(id, id) }),
  v.object({ type: v.literal("written"), text: requiredText(20000) }),
]);
export type LessonResponse = v.InferOutput<typeof responseSchema>;

export interface Marked {
  /** From 0 to 1; partial credit where the question allows it. */
  fraction: number;
  correct: boolean;
  /** The feedback of each option the student chose. */
  feedback: string[];
  /** Per blank, pair or item, whether it was right. */
  parts: Record<string, boolean>;
}

const round = (value: number) => Math.round(value * 10000) / 10000;

/**
 * Marks an answer to a question the server can mark. A multiple-answer
 * question gives credit per right choice and takes it back per wrong one,
 * never below nothing, as Canvas does.
 */
export function markResponse(
  block: AutoBlock,
  response: LessonResponse,
): Marked {
  const none: Marked = { fraction: 0, correct: false, feedback: [], parts: {} };
  const share = (results: Record<string, boolean>): Marked => {
    const values = Object.values(results);
    const hits = values.filter(Boolean).length;
    return {
      ...none,
      fraction: round(hits / values.length),
      correct: hits === values.length,
      parts: results,
    };
  };
  switch (block.type) {
    case "choice": {
      if (response.type !== "choice") return none;
      const chosen = new Set(response.optionIds);
      const right = new Set(block.correctOptionIds);
      const feedback = block.options
        .filter((option) => chosen.has(option.id) && option.feedback)
        .map((option) => option.feedback);
      const exact =
        chosen.size === right.size &&
        [...chosen].every((one) => right.has(one));
      if (!block.multiple)
        return { ...none, fraction: exact ? 1 : 0, correct: exact, feedback };
      const hits = [...chosen].filter((one) => right.has(one)).length;
      const misses = chosen.size - hits;
      return {
        ...none,
        fraction: round(Math.max(0, (hits - misses) / right.size)),
        correct: exact,
        feedback,
      };
    }
    case "text": {
      if (response.type !== "text") return none;
      const correct = matchAnswer(response.text, block.answers, block) !== null;
      return { ...none, fraction: correct ? 1 : 0, correct };
    }
    case "gaps": {
      if (response.type !== "gaps") return none;
      const gaps = block.segments.filter((segment) => segment.type === "gap");
      const results = Object.fromEntries(
        gaps.map((gap) => {
          const typed = response.answers[gap.id] ?? "";
          const right =
            gap.options.length > 0
              ? gap.answers.includes(typed)
              : matchAnswer(typed, gap.answers, block) !== null;
          return [gap.id, right];
        }),
      );
      return share(results);
    }
    case "number": {
      if (response.type !== "number") return none;
      const given = parseNumber(response.text);
      if (given === null) return none;
      const correct =
        block.mode === "range"
          ? given >= block.min && given <= block.max
          : Math.abs(given - block.value) <=
            (block.percent
              ? (Math.abs(block.value) * block.tolerance) / 100
              : block.tolerance) +
              1e-9;
      return { ...none, fraction: correct ? 1 : 0, correct };
    }
    case "matching": {
      if (response.type !== "matching") return none;
      // Compared by text, so two prompts sharing an answer accept either copy.
      const texts = new Map([
        ...block.pairs.map((pair) => [pair.id, pair.answer] as const),
        ...block.distractors.map((other) => [other.id, other.text] as const),
      ]);
      return share(
        Object.fromEntries(
          block.pairs.map((pair) => {
            const chosen = response.pairs[pair.id];
            return [
              pair.id,
              chosen !== undefined && texts.get(chosen) === pair.answer,
            ];
          }),
        ),
      );
    }
    case "ordering": {
      if (response.type !== "ordering") return none;
      const expected = block.items.map((item) => item.id);
      const { order } = response;
      if (
        order.length !== expected.length ||
        new Set(order).size !== order.length ||
        !order.every((itemId) => expected.includes(itemId))
      )
        return none;
      const parts = Object.fromEntries(
        order.map((itemId, index) => [itemId, expected[index] === itemId]),
      );
      const exact = Object.values(parts).every(Boolean);
      if (block.scoring === "all")
        return { ...none, fraction: exact ? 1 : 0, correct: exact, parts };
      let neighbours = 0;
      for (let index = 0; index < order.length - 1; index++)
        if (
          expected.indexOf(order[index + 1] ?? "") ===
          expected.indexOf(order[index] ?? "") + 1
        )
          neighbours++;
      return {
        ...none,
        fraction: round(neighbours / (order.length - 1)),
        correct: exact,
        parts,
      };
    }
    case "sorting": {
      if (response.type !== "sorting") return none;
      return share(
        Object.fromEntries(
          block.items.map((item) => [
            item.id,
            response.groups[item.id] === item.groupId,
          ]),
        ),
      );
    }
  }
  return none;
}

/** Where a student stands on one question, from their tries so far. */
export interface CheckState {
  tries: number;
  fraction: number;
  correct: boolean;
  /** They asked to see the answer, or ran out of tries. */
  revealed: boolean;
  /** For a written answer: marked by the teacher, and with what feedback. */
  marked: boolean;
  firstTryCorrect: boolean;
}

/** Whether a question is settled: answered right, revealed, or for a written one, sent. */
export const settled = (block: CheckBlock, state: CheckState | undefined) =>
  state !== undefined &&
  (block.type === "written"
    ? state.tries > 0
    : state.correct || state.revealed);

/** Credit for a question: its best try, less a share for each extra try, nothing once revealed. */
export function creditOf(state: CheckState | undefined): number {
  if (!state || state.tries === 0) return 0;
  if (state.revealed && !state.correct) return 0;
  return Math.max(0, state.fraction - TRY_PENALTY * (state.tries - 1));
}

/**
 * A lesson's score from its auto-marked questions, weighted by points, or
 * null when it has none that count.
 */
export function lessonScore(
  document: LessonDocument,
  states: Record<string, CheckState>,
): number | null {
  const counted = autoBlocks(document).filter((block) => block.points > 0);
  const total = counted.reduce((sum, block) => sum + block.points, 0);
  if (total === 0) return null;
  const earned = counted.reduce(
    (sum, block) => sum + block.points * creditOf(states[block.id]),
    0,
  );
  return Math.round((earned / total) * 100);
}

/**
 * Whether a student's work finishes a lesson on its own. "Mark" needs the
 * student to say so; "view" is finished by opening it.
 */
export function completionMet(
  lesson: { completion: LessonCompletion; passScore: number | null },
  document: LessonDocument,
  states: Record<string, CheckState>,
): boolean {
  const auto = autoBlocks(document);
  const written = document.blocks.filter(
    (block): block is WrittenBlock => block.type === "written",
  );
  switch (lesson.completion) {
    case "view":
      return true;
    case "mark":
      return false;
    case "quiz":
      return auto.every((block) => settled(block, states[block.id]));
    case "score":
      return (
        auto.every((block) => settled(block, states[block.id])) &&
        (lessonScore(document, states) ?? 0) >= (lesson.passScore ?? 100)
      );
    case "reflection":
      return written.every((block) => settled(block, states[block.id]));
  }
  return false;
}

/**
 * A block as its student receives it: keys, hints, explanations and option
 * feedback stay on the server until a try calls for them.
 */
export type StudentBlock =
  | Exclude<LessonBlock, CheckBlock>
  | Omit<WrittenBlock, "explanation" | "hint">
  | (Omit<
      ChoiceBlock,
      "correctOptionIds" | "explanation" | "hint" | "options"
    > & {
      options: { id: string; text: string }[];
    })
  | Omit<TextBlock, "answers" | "explanation" | "hint">
  | (Omit<GapsBlock, "explanation" | "hint" | "segments"> & {
      segments: (
        | { type: "text"; text: string }
        | { type: "gap"; id: string; options: string[] }
      )[];
    })
  | Pick<NumberBlock, "id" | "type" | "prompt" | "points" | "tries">
  | (Omit<MatchingBlock, "distractors" | "explanation" | "hint" | "pairs"> & {
      prompts: { id: string; text: string }[];
      choices: { id: string; text: string }[];
    })
  | Omit<OrderingBlock, "explanation" | "hint">
  | (Omit<SortingBlock, "explanation" | "hint" | "items"> & {
      items: { id: string; text: string }[];
    });

function shuffled<T>(items: T[], seed: string): T[] {
  let state = 0;
  for (const char of seed)
    state = (Math.imul(state, 31) + char.charCodeAt(0)) | 0;
  const random = () => {
    state = (Math.imul(state ^ (state >>> 15), 2246822507) + 0x9e3779b9) | 0;
    return ((state >>> 0) % 100000) / 100000;
  };
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other] as T, copy[index] as T];
  }
  return copy;
}

/**
 * A lesson as its student may see it before answering. Options that shuffle
 * keep one order per student, so a reload never reshuffles an answer.
 */
export function studentBlocks(
  document: LessonDocument,
  seed: string,
): StudentBlock[] {
  return document.blocks.map((block): StudentBlock => {
    switch (block.type) {
      case "choice": {
        const {
          correctOptionIds: _key,
          explanation: _why,
          hint: _hint,
          ...rest
        } = block;
        const options = block.options.map(({ id: optionId, text: label }) => ({
          id: optionId,
          text: label,
        }));
        return {
          ...rest,
          options: block.shuffle
            ? shuffled(options, `${seed}:${block.id}`)
            : options,
        };
      }
      case "text": {
        const {
          answers: _answers,
          explanation: _why,
          hint: _hint,
          ...rest
        } = block;
        return rest;
      }
      case "gaps": {
        const { explanation: _why, hint: _hint, ...rest } = block;
        return {
          ...rest,
          segments: block.segments.map((segment) =>
            segment.type === "text"
              ? segment
              : {
                  type: "gap" as const,
                  id: segment.id,
                  options: shuffled(segment.options, `${seed}:${segment.id}`),
                },
          ),
        };
      }
      case "number":
        return {
          id: block.id,
          type: block.type,
          prompt: block.prompt,
          points: block.points,
          tries: block.tries,
        };
      case "matching": {
        const {
          pairs,
          distractors,
          explanation: _why,
          hint: _hint,
          ...rest
        } = block;
        // One choice per distinct answer, so a repeated answer is not a clue.
        const seen = new Set<string>();
        const choices = [
          ...pairs.map((pair) => ({ id: pair.id, text: pair.answer })),
          ...distractors,
        ].filter((choice) => {
          if (seen.has(choice.text)) return false;
          seen.add(choice.text);
          return true;
        });
        return {
          ...rest,
          prompts: pairs.map((pair) => ({ id: pair.id, text: pair.prompt })),
          choices: shuffled(choices, `${seed}:${block.id}`),
        };
      }
      case "ordering": {
        const { explanation: _why, hint: _hint, ...rest } = block;
        let items = shuffled(block.items, `${seed}:${block.id}`);
        // A shuffle that lands on the answer would hand it over; turn it once.
        if (items.every((item, index) => item.id === block.items[index]?.id))
          items = [...items.slice(1), ...items.slice(0, 1)];
        return { ...rest, items };
      }
      case "sorting": {
        const { explanation: _why, hint: _hint, items, ...rest } = block;
        return {
          ...rest,
          items: shuffled(
            items.map((item) => ({ id: item.id, text: item.text })),
            `${seed}:${block.id}`,
          ),
        };
      }
      case "written": {
        const { explanation: _why, hint: _hint, ...rest } = block;
        return rest;
      }
      default:
        return block;
    }
  });
}

/** The answer to show once a question is settled. */
export function answerKey(block: AutoBlock): string[] {
  switch (block.type) {
    case "choice":
      return block.correctOptionIds;
    case "text":
      return block.answers.slice(0, 1);
    case "gaps":
      return block.segments.flatMap((segment) =>
        segment.type === "gap" ? [segment.answers[0] ?? ""] : [],
      );
    case "number":
      return [
        block.mode === "range"
          ? `${block.min} – ${block.max}`
          : block.tolerance > 0
            ? `${block.value} ± ${block.tolerance}${block.percent ? "%" : ""}`
            : String(block.value),
      ];
    case "matching":
      return block.pairs.map((pair) => `${pair.prompt}: ${pair.answer}`);
    case "ordering":
      return block.items.map((item) => item.text);
    case "sorting":
      return block.items.map(
        (item) =>
          `${item.text}: ${block.groups.find((group) => group.id === item.groupId)?.name ?? ""}`,
      );
  }
  return [];
}

/** The right answer for each blank, pair or item, shown beside it once settled. */
export function partKey(block: AutoBlock): Record<string, string> {
  switch (block.type) {
    case "gaps":
      return Object.fromEntries(
        block.segments.flatMap((segment) =>
          segment.type === "gap"
            ? [[segment.id, segment.answers[0] ?? ""]]
            : [],
        ),
      );
    case "matching":
      return Object.fromEntries(
        block.pairs.map((pair) => [pair.id, pair.answer]),
      );
    case "ordering":
      return Object.fromEntries(
        block.items.map((item, index) => [item.id, String(index + 1)]),
      );
    case "sorting":
      return Object.fromEntries(
        block.items.map((item) => [
          item.id,
          block.groups.find((group) => group.id === item.groupId)?.name ?? "",
        ]),
      );
    default:
      return {};
  }
}

export const saveModuleSchema = v.object({
  id: optionalId,
  expectedVersion: version(0),
  title: requiredText(200),
  summary: text(1000),
  classIds: v.pipe(
    v.array(id),
    v.minLength(1),
    v.maxLength(MAX_MODULE_CLASSES),
  ),
  prerequisiteId: optionalId,
  sequential: v.boolean(),
});
export type SaveModule = v.InferOutput<typeof saveModuleSchema>;

export const publishModuleSchema = v.object({
  id,
  expectedVersion: version(1),
  /** Empty to open now, or when it should open. */
  publishAt: v.optional(
    v.union([v.literal(""), v.pipe(v.string(), v.isoTimestamp())]),
    "",
  ),
});

export const moduleRefSchema = v.object({ id, expectedVersion: version(1) });

export const duplicateModuleSchema = v.object({
  id,
  classIds: v.pipe(
    v.array(id),
    v.minLength(1),
    v.maxLength(MAX_MODULE_CLASSES),
  ),
});

export const saveLessonSchema = v.pipe(
  v.object({
    id: optionalId,
    moduleId: id,
    expectedVersion: version(0),
    title: requiredText(200),
    completion: v.picklist(LESSON_COMPLETIONS),
    passScore: v.nullable(
      v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
    ),
    content: lessonDocumentSchema,
    /** Put the saved lesson in front of students at once, when its module is open. */
    publish: v.optional(v.boolean(), false),
  }),
  v.forward(
    v.check(
      (input) => (input.completion === "score") === (input.passScore !== null),
      "learning.pass_score",
    ),
    ["passScore"],
  ),
  v.forward(
    v.check(
      (input) =>
        !["quiz", "score"].includes(input.completion) ||
        autoBlocks(input.content).length > 0,
      "learning.needs_quiz",
    ),
    ["completion"],
  ),
  v.forward(
    v.check(
      (input) =>
        input.completion !== "reflection" ||
        input.content.blocks.some((block) => block.type === "written"),
      "learning.needs_reflection",
    ),
    ["completion"],
  ),
);
export type SaveLesson = v.InferOutput<typeof saveLessonSchema>;

export const moveLessonSchema = v.object({
  id,
  position: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(999)),
});

export const respondSchema = v.object({
  lessonId: id,
  blockId: id,
  response: responseSchema,
});

/** A student gives up on a question and asks to see its answer. */
export const revealSchema = v.object({ lessonId: id, blockId: id });

/** A teacher marks a written answer, with credit out of the question's points. */
export const markSchema = v.object({
  lessonId: id,
  blockId: id,
  studentId: id,
  points: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
  feedback: text(2000),
});

export const positionSchema = v.object({
  lessonId: id,
  blockId: v.pipe(v.string(), v.maxLength(64)),
});

export const overrideSchema = v.object({
  lessonId: id,
  studentId: id,
  completed: v.boolean(),
});

export const progressQuerySchema = v.object({ moduleId: id, classId: id });

/** One stored try, as the responses ledger holds it. */
export interface ResponseRow {
  blockId: string;
  try: number;
  state: "answered" | "revealed" | "needs_marking" | "marked";
  fraction: number | null;
}

/**
 * Each question's state in one attempt, from its rows in order. A question
 * with limited tries is revealed once they run out; a written answer takes
 * the fraction of its latest mark.
 */
export function checkStates(
  document: LessonDocument,
  rows: readonly ResponseRow[],
): Record<string, CheckState> {
  const states: Record<string, CheckState> = {};
  for (const block of checkBlocks(document)) {
    const mine = rows.filter((row) => row.blockId === block.id);
    const answered = mine.filter(
      (row) => row.state === "answered" || row.state === "needs_marking",
    );
    const last = answered.at(-1);
    const mark = mine.findLast((row) => row.state === "marked");
    const tries =
      answered.length === 0 ? 0 : Math.max(...answered.map((row) => row.try));
    const fraction =
      block.type === "written" ? (mark?.fraction ?? 0) : (last?.fraction ?? 0);
    const correct = block.type === "written" ? false : fraction === 1;
    states[block.id] = {
      tries,
      fraction,
      correct,
      revealed:
        block.type !== "written" &&
        (mine.some((row) => row.state === "revealed") ||
          (!correct && block.tries !== null && tries >= block.tries)),
      marked: mark !== undefined,
      firstTryCorrect: answered.some(
        (row) => row.try === 1 && row.fraction === 1,
      ),
    };
  }
  return states;
}

/** A stored try with what the student sent and any teacher feedback. */
export interface StoredTry extends ResponseRow {
  response: Record<string, unknown>;
  feedback: string | null;
}

/** What a student is shown about one question: their tries so far, and the answer once it is settled. */
export interface CheckView {
  tries: number;
  response: LessonResponse | null;
  correct: boolean;
  revealed: boolean;
  fraction: number;
  triesLeft: number | null;
  feedback: string[];
  parts: Record<string, boolean>;
  /** Offered after a wrong try, before the answer is shown. */
  hint: string | null;
  key: string[] | null;
  partKey: Record<string, string> | null;
  explanation: string | null;
  marked: boolean;
  /** Points a written answer earned, once marked. */
  credit: number | null;
  markFeedback: string | null;
}

export function describeCheck(
  block: CheckBlock,
  rows: readonly StoredTry[],
  state: CheckState | undefined,
): CheckView {
  const mine = rows.filter(
    (row) =>
      row.blockId === block.id &&
      (row.state === "answered" || row.state === "needs_marking"),
  );
  const response = (mine.at(-1)?.response ?? null) as LessonResponse | null;
  const mark = rows.findLast(
    (row) => row.blockId === block.id && row.state === "marked",
  );
  const tries = state?.tries ?? 0;
  const base: CheckView = {
    tries,
    response,
    correct: false,
    revealed: false,
    fraction: 0,
    triesLeft: null,
    feedback: [],
    parts: {},
    hint: null,
    key: null,
    partKey: null,
    explanation: null,
    marked: state?.marked ?? false,
    credit: null,
    markFeedback: null,
  };
  if (block.type === "written")
    return {
      ...base,
      credit:
        mark && block.points > 0 ? (mark.fraction ?? 0) * block.points : null,
      markFeedback: mark?.feedback ?? null,
    };
  const marked = response ? markResponse(block, response) : null;
  const open = settled(block, state);
  return {
    ...base,
    correct: state?.correct ?? false,
    revealed: state?.revealed ?? false,
    fraction: state?.fraction ?? 0,
    triesLeft: block.tries === null ? null : Math.max(0, block.tries - tries),
    feedback: marked?.feedback ?? [],
    parts: marked?.parts ?? {},
    hint: !open && marked && !marked.correct && block.hint ? block.hint : null,
    key: open ? answerKey(block) : null,
    partKey: open ? partKey(block) : null,
    explanation: open ? block.explanation : null,
  };
}

const CHECK_TYPES = new Set<LessonBlockType>([...AUTO_TYPES, "written"]);

/**
 * A quiz as its student sees it: a lesson's blocks, with the questions in the
 * student's own order when the teacher asks, text between them left where it
 * stands.
 */
export function studentQuiz(
  document: LessonDocument,
  seed: string,
  shuffle: boolean,
): StudentBlock[] {
  const blocks = studentBlocks(document, seed);
  if (!shuffle) return blocks;
  const slots = blocks.flatMap((block, index) =>
    CHECK_TYPES.has(block.type) ? [index] : [],
  );
  const order = shuffled(
    slots.map((slot) => blocks[slot] as StudentBlock),
    `${seed}:order`,
  );
  const result = [...blocks];
  slots.forEach((slot, index) => {
    result[slot] = order[index] as StudentBlock;
  });
  return result;
}

/** One stored quiz answer, as marked when its attempt was handed in. */
export interface QuizAnswer {
  blockId: string;
  response: Record<string, unknown>;
  fraction: number | null;
  state: "draft" | "marked" | "needs_marking";
  feedback: string | null;
}

/**
 * Each question's result in one handed-in attempt. "answers" shows the key,
 * explanation and option feedback; "marks" only whether each part was right.
 * Hints belong to practice and never show.
 */
export function quizViews(
  document: LessonDocument,
  answers: readonly QuizAnswer[],
  show: "answers" | "marks",
): Record<string, CheckView> {
  const blocks = checkBlocks(document);
  const rows: StoredTry[] = answers.flatMap((answer): StoredTry[] => {
    const block = blocks.find((item) => item.id === answer.blockId);
    if (!block) return [];
    const base = {
      blockId: answer.blockId,
      try: 1,
      response: answer.response,
      feedback: null,
    };
    if (block.type !== "written")
      return [{ ...base, state: "answered", fraction: answer.fraction ?? 0 }];
    const sent: StoredTry = { ...base, state: "needs_marking", fraction: null };
    return answer.state === "marked"
      ? [
          sent,
          {
            ...base,
            state: "marked",
            fraction: answer.fraction,
            feedback: answer.feedback,
          },
        ]
      : [sent];
  });
  const states = checkStates(document, rows);
  return Object.fromEntries(
    blocks.map((block) => {
      const state = states[block.id];
      const view = describeCheck(
        block,
        rows,
        state && isAuto(block) ? { ...state, revealed: true } : state,
      );
      const shown =
        show === "answers"
          ? view
          : {
              ...view,
              key: null,
              partKey: null,
              explanation: null,
              feedback: [],
            };
      return [block.id, { ...shown, hint: null, triesLeft: null }];
    }),
  );
}

const wordsIn = (value: string) => value.split(/\s+/).filter(Boolean).length;

/** Why an answer cannot be taken for this question, or null when it can. */
export function responseIssue(
  block: CheckBlock,
  response: LessonResponse,
): "learning.response" | "learning.option" | "learning.word_limit" | null {
  if (response.type !== block.type) return "learning.response";
  if (
    block.type === "choice" &&
    response.type === "choice" &&
    response.optionIds.some(
      (optionId) => !block.options.some((option) => option.id === optionId),
    )
  )
    return "learning.option";
  if (
    block.type === "written" &&
    response.type === "written" &&
    block.wordLimit !== null &&
    wordsIn(response.text) > block.wordLimit
  )
    return "learning.word_limit";
  return null;
}
