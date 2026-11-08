import { describe, expect, it } from "vitest";

import type { LessonBlock } from "./learning";

import { plainContent } from "./content-conversion";
import { pacedPartOf, pacedParts } from "./learning";

const uuid = (n: number) =>
  `0192f0a4-7a1c-7b5a-9a2e-${String(n).padStart(12, "0")}`;

const words = (n: number, text: string): LessonBlock => ({
  id: uuid(n),
  type: "content",
  content: plainContent(text),
});

const ask = (n: number): LessonBlock => ({
  id: uuid(n),
  type: "choice",
  prompt: "Is it a cat?",
  points: 1,
  hints: [],
  explanation: "",
  tries: 1,
  options: [
    { id: uuid(n + 100), text: "Yes", feedback: "" },
    { id: uuid(n + 200), text: "No", feedback: "" },
  ],
  correctOptionIds: [uuid(n + 100)],
  multiple: false,
  shuffle: false,
});

describe("the parts a teacher leads", () => {
  const blocks = [
    words(1, "A cat."),
    ask(2),
    words(3, "A dog."),
    ask(4),
    { id: uuid(5), type: "gate", requires: "above" } as LessonBlock,
    words(6, "A bird."),
  ];

  it("split at continue gates for older students", () => {
    expect(pacedParts(blocks, false).map((part) => part.length)).toEqual([
      4, 1,
    ]);
    expect(pacedPartOf(blocks, uuid(4), false)).toBe(0);
    expect(pacedPartOf(blocks, uuid(6), false)).toBe(1);
  });

  it("are the screens young children play, one question to each", () => {
    expect(pacedParts(blocks, true).map((part) => part.length)).toEqual([
      2, 2, 1,
    ]);
    expect(pacedPartOf(blocks, uuid(2), true)).toBe(0);
    expect(pacedPartOf(blocks, uuid(4), true)).toBe(1);
    expect(pacedPartOf(blocks, uuid(9), true)).toBe(-1);
  });
});
