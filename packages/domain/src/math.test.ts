import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { ContentDocument, ContentNode } from "./content";
import type { LessonDocument } from "./learning";

import {
  contentDocumentSchema,
  contentPlainText,
  mathRuns,
  mathText,
  sameContent,
} from "./content";
import { lessonBlockSchema, markResponse } from "./learning";
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
const line = (formula: ContentNode): ContentNode => ({
  type: "paragraph",
  version: 1,
  children: [formula],
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

  it("keeps a formula's Arabic notation in plain text, isolated right to left", () => {
    const written = mathText({ latex: "س+١=٣", direction: "rtl" });
    expect(written).toBe("\u2067\\(س+١=٣\\)\u2069");
    expect(mathRuns(`حل ${written} ثم \\(x\\)`)).toEqual([
      { text: "حل " },
      { latex: "س+١=٣", block: false, rtl: true },
      { text: " ثم " },
      { latex: "x", block: false },
    ]);
    const asked = question(`أوجد ${written}`, ["\\(x=2\\)"]);
    const document = contentOfLesson(asked);
    if (!document) throw new Error("a document");
    expect(JSON.stringify(document)).toContain('"direction":"rtl"');
    expect(lessonOfContent(document).blocks[0]).toMatchObject({
      prompt: `أوجد ${written}`,
    });
  });

  it("counts a formula turned to Arabic notation as a change", () => {
    const before = documentOf(line(math("x+1")));
    expect(
      sameContent(
        before,
        documentOf(line({ ...math("x+1"), direction: "rtl" })),
      ),
    ).toBe(false);
    // A paragraph's direction is worked out from its words, not chosen.
    expect(
      sameContent(
        before,
        documentOf({ ...line(math("x+1")), direction: "rtl" }),
      ),
    ).toBe(true);
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

describe("a question answered with mathematics", () => {
  const asked: LessonDocument = {
    version: 2,
    blocks: [
      {
        id: "0190a1b2-0000-7000-8000-000000000201",
        type: "math",
        prompt: "Expand \\(2(x+1)\\)",
        points: 1,
        hints: [],
        explanation: "",
        tries: null,
        answers: ["2x+2"],
        tolerance: 0,
      },
    ],
  };
  const [block] = asked.blocks;
  if (block?.type !== "math") throw new Error("a maths question");

  it("keeps its accepted answers as formulas through the document", () => {
    const document = contentOfLesson(asked);
    if (!document) throw new Error("a document");
    expect(lessonOfContent(document).blocks[0]).toMatchObject({
      type: "math",
      answers: ["2x+2"],
    });
  });

  it("marks an answer by what it means, and LaTeX it cannot read as written", () => {
    const mark = (latex: string) =>
      markResponse(block, { type: "math", latex }).correct;
    expect(mark("2+2x")).toBe(true);
    expect(mark("2\\left(x+1\\right)")).toBe(true);
    expect(mark("2x+1")).toBe(false);
    const listed = { ...block, answers: ["x\\le2"] };
    expect(
      markResponse(listed, { type: "math", latex: "x \\le 2" }).correct,
    ).toBe(true);
  });

  it("asks the answer to be in the form the teacher set, and says why when not", () => {
    const expand = { ...block, form: "expanded" as const };
    expect(markResponse(expand, { type: "math", latex: "2x+2" })).toMatchObject(
      { correct: true },
    );
    expect(
      markResponse(expand, { type: "math", latex: "2(x+1)" }),
    ).toMatchObject({ correct: false, note: "expanded" });
    expect(
      markResponse(expand, { type: "math", latex: "2x+1" }).note,
    ).toBeUndefined();
  });

  it("will not publish a key that its own form or units would refuse", () => {
    const issues = (extra: object) =>
      v
        .safeParse(lessonBlockSchema, { ...block, ...extra })
        .issues?.map((issue) => issue.message) ?? [];
    expect(issues({ form: "factorised", answers: ["x^2+5x+6"] })).toEqual([
      "learning.math_key_form",
    ]);
    expect(issues({ units: "convert", answers: ["9.8"] })).toEqual([
      "learning.math_key_units",
    ]);
    expect(issues({ form: "expanded" })).toEqual([]);
  });

  it("compares quantities in any units, or only the key's, and asks for units left off", () => {
    const fall = {
      ...block,
      answers: ["9.8\\frac{m}{s^2}"],
      tolerance: 0.1,
      units: "convert" as const,
    };
    const mark = (latex: string, units: "convert" | "same" = "convert") =>
      markResponse({ ...fall, units }, { type: "math", latex });
    expect(mark("980\\frac{cm}{s^2}")).toMatchObject({ correct: true });
    expect(mark("980\\frac{cm}{s^2}", "same")).toMatchObject({
      correct: false,
      note: "units",
    });
    expect(mark("9.8")).toMatchObject({ correct: false, note: "unitless" });
    expect(
      markResponse(
        {
          ...fall,
          answers: ["3.2\\times10^{4}\\,\\mathrm{m}"],
          form: "standard",
        },
        { type: "math", latex: "32000\\,\\mathrm{m}" },
      ),
    ).toMatchObject({ correct: false, note: "standard" });
  });
});
