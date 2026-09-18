import * as v from "valibot";

import type { ContentDocument } from "./content";

import { contentDocumentSchema, contentPlainText } from "./content";

export const SCHOOL_FEATURES = ["elearning"] as const;
export type SchoolFeature = (typeof SCHOOL_FEATURES)[number];
export const LEARNING_STATUSES = ["draft", "published"] as const;
export type LearningStatus = (typeof LEARNING_STATUSES)[number];
export const LESSON_BLOCK_TYPES = [
  "content",
  "media",
  "quiz",
  "reflection",
] as const;
export const LESSON_MEDIA_BYTES = 200 * 1024 * 1024;
export const MAX_LESSON_BLOCKS = 40;
export const MAX_QUIZ_OPTIONS = 6;

const id = v.pipe(v.string(), v.uuid());
const text = (max: number) => v.pipe(v.string(), v.trim(), v.maxLength(max));
const requiredText = (max: number) =>
  v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
const revision = v.pipe(v.number(), v.integer(), v.minValue(0));

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

export const saveModuleSchema = v.object({
  id,
  expectedRevision: revision,
  classId: id,
  subjectId: id,
  title: requiredText(160),
  summary: text(500),
});
export type SaveModuleInput = v.InferOutput<typeof saveModuleSchema>;

export const moduleRevisionSchema = v.object({
  id,
  expectedRevision: revision,
});
export type ModuleRevisionInput = v.InferOutput<typeof moduleRevisionSchema>;

export const saveLessonSchema = v.object({
  id,
  moduleId: id,
  expectedRevision: revision,
  title: requiredText(160),
  position: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(999)),
  document: lessonDocumentSchema,
});
export type SaveLessonInput = v.InferOutput<typeof saveLessonSchema>;

export const learnerModuleQuerySchema = v.object({
  id,
  studentId: v.optional(v.string(), ""),
});
export const learnerModulesQuerySchema = v.object({
  studentId: v.optional(v.string(), ""),
});

export const answerQuizSchema = v.object({
  lessonId: id,
  blockId: id,
  optionIds: v.pipe(v.array(id), v.minLength(1), v.maxLength(MAX_QUIZ_OPTIONS)),
});
export type AnswerQuizInput = v.InferOutput<typeof answerQuizSchema>;

export const completeLessonSchema = v.object({ lessonId: id });

export interface QuizAnswer {
  optionIds: string[];
  correct: boolean;
  answeredAt: string;
}
export type LessonAnswers = Record<string, QuizAnswer>;

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

export function lessonFileIds(document: LessonDocument): string[] {
  return document.blocks.flatMap((block) =>
    block.type === "media"
      ? [block.fileId, ...(block.captionsFileId ? [block.captionsFileId] : [])]
      : [],
  );
}

export function quizBlocks(document: LessonDocument) {
  return document.blocks.filter((block) => block.type === "quiz");
}

/** A quiz is right when the chosen set equals the correct set, order aside. */
export function quizIsCorrect(
  block: Extract<LessonBlock, { type: "quiz" }>,
  optionIds: string[],
): boolean {
  const chosen = new Set(optionIds);
  const correct = new Set(block.correctOptionIds);
  return (
    chosen.size === correct.size &&
    [...chosen].every((optionId) => correct.has(optionId))
  );
}

/** What stops a module from being published, as message keys. */
export function modulePublishIssues(module: {
  title: string;
  lessons: { document: LessonDocument }[];
}): string[] {
  const issues: string[] = [];
  if (module.title.trim().length === 0) issues.push("learning.title_required");
  if (module.lessons.length === 0) issues.push("learning.lesson_required");
  if (
    module.lessons.some(
      (lesson) => lessonPlainText(lesson.document).trim().length === 0,
    )
  )
    issues.push("learning.lesson_empty");
  return issues;
}

/** A lesson counts as finished once every quiz has an answer and the learner marks it. */
export function lessonCanComplete(
  document: LessonDocument,
  answers: LessonAnswers,
): boolean {
  return quizBlocks(document).every((block) => block.id in answers);
}

export function lessonSummary(
  document: LessonDocument,
  answers: LessonAnswers,
) {
  const quizzes = quizBlocks(document);
  return {
    quizzes: quizzes.length,
    answered: quizzes.filter((block) => block.id in answers).length,
    correct: quizzes.filter((block) => answers[block.id]?.correct).length,
  };
}

export function contentBlock(content: ContentDocument): LessonBlock {
  return { id: crypto.randomUUID(), type: "content", content };
}
