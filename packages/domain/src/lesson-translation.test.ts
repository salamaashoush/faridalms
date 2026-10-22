import { describe, expect, it } from "vitest";

import type { ContentDocument, ContentNode } from "./content";
import type { LessonDocument } from "./learning";

import { contentPlainText } from "./content";
import { plainContent } from "./content-conversion";
import { studentBlocks } from "./learning";
import { contentOfLesson, lessonOfContent } from "./lesson-content";
import { translatedLesson, untranslatedParts } from "./lesson-translation";

const NILE = "0b6f4c7e-8a1d-4b2c-9e3f-a1b2c3d4e5f6";
const AMAZON = "1c7a5d8f-9b2e-4c3d-8f4a-b2c3d4e5f6a7";

const lesson: LessonDocument = {
  version: 2,
  blocks: [
    {
      id: "a1f6b1e0-4a3b-4c8e-9d2a-1b2c3d4e5f60",
      type: "content",
      content: plainContent("Rivers carve valleys."),
    },
    {
      id: "7a1f6b1e-4a3b-4c8e-9d2a-1b2c3d4e5f60",
      type: "choice",
      prompt: "Which river flows through Egypt?",
      points: 1,
      hints: [],
      explanation: "",
      tries: null,
      options: [
        { id: NILE, text: "The Nile", feedback: "" },
        { id: AMAZON, text: "The Amazon", feedback: "" },
      ],
      correctOptionIds: [NILE],
      multiple: false,
      shuffle: false,
    },
    {
      id: "8b2a7c2f-5b4c-4d9f-8e3b-2c3d4e5f6a71",
      type: "text",
      prompt: "Name Egypt's capital.",
      points: 1,
      hints: [],
      explanation: "",
      tries: null,
      answers: ["Cairo", "القاهرة"],
      caseSensitive: false,
      closeEnough: false,
      tehMarbuta: false,
    },
  ],
};

/** Gives each block an id, as the editor does, so its translation can find it. */
function withIds(document: ContentDocument): ContentDocument {
  return {
    root: {
      ...document.root,
      children: (document.root.children ?? []).map((node, index) =>
        node.type === "question"
          ? node
          : { ...node, $: { id: `blockid${index}00` } },
      ),
    },
  };
}

/** Rewrites the words of every text in a part, as a translator would. */
function rewrite(
  node: ContentNode,
  words: Record<string, string>,
): ContentNode {
  return {
    ...node,
    ...(node.text !== undefined ? { text: words[node.text] ?? node.text } : {}),
    ...(node.children
      ? { children: node.children.map((child) => rewrite(child, words)) }
      : {}),
  };
}

const written = contentOfLesson(lesson);
if (!written) throw new Error("the lesson has no document");
const original = withIds(written);
const ARABIC: Record<string, string> = {
  "Rivers carve valleys.": "الأنهار تحفر الوديان.",
  "Which river flows through Egypt?": "أي نهر يجري في مصر؟",
  "The Nile": "النيل",
  "The Amazon": "الأمازون",
  "Name Egypt's capital.": "ما عاصمة مصر؟",
};

function translationOf(change?: (node: ContentNode) => ContentNode) {
  return {
    root: {
      ...original.root,
      children: (original.root.children ?? []).map((node) => {
        const translated = rewrite(node, ARABIC);
        return change ? change(translated) : translated;
      }),
    },
  };
}

const read = (document: LessonDocument) =>
  JSON.stringify(studentBlocks(document, "seed"));

describe("a lesson's translation", () => {
  it("gives the lesson its words and keeps its parts, ids and answers", () => {
    const translated = translatedLesson(original, translationOf());
    const asWritten = lessonOfContent(original);
    expect(translated.blocks.map((block) => block.id)).toEqual(
      asWritten.blocks.map((block) => block.id),
    );
    expect(read(translated)).toContain("أي نهر يجري في مصر؟");
    expect(read(translated)).toContain("الأنهار تحفر الوديان.");
    expect(read(translated)).not.toContain("The Amazon");
    const choice = translated.blocks.find((block) => block.type === "choice");
    expect(choice).toMatchObject({ correctOptionIds: [NILE] });
    expect(untranslatedParts(original, translationOf())).toEqual([]);
  });

  it("reads a question as the original does when the translation changed more than its words", () => {
    // The typed answers belong to the original; the translation may not change them.
    const changed = translationOf((node) =>
      node.type === "question" && node.kind === "text"
        ? {
            ...node,
            children: (node.children ?? []).map((child) =>
              child.type === "question-answer"
                ? rewrite(child, { Cairo: "Alexandria" })
                : child,
            ),
          }
        : node,
    );
    const translated = translatedLesson(original, changed);
    expect(read(translated)).toContain("Name Egypt's capital.");
    expect(read(translated)).toContain("أي نهر يجري في مصر؟");
    expect(
      untranslatedParts(original, changed).map((node) =>
        contentPlainText({ root: { ...original.root, children: [node] } }),
      ),
    ).toEqual([expect.stringContaining("Name Egypt's capital.")]);
  });

  it("shows a part the translation lacks as the original has it, and nothing the original lacks", () => {
    const shorter: ContentDocument = {
      root: {
        ...original.root,
        children: [
          ...translationOf().root.children.slice(1),
          {
            type: "paragraph",
            version: 1,
            $: { id: "extra" },
            children: [
              { type: "text", version: 1, text: "Only here.", format: 0 },
            ],
          },
        ],
      },
    };
    const translated = translatedLesson(original, shorter);
    expect(read(translated)).toContain("Rivers carve valleys.");
    expect(read(translated)).not.toContain("Only here.");
    expect(untranslatedParts(original, shorter)).toHaveLength(1);
  });
});
