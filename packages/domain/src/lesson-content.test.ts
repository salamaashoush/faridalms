import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { LessonDocument } from "./learning";

import { contentDocumentSchema, contentPlainText } from "./content";
import { plainContent } from "./content-conversion";
import { lessonDocumentSchema } from "./learning";
import { contentOfLesson, lessonOfContent } from "./lesson-content";

const lesson: LessonDocument = {
  version: 2,
  blocks: [
    {
      id: crypto.randomUUID(),
      type: "content",
      content: plainContent("Read the poem first."),
    },
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

describe("lessons written as one document", () => {
  it("keeps every question, its id and its key through the document", () => {
    const document = contentOfLesson(lesson);
    if (!document) throw new Error("lesson could not become a document");
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    const back = lessonOfContent(document);
    expect(v.safeParse(lessonDocumentSchema, back).success).toBe(true);
    expect(back.blocks.filter((block) => block.type !== "content")).toEqual(
      lesson.blocks.filter((block) => block.type !== "content"),
    );
    const text = back.blocks.find((block) => block.type === "content");
    expect(
      text?.type === "content" ? contentPlainText(text.content) : "",
    ).toContain("Read the poem first.");
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
    expect(contentPlainText(document)).toContain("The capital of Egypt?");
  });
});
