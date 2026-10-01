import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { LessonDocument } from "./learning";

import { contentDocumentSchema, contentPlainText } from "./content";
import { plainContent } from "./content-conversion";
import { lessonDocumentSchema } from "./learning";
import {
  briefWithQuiz,
  contentOfLesson,
  holdsQuestions,
  lessonOfContent,
  quizIntro,
  quizOfBrief,
  sameLesson,
} from "./lesson-content";

const lesson: LessonDocument = {
  version: 2,
  blocks: [
    {
      id: crypto.randomUUID(),
      type: "content",
      content: plainContent("Read the poem first."),
    },
    {
      id: crypto.randomUUID(),
      type: "media",
      fileId: "1e7c5d8f-9a2b-4c3d-8e4f-a5b6c7d8e9f0",
      name: "reading.mp3",
      mediaType: "audio/mpeg",
      sizeBytes: 48000,
      caption: "The poem read aloud",
      captionsFileId: null,
      captionsLang: "ar",
      transcript: "Line one.\nLine two.",
    },
    { id: crypto.randomUUID(), type: "gate", requires: "above" },
    {
      id: "7a1f6b1e-4a3b-4c8e-9d2a-1b2c3d4e5f60",
      type: "choice",
      prompt: "Which word is a verb?",
      points: 2,
      hint: "It is something you do.",
      explanation: "Run is an action.",
      tries: 2,
      options: [
        {
          id: "0b6f4c7e-8a1d-4b2c-9e3f-a1b2c3d4e5f6",
          text: "Run",
          feedback: "",
        },
        {
          id: "1c7a5d8f-9b2e-4c3d-8f4a-b2c3d4e5f6a7",
          text: "Table",
          feedback: "A table is a thing.",
        },
      ],
      correctOptionIds: ["0b6f4c7e-8a1d-4b2c-9e3f-a1b2c3d4e5f6"],
      multiple: false,
      shuffle: true,
    },
    {
      id: "2d8b6e9a-0c3f-4d4e-9a5b-c3d4e5f6a7b8",
      type: "text",
      prompt: "The capital of Egypt?",
      points: 1,
      hint: "",
      explanation: "",
      tries: null,
      answers: ["Cairo", "القاهرة"],
      caseSensitive: false,
      closeEnough: true,
      tehMarbuta: true,
    },
    {
      id: "4f0d8a1c-2e5b-4f6a-9c7d-e5f6a7b8c9d0",
      type: "number",
      prompt: "How many sides has a hexagon?",
      points: 1,
      hint: "",
      explanation: "",
      tries: 3,
      mode: "exact",
      value: 6,
      tolerance: 0,
      percent: false,
      min: 0,
      max: 0,
    },
    {
      id: "5a1e9b2d-3f6c-4a7b-8d8e-f6a7b8c9d0e1",
      type: "ordering",
      prompt: "Put the stages in order.",
      points: 2,
      hint: "",
      explanation: "",
      tries: null,
      items: [
        { id: "6b2f0c3e-4a7d-4b8c-9e9f-a7b8c9d0e1f2", text: "Egg" },
        { id: "7c3a1d4f-5b8e-4c9d-8f0a-b8c9d0e1f2a3", text: "Caterpillar" },
        { id: "8d4b2e5a-6c9f-4d0e-9a1b-c9d0e1f2a3b4", text: "Butterfly" },
      ],
      scoring: "neighbours",
    },
    {
      id: "9e5c3f6b-7d0a-4e1f-8b2c-d0e1f2a3b4c5",
      type: "matching",
      prompt: "Match each word to its meaning.",
      points: 3,
      hint: "",
      explanation: "",
      tries: null,
      pairs: [
        {
          id: "0f6d4a7c-8e1b-4f2a-9c3d-e1f2a3b4c5d6",
          prompt: "Big",
          answer: "Large",
        },
        {
          id: "1a7e5b8d-9f2c-4a3b-8d4e-f2a3b4c5d6e7",
          prompt: "Quick",
          answer: "Fast",
        },
      ],
      distractors: [
        { id: "2b8f6c9e-0a3d-4b4c-9e5f-a3b4c5d6e7f8", text: "Slow" },
      ],
    },
    {
      id: "3c9a7d0f-1b4e-4c5d-8f6a-b4c5d6e7f8a9",
      type: "sorting",
      prompt: "Sort the animals.",
      points: 2,
      hint: "",
      explanation: "",
      tries: null,
      groups: [
        { id: "4d0b8e1a-2c5f-4d6e-9a7b-c5d6e7f8a9b0", name: "Mammals" },
        { id: "5e1c9f2b-3d6a-4e7f-8b8c-d6e7f8a9b0c1", name: "Birds" },
      ],
      items: [
        {
          id: "6f2d0a3c-4e7b-4f8a-9c9d-e7f8a9b0c1d2",
          text: "Cat",
          groupId: "4d0b8e1a-2c5f-4d6e-9a7b-c5d6e7f8a9b0",
        },
        {
          id: "7a3e1b4d-5f8c-4a9b-8d0e-f8a9b0c1d2e3",
          text: "Eagle",
          groupId: "5e1c9f2b-3d6a-4e7f-8b8c-d6e7f8a9b0c1",
        },
      ],
    },
    {
      id: "8b4f2a5c-6d9e-4b0f-9c1a-e2f3a4b5c6d7",
      type: "gaps",
      prompt: "Fill in the gaps.",
      points: 2,
      hint: "",
      explanation: "",
      tries: null,
      segments: [
        { type: "text", text: "The capital of Egypt is " },
        {
          type: "gap",
          id: "9c5a3b6d-7e0f-4c1a-8d2b-f3a4b5c6d7e8",
          answers: ["Cairo", "القاهرة"],
          options: [],
        },
        { type: "text", text: ".\nIt stands on the " },
        {
          type: "gap",
          id: "0d6b4c7e-8f1a-4d2b-9e3c-a4b5c6d7e8f9",
          answers: ["Nile"],
          options: ["Nile", "Thames", "Seine"],
        },
        { type: "text", text: " river." },
      ],
      caseSensitive: false,
      closeEnough: true,
      tehMarbuta: true,
    },
    {
      id: "3e9c7f0b-1d4a-4e5f-8b6c-d4e5f6a7b8c9",
      type: "written",
      prompt: "Why does the poet repeat the last line?",
      points: 4,
      hint: "",
      explanation: "",
      tries: null,
      wordLimit: 150,
    },
  ],
};

const checks = (blocks: LessonDocument["blocks"]) =>
  blocks.filter((block) => !["content", "media", "gate"].includes(block.type));

describe("lessons written as one document", () => {
  it("keeps every question, its id and its key through the document", () => {
    const document = contentOfLesson(lesson);
    if (!document) throw new Error("lesson could not become a document");
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    const back = lessonOfContent(document);
    expect(v.safeParse(lessonDocumentSchema, back).success).toBe(true);
    expect(checks(back.blocks)).toEqual(checks(lesson.blocks));
    expect(back.blocks.map((block) => block.type).slice(0, 3)).toEqual([
      "content",
      "gate",
      "choice",
    ]);
    expect(document.root.children?.[1]).toMatchObject({
      type: "media",
      mime: "audio/mpeg",
      captionsLang: "ar",
      transcript: "Line one.\nLine two.",
    });
    const text = back.blocks.find((block) => block.type === "content");
    expect(
      text?.type === "content" ? contentPlainText(text.content) : "",
    ).toContain("Read the poem first.");
    expect(contentPlainText(document)).toContain("Line two.");
  });

  it("gives the text between questions the same id each time", () => {
    const document = contentOfLesson(lesson);
    if (!document) throw new Error("lesson could not become a document");
    const first = lessonOfContent(document).blocks[0]?.id;
    expect(first).toBe(lessonOfContent(document).blocks[0]?.id);
  });

  it("keeps the accepted answers out of searchable text", () => {
    const document = contentOfLesson(lesson);
    if (!document) throw new Error("lesson could not become a document");
    expect(contentPlainText(document)).not.toContain("Cairo");
    expect(contentPlainText(document)).not.toContain("Thames");
    expect(contentPlainText(document)).toContain("It stands on the");
    expect(contentPlainText(document)).toContain("The capital of Egypt?");
  });

  it("sees a lesson as unchanged whatever ids its blocks were given", () => {
    const document = contentOfLesson(lesson);
    if (!document) throw new Error("lesson could not become a document");
    const reopened = structuredClone(document);
    for (const [index, node] of (reopened.root.children ?? []).entries())
      node.$ = { id: `block${index}aa` };
    expect(sameLesson(document, reopened)).toBe(true);
    const edited = structuredClone(reopened);
    const first = edited.root.children?.[0]?.children?.[0];
    if (first) first.text = "Read the poem twice.";
    expect(sameLesson(document, edited)).toBe(false);
  });

  it("leaves out options and items still empty", () => {
    const document = contentOfLesson(lesson);
    if (!document) throw new Error("lesson could not become a document");
    const choice = document.root.children?.find(
      (node) => node.type === "question" && node.kind === "choice",
    );
    choice?.children?.push({
      type: "question-option",
      version: 1,
      format: "",
      indent: 0,
      direction: null,
      optionId: crypto.randomUUID(),
      children: [],
    });
    const block = lessonOfContent(document).blocks.find(
      (item) => item.type === "choice",
    );
    expect(block?.type === "choice" ? block.options : []).toHaveLength(2);
  });

  it("splits a quiz brief into the words students read first and the quiz", () => {
    const asked = { version: 2 as const, blocks: checks(lesson.blocks) };
    const brief = briefWithQuiz(plainContent("Read carefully."), asked);
    expect(holdsQuestions(brief)).toBe(true);
    expect(contentPlainText(quizIntro(brief))).toBe("Read carefully.");
    expect(JSON.stringify(quizIntro(brief))).not.toContain("Cairo");
    expect(checks(quizOfBrief(brief).blocks)).toEqual(asked.blocks);
    expect(quizOfBrief(plainContent("No questions yet.")).blocks).toEqual([]);
  });
});
