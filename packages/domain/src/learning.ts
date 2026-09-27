import * as v from "valibot";

import type { ContentDocument } from "./content";

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
export const LESSON_BLOCK_TYPES = [
  "content",
  "media",
  "quiz",
  "reflection",
] as const;
export const LESSON_MEDIA_BYTES = 200 * 1024 * 1024;
export const MAX_LESSON_BLOCKS = 40;
export const MAX_QUIZ_OPTIONS = 6;
export const MAX_MODULE_CLASSES = 20;

const id = v.pipe(v.string(), v.uuid());
const optionalId = v.optional(v.union([v.literal(""), id]), "");
const text = (max: number) => v.pipe(v.string(), v.trim(), v.maxLength(max));
const requiredText = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
const version = (min: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min));

export function needsCaptions(mediaType: string): boolean {
  return mediaType.startsWith("video/") || mediaType.startsWith("audio/");
}

export const quizOptionSchema = v.object({ id, text: requiredText(300) });

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
      /** WebVTT captions, required for anything with a soundtrack. */
      captionsFileId: v.nullable(id),
      captionsLang: v.picklist(["en", "ar"]),
    }),
    v.check(
      (block) =>
        !needsCaptions(block.mediaType) || block.captionsFileId !== null,
      "learning.captions_required",
    ),
  ),
  v.pipe(
    v.object({
      id,
      type: v.literal("quiz"),
      question: requiredText(1000),
      options: v.pipe(
        v.array(quizOptionSchema),
        v.minLength(2),
        v.maxLength(MAX_QUIZ_OPTIONS),
      ),
      correctOptionIds: v.pipe(v.array(id), v.minLength(1)),
      explanation: text(1000),
    }),
    v.check(
      (block) =>
        block.correctOptionIds.every((optionId) =>
          block.options.some((option) => option.id === optionId),
        ),
      "learning.correct_option",
    ),
  ),
  v.object({ id, type: v.literal("reflection"), prompt: requiredText(1000) }),
]);
export type LessonBlock = v.InferOutput<typeof lessonBlockSchema>;
export type QuizBlock = Extract<LessonBlock, { type: "quiz" }>;

export const lessonDocumentSchema = v.pipe(
  v.object({
    version: v.literal(1),
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
  return { version: 1, blocks: [] };
}

export function contentBlock(content: ContentDocument): LessonBlock {
  return { id: crypto.randomUUID(), type: "content", content };
}

export function lessonPlainText(document: LessonDocument): string {
  return document.blocks
    .map((block) => {
      switch (block.type) {
        case "content":
          return contentPlainText(block.content);
        case "media":
          return [block.name, block.caption].filter(Boolean).join("\n");
        case "quiz":
          return block.question;
        case "reflection":
          return block.prompt;
      }
      throw new Error("learning.invalid_block");
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

export function quizBlocks(document: LessonDocument): QuizBlock[] {
  return document.blocks.filter(
    (block): block is QuizBlock => block.type === "quiz",
  );
}

/** A quiz is right when the chosen set equals the correct set, order aside. */
export function quizIsCorrect(block: QuizBlock, optionIds: string[]): boolean {
  const chosen = new Set(optionIds);
  const correct = new Set(block.correctOptionIds);
  return (
    chosen.size === correct.size &&
    [...chosen].every((optionId) => correct.has(optionId))
  );
}

export interface QuizAnswer {
  optionIds: string[];
  correct: boolean;
  tries: number;
}
export interface Reflection {
  text: string;
}
/** A student's work in one lesson, keyed by block id. */
export interface LessonAnswers {
  quiz: Record<string, QuizAnswer>;
  reflections: Record<string, Reflection>;
}

export function answersOf(value: unknown): LessonAnswers {
  const record =
    value && typeof value === "object" ? (value as Partial<LessonAnswers>) : {};
  return { quiz: record.quiz ?? {}, reflections: record.reflections ?? {} };
}

/** The share of a lesson's quizzes answered right, or null when it has none. */
export function lessonScore(
  document: LessonDocument,
  answers: LessonAnswers,
): number | null {
  const quizzes = quizBlocks(document);
  if (quizzes.length === 0) return null;
  const right = quizzes.filter((block) => answers.quiz[block.id]?.correct);
  return Math.round((right.length / quizzes.length) * 100);
}

/**
 * Whether a student's work finishes a lesson on its own. "Mark" needs the
 * student to say so; "view" is finished by opening it.
 */
export function completionMet(
  lesson: { completion: LessonCompletion; passScore: number | null },
  document: LessonDocument,
  answers: LessonAnswers,
): boolean {
  const quizzes = quizBlocks(document);
  const reflections = document.blocks.filter(
    (block) => block.type === "reflection",
  );
  switch (lesson.completion) {
    case "view":
      return true;
    case "mark":
      return false;
    case "quiz":
      return quizzes.every((block) => block.id in answers.quiz);
    case "score":
      return (
        quizzes.every((block) => block.id in answers.quiz) &&
        (lessonScore(document, answers) ?? 0) >= (lesson.passScore ?? 100)
      );
    case "reflection":
      return reflections.every(
        (block) => (answers.reflections[block.id]?.text ?? "").trim() !== "",
      );
  }
  return false;
}

export type StudentBlock =
  | Exclude<LessonBlock, QuizBlock>
  | (Omit<QuizBlock, "correctOptionIds" | "explanation"> & {
      multiple: boolean;
    });

/**
 * A lesson as a student may see it before answering: no answers, no
 * explanations, only whether a question has more than one right option.
 */
export function studentBlocks(document: LessonDocument): StudentBlock[] {
  return document.blocks.map((block) => {
    if (block.type !== "quiz") return block;
    const {
      correctOptionIds: _correct,
      explanation: _explanation,
      ...rest
    } = block;
    return { ...rest, multiple: block.correctOptionIds.length > 1 };
  });
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
        quizBlocks(input.content).length > 0,
      "learning.needs_quiz",
    ),
    ["completion"],
  ),
  v.forward(
    v.check(
      (input) =>
        input.completion !== "reflection" ||
        input.content.blocks.some((block) => block.type === "reflection"),
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

export const answerSchema = v.object({
  lessonId: id,
  blockId: id,
  optionIds: v.pipe(v.array(id), v.minLength(1), v.maxLength(MAX_QUIZ_OPTIONS)),
});

export const reflectSchema = v.object({
  lessonId: id,
  blockId: id,
  text: requiredText(4000),
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
