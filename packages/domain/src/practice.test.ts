import { describe, expect, it } from "vitest";

import type { AutoBlock, LessonDocument } from "./learning";

import { practiceItems, practiceStanding, practiceView } from "./practice";

const base = {
  points: 1,
  hints: ["Think of the sky."],
  explanation: "Blue.",
  tries: 2,
};

function choice(id: string): AutoBlock {
  return {
    ...base,
    id,
    type: "choice",
    prompt: `Question ${id}`,
    options: [
      { id: `${id}-right`, text: "Blue", feedback: "" },
      { id: `${id}-wrong`, text: "Green", feedback: "" },
    ],
    correctOptionIds: [`${id}-right`],
    multiple: false,
    shuffle: false,
  };
}

const lesson = (ids: string[]): LessonDocument => ({
  version: 2,
  blocks: ids.map(choice),
});

describe("practiceItems", () => {
  const sources = [
    {
      lessonId: "one",
      document: lesson(["a1", "a2", "a3"]),
      rows: [
        { blockId: "a1", try: 1, state: "answered" as const, fraction: 1 },
        { blockId: "a2", try: 1, state: "answered" as const, fraction: 0 },
      ],
    },
    {
      lessonId: "two",
      document: lesson(["b1", "b2"]),
      rows: [
        { blockId: "b1", try: 1, state: "answered" as const, fraction: 1 },
        { blockId: "b2", try: 1, state: "answered" as const, fraction: 1 },
      ],
    },
  ];

  it("asks what was missed first, then mixes the lessons in turn", () => {
    const items = practiceItems(sources, "seed");
    const ids = items.map((item) => item.block.id);
    expect(ids.slice(0, 2).toSorted()).toEqual(["a2", "a3"]);
    expect(items.slice(0, 2).every((item) => item.missed)).toBe(true);
    const rest = items.slice(2).map((item) => item.lessonId);
    expect(rest).toHaveLength(3);
    expect(rest[0]).not.toBe(rest[1]);
  });

  it("gives the same set for the same seed and keeps to the size", () => {
    expect(practiceItems(sources, "seed")).toEqual(
      practiceItems(sources, "seed"),
    );
    expect(practiceItems(sources, "seed", 2)).toHaveLength(2);
  });

  it("leaves out polls, which ask an opinion rather than something learnt", () => {
    const poll: AutoBlock = {
      ...base,
      hints: [],
      points: 0,
      id: "p1",
      type: "poll",
      prompt: "Which colour do you like?",
      options: [
        { id: "p1-blue", text: "Blue", feedback: "" },
        { id: "p1-green", text: "Green", feedback: "" },
      ],
      multiple: false,
      classResults: true,
    };
    const items = practiceItems(
      [
        {
          lessonId: "three",
          document: { version: 2, blocks: [poll, choice("c1")] },
          rows: [],
        },
      ],
      "seed",
    );
    expect(items.map((item) => item.block.id)).toEqual(["c1"]);
  });
});

describe("practiceView", () => {
  const block = choice("q");

  it("marks a right answer and shows the explanation", () => {
    const view = practiceView(block, 0, {
      response: { type: "choice", optionIds: ["q-right"] },
    });
    expect(view).toMatchObject({
      correct: true,
      tries: 1,
      explanation: "Blue.",
    });
  });

  it("offers the hint after a miss and the answer once tries run out", () => {
    const first = practiceView(block, 0, {
      response: { type: "choice", optionIds: ["q-wrong"] },
    });
    expect(first).toMatchObject({
      correct: false,
      hints: ["Think of the sky."],
      key: null,
    });
    const second = practiceView(block, 1, {
      response: { type: "choice", optionIds: ["q-wrong"] },
    });
    expect(second).toMatchObject({ revealed: true, key: ["q-right"] });
  });

  it("shows the answer when asked, keeping the tries made", () => {
    expect(practiceView(block, 1, { reveal: true })).toMatchObject({
      revealed: true,
      tries: 1,
      key: ["q-right"],
    });
  });
});

describe("a practice quiz question", () => {
  const asked = choice("q");
  const right = { type: "choice" as const, optionIds: ["q-right"] };
  const wrong = { type: "choice" as const, optionIds: ["q-wrong"] };

  it("reads as a lesson question, its hint opened by the miss", () => {
    const missed = practiceStanding(asked, {
      response: wrong,
      tries: 1,
      hints: 0,
      revealed: false,
    });
    expect(missed.view).toMatchObject({
      correct: false,
      triesLeft: 1,
      hints: ["Think of the sky."],
      key: null,
    });
    expect(missed.credit).toBe(0);
  });

  it("leaves the credit its tries and hints earn", () => {
    const later = practiceStanding(asked, {
      response: right,
      tries: 2,
      hints: 0,
      revealed: false,
    });
    expect(later.view).toMatchObject({ correct: true, key: ["q-right"] });
    expect(later.credit).toBeCloseTo(2 / 3);
    const helped = practiceStanding(asked, {
      response: right,
      tries: 1,
      hints: 1,
      revealed: false,
    });
    expect(helped.credit).toBeCloseTo(2 / 3);
    const shown = practiceStanding(asked, {
      response: null,
      tries: 0,
      hints: 0,
      revealed: true,
    });
    expect(shown).toMatchObject({ credit: 0, view: { revealed: true } });
  });
});
