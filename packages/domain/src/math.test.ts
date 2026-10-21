import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { ContentDocument, ContentNode } from "./content";
import type { LessonDocument } from "./learning";

import { contentDocumentSchema, contentPlainText, mathRuns } from "./content";
import { contentOfLesson, lessonOfContent } from "./lesson-content";

const text = (value: string): ContentNode => ({
  type: "text",
  version: 1,
  text: value,
  format: 0,
});
const math = (latex: string, block = false): ContentNode => ({
  type: "math",
  version: 1,
  latex,
  ...(block ? { block } : {}),
});
const documentOf = (...children: ContentNode[]): ContentDocument => ({
  root: { type: "root", version: 1, children },
});

const question = (prompt: string, options: string[]): LessonDocument => ({
  version: 2,
  blocks: [
    {
      id: "0190a1b2-0000-7000-8000-000000000101",
      type: "choice",
      prompt,
      points: 1,
      hints: [],
      explanation: "",
      tries: null,
      options: options.map((option, index) => ({
        id: `0190a1b2-0000-7000-8000-00000000011${index}`,
        text: option,
        feedback: "",
      })),
      correctOptionIds: ["0190a1b2-0000-7000-8000-000000000110"],
      multiple: false,
      shuffle: false,
    },
  ],
});

describe("mathematics in a document", () => {
  it("keeps a formula in a line and one on its own line, read as LaTeX", () => {
    const document = documentOf(
      {
        type: "paragraph",
        version: 1,
        children: [text("Area "), math("\\pi r^2")],
      },
      {
        type: "paragraph",
        version: 1,
        children: [math("x=\\frac{-b}{2a}", true)],
      },
    );
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    expect(contentPlainText(document)).toBe(
      "Area \\(\\pi r^2\\)\n\\[x=\\frac{-b}{2a}\\]",
    );
  });

  it("refuses a formula with no LaTeX or with words of its own", () => {
    for (const node of [
      { type: "math", version: 1 },
      { ...math("x"), children: [text("x")] },
    ] as ContentNode[])
      expect(
        v.safeParse(
          contentDocumentSchema,
          documentOf({ type: "paragraph", version: 1, children: [node] }),
        ).success,
      ).toBe(false);
  });

  it("finds the formulas written in plain text, and leaves prices alone", () => {
    expect(mathRuns("Solve \\(2x+3=7\\), then \\[x^2\\]")).toEqual([
      { text: "Solve " },
      { latex: "2x+3=7", block: false },
      { text: ", then " },
      { latex: "x^2", block: true },
    ]);
    expect(mathRuns("It costs $5 and $10.")).toEqual([
      { text: "It costs $5 and $10." },
    ]);
  });

  it("carries a question's formulas to students and back into the document", () => {
    const asked = question("Solve \\(2x+3=7\\)", ["\\(x=2\\)", "\\(x=5\\)"]);
    const document = contentOfLesson(asked);
    if (!document) throw new Error("a document");
    expect(JSON.stringify(document)).toContain('"type":"math"');
    const [block] = lessonOfContent(document).blocks;
    expect(block).toMatchObject({
      prompt: "Solve \\(2x+3=7\\)",
      options: [{ text: "\\(x=2\\)" }, { text: "\\(x=5\\)" }],
    });
  });
});
