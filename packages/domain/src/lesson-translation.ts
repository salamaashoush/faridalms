import type { ContentDocument, ContentNode } from "./content";
import type { LessonDocument } from "./learning";

import { contentFileIds, contentPlainText } from "./content";
import { lessonOfContent, questionBlock, quizOfBrief } from "./lesson-content";

/**
 * Parts that shape a lesson rather than say anything: where it stops, what
 * it draws from the bank, its page breaks, the standards it names and the
 * blocks it shares. They stand as the original has them in either language.
 */
const SHAPE = new Set(["gate", "draw", "pagebreak", "standards", "shared"]);

/** How a part of a lesson is found again in its translation. */
function keyOf(node: ContentNode): string | null {
  if (node.type === "question")
    return node.questionId ? `question:${node.questionId}` : null;
  return node.$?.id ? `block:${node.$.id}` : null;
}

/**
 * Whether a value at a place in a question is words a reader is shown,
 * which a translation rewrites, rather than what the question is or what
 * its answer is: its prompt, hints and explanation, each choice's words and
 * feedback, a passage's words between its gaps, a sorting group's name, a
 * matching pair's two sides, a crossword clue, a picture's description and
 * the voice that reads any of these.
 */
function isWords(path: readonly (string | number)[], parent: unknown): boolean {
  const key = path.at(-1);
  if (typeof key !== "string") return path.includes("hints");
  if (
    [
      "prompt",
      "explanation",
      "feedback",
      "clue",
      "alt",
      "narration",
      "narrationWords",
      "promptNarration",
      "answerNarration",
    ].includes(key)
  )
    return true;
  // The words a highlight question asks for are its answers.
  if (key === "text")
    return (parent as { type?: string } | null)?.type !== "target";
  if (key === "answer") return path.includes("pairs");
  if (key === "name") return path.includes("groups");
  return false;
}

/** A question with its words set aside, so two that differ only in words read the same. */
function shapeOf(value: unknown, path: (string | number)[] = []): unknown {
  if (Array.isArray(value))
    return value.map((item, index) =>
      isWords([...path, index], value) ? null : shapeOf(item, [...path, index]),
    );
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        isWords([...path, key], value) ? null : shapeOf(item, [...path, key]),
      ]),
    );
  return value;
}

/**
 * Whether a translated question asks the same as its original: the same
 * kind, choices, gaps, pairs, grid and answers, only in other words. A
 * student's answer is always marked by the original.
 */
function sameQuestion(original: ContentNode, translated: ContentNode) {
  const asked = questionBlock(original);
  const told = questionBlock(translated);
  return (
    asked !== null &&
    told !== null &&
    JSON.stringify(shapeOf(asked)) === JSON.stringify(shapeOf(told))
  );
}

/**
 * The part of a translation that stands for a part of the original, when
 * one does: the same block or question, of the same kind, and a question
 * asking just what the original asks.
 */
function counterpart(
  node: ContentNode,
  translated: ReadonlyMap<string, ContentNode>,
): ContentNode | null {
  if (SHAPE.has(node.type)) return null;
  const key = keyOf(node);
  const other = key ? translated.get(key) : undefined;
  if (!other || other.type !== node.type) return null;
  if (node.type === "question" && !sameQuestion(node, other)) return null;
  return other;
}

function translatedParts(translation: ContentDocument) {
  const parts = new Map<string, ContentNode>();
  for (const child of translation.root.children ?? []) {
    const key = keyOf(child);
    if (key) parts.set(key, child);
  }
  return parts;
}

/**
 * A lesson read in the other language its teacher wrote it in. The original
 * decides what the lesson is, its parts in their order, its stops and every
 * answer; the translation gives its words. A part the translation lacks, or
 * a question it changed beyond its words, reads as the original does. The
 * lesson's blocks keep the original's ids, so where a student is, and what
 * they answered, is the same in either language.
 */
export function translatedLesson(
  original: ContentDocument,
  translation: ContentDocument,
): LessonDocument {
  return readAs(lessonOfContent, original, translation);
}

/**
 * A quiz read in the other language its brief is written in, as a lesson
 * is: the original's questions and every answer, in the translation's
 * words where it gives them.
 */
export function translatedQuiz(
  brief: ContentDocument,
  translation: ContentDocument,
): LessonDocument {
  return readAs(quizOfBrief, brief, translation);
}

/**
 * A document in its translation's words, its parts and questions as the
 * original has them: a part the translation lacks, or a question it changed
 * beyond its words, stands as the original's. A family's form is read this
 * way, so the answers they give fit the original's questions.
 */
export function translatedContent(
  original: ContentDocument,
  translation: ContentDocument,
): ContentDocument {
  const parts = translatedParts(translation);
  return {
    root: {
      ...original.root,
      children: (original.root.children ?? []).map(
        (node) => counterpart(node, parts) ?? node,
      ),
    },
  };
}

/** A document read in its translation's words, its parts as the original's. */
function readAs(
  read: (document: ContentDocument) => LessonDocument,
  original: ContentDocument,
  translation: ContentDocument,
): LessonDocument {
  const asWritten = read(original);
  const translated = read(translatedContent(original, translation));
  if (translated.blocks.length !== asWritten.blocks.length) return asWritten;
  return {
    version: 2,
    blocks: translated.blocks.map((block, index) => ({
      ...block,
      id: asWritten.blocks[index]?.id ?? block.id,
    })),
  };
}

/**
 * The parts of the original its translation does not carry, which a
 * student reading the translation meets as the original has them. An empty
 * line has nothing to translate.
 */
export function untranslatedParts(
  original: ContentDocument,
  translation: ContentDocument,
): ContentNode[] {
  const parts = translatedParts(translation);
  return (original.root.children ?? []).filter((node) => {
    if (SHAPE.has(node.type) || counterpart(node, parts)) return false;
    const alone = { root: { ...original.root, children: [node] } };
    return (
      contentPlainText(alone).trim() !== "" || contentFileIds(alone).length > 0
    );
  });
}
