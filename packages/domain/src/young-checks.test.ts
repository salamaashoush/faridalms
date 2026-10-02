import { describe, expect, it } from "vitest";

import type { LessonBlock } from "./learning";

import { youngAdvice } from "./young-checks";

const base = { points: 1, hint: "", explanation: "", tries: null };

function choice(
  id: string,
  prompt: string,
  options: string[],
  narration: string | null = null,
): LessonBlock {
  return {
    ...base,
    id,
    type: "choice",
    prompt,
    narration,
    options: options.map((text, index) => ({
      id: `${id}-${index}`,
      text,
      feedback: "",
    })),
    correctOptionIds: [`${id}-0`],
    multiple: false,
    shuffle: false,
  };
}

function paragraph(text: string, narration?: string): LessonBlock {
  return {
    id: "text",
    type: "content",
    content: {
      root: {
        type: "root",
        version: 1,
        children: [
          {
            type: "paragraph",
            version: 1,
            ...(narration ? { $: { narration } } : {}),
            children: [{ type: "text", version: 1, text }],
          },
        ],
      },
    },
  };
}

describe("youngAdvice", () => {
  it("passes a short lesson read in English or vowelled Arabic", () => {
    expect(
      youngAdvice([
        choice("a", "Which one swims?", ["Duck", "Cat"]),
        choice("b", "أَيُّهَا يَسْبَحُ؟", ["بَطَّةٌ", "قِطَّةٌ"]),
      ]),
    ).toEqual([]);
  });

  it("asks for fewer choices, cards and questions", () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      choice(`q${index}`, "Which?", ["A", "B"]),
    );
    many[1] = choice("q1", "Which?", ["A", "B", "C", "D", "E"]);
    expect(youngAdvice(many)).toEqual([
      { kind: "questions", count: 9 },
      { kind: "options", question: 2, count: 5 },
    ]);
  });

  it("flags Arabic without vowel marks unless a recording reads it", () => {
    expect(youngAdvice([choice("a", "أيها يسبح؟", ["بطة", "قطة"])])).toEqual([
      { kind: "unvoiced", question: 1 },
    ]);
    expect(
      youngAdvice([choice("a", "أيها يسبح؟", ["بَطَّةٌ", "قِطَّةٌ"], "file-1")]),
    ).toEqual([]);
    expect(youngAdvice([paragraph("البطة تسبح")])).toEqual([
      { kind: "unvoicedText" },
    ]);
    expect(youngAdvice([paragraph("البطة تسبح", "file-2")])).toEqual([]);
  });
});
