import { describe, expect, it } from "vitest";

import type { ChoiceBlock } from "./learning";

import { allowedMinutes, NO_ARRANGEMENTS } from "./arrangements";
import { studentQuiz } from "./learning";

const option = (n: number) => ({
  id: `0190a1b2-0000-7000-8000-00000000020${n}`,
  text: `Option ${n}`,
  feedback: "",
});

const choice = (options: number): ChoiceBlock => ({
  id: "0190a1b2-0000-7000-8000-000000000210",
  type: "choice",
  prompt: "Which is a noun?",
  points: 1,
  hints: [],
  explanation: "",
  tries: null,
  options: Array.from({ length: options }, (_, index) => option(index + 1)),
  correctOptionIds: [option(1).id],
  multiple: false,
  shuffle: false,
});

const optionsOf = (block: ChoiceBlock, seed: string, fewer: boolean) => {
  const [asked] = studentQuiz(
    { version: 2, blocks: [block] },
    seed,
    false,
    fewer,
  );
  return asked?.type === "choice" ? asked.options.map((part) => part.id) : [];
};

describe("access arrangements", () => {
  it("gives a timed quiz its extra time, rounded up to the minute", () => {
    expect(allowedMinutes(10, NO_ARRANGEMENTS)).toBe(10);
    expect(allowedMinutes(10, { extraTime: 25, unlimitedTime: false })).toBe(
      13,
    );
    expect(allowedMinutes(45, { extraTime: 50, unlimitedTime: false })).toBe(
      68,
    );
    expect(allowedMinutes(30, { extraTime: 100, unlimitedTime: false })).toBe(
      60,
    );
    expect(allowedMinutes(30, { extraTime: 0, unlimitedTime: true })).toBe(
      null,
    );
  });

  it("leaves out one wrong choice, the same one each time, and never the right one", () => {
    const four = choice(4);
    const shown = optionsOf(four, "student:1", true);
    expect(shown).toHaveLength(3);
    expect(shown).toContain(option(1).id);
    expect(optionsOf(four, "student:1", true)).toEqual(shown);
    expect(optionsOf(four, "student:1", false)).toHaveLength(4);
  });

  it("keeps a question with one wrong choice whole", () => {
    expect(optionsOf(choice(2), "student:1", true)).toHaveLength(2);
  });
});
