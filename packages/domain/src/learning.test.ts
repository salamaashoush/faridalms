import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type {
  ChoiceBlock,
  GapsBlock,
  LessonDocument,
  MatchingBlock,
  NumberBlock,
  OrderingBlock,
  SortingBlock,
  TextBlock,
} from "./learning";

import {
  checkStates,
  completionMet,
  creditOf,
  gapsSource,
  lessonDocumentSchema,
  lessonScore,
  markResponse,
  parseGaps,
  partKey,
  studentBlocks,
  upgradeLesson,
} from "./learning";

const uuid = (n: number) =>
  `0192f0a4-7a1c-7b5a-9a2e-${String(n).padStart(12, "0")}`;

const common = {
  points: 1,
  hint: "Think it over.",
  explanation: "Because.",
  tries: null,
};

const choice: ChoiceBlock = {
  ...common,
  id: uuid(1),
  type: "choice",
  prompt: "Which are planets?",
  options: [
    { id: uuid(11), text: "Mars", feedback: "Yes, the fourth." },
    { id: uuid(12), text: "Moon", feedback: "A moon, not a planet." },
    { id: uuid(13), text: "Venus", feedback: "" },
  ],
  correctOptionIds: [uuid(11), uuid(13)],
  multiple: true,
  shuffle: true,
};

const typed: TextBlock = {
  ...common,
  id: uuid(2),
  type: "text",
  prompt: "عاصمة مصر؟",
  answers: ["القاهرة", "Cairo"],
  caseSensitive: false,
  closeEnough: true,
  tehMarbuta: true,
};

const gaps: GapsBlock = {
  ...common,
  id: uuid(3),
  type: "gaps",
  prompt: "Fill in the blanks",
  caseSensitive: false,
  closeEnough: false,
  tehMarbuta: false,
  segments: [
    { type: "text", text: "Water boils at " },
    { type: "gap", id: uuid(31), answers: ["100"], options: [] },
    { type: "text", text: " degrees and freezes at " },
    { type: "gap", id: uuid(32), answers: ["0"], options: ["0", "10", "32"] },
  ],
};

const number: NumberBlock = {
  ...common,
  id: uuid(4),
  type: "number",
  prompt: "What is pi to two places?",
  mode: "exact",
  value: 3.14,
  tolerance: 0.01,
  percent: false,
  min: 0,
  max: 0,
};

const lesson: LessonDocument = {
  version: 2,
  blocks: [choice, typed, gaps, number],
};

describe("marking answers", () => {
  it("gives partial credit on a multiple-answer question and returns the chosen options' feedback", () => {
    expect(
      markResponse(choice, { type: "choice", optionIds: [uuid(11), uuid(13)] }),
    ).toMatchObject({
      fraction: 1,
      correct: true,
      feedback: ["Yes, the fourth."],
    });
    expect(
      markResponse(choice, { type: "choice", optionIds: [uuid(11), uuid(12)] }),
    ).toMatchObject({
      fraction: 0,
      correct: false,
      feedback: ["Yes, the fourth.", "A moon, not a planet."],
    });
    expect(
      markResponse(choice, { type: "choice", optionIds: [uuid(11)] }).fraction,
    ).toBe(0.5);
  });

  it("folds Arabic and forgives a slip in a typed answer", () => {
    expect(markResponse(typed, { type: "text", text: "القاهره" }).correct).toBe(
      true,
    );
    expect(markResponse(typed, { type: "text", text: "Kairo" }).correct).toBe(
      true,
    );
    expect(markResponse(typed, { type: "text", text: "Giza" }).correct).toBe(
      false,
    );
  });

  it("marks each gap, typed or chosen, and credits the share right", () => {
    const marked = markResponse(gaps, {
      type: "gaps",
      answers: { [uuid(31)]: "١٠٠", [uuid(32)]: "10" },
    });
    expect(marked).toMatchObject({
      fraction: 0.5,
      correct: false,
      parts: { [uuid(31)]: true, [uuid(32)]: false },
    });
  });

  it("accepts a number within its tolerance in any digit script", () => {
    expect(markResponse(number, { type: "number", text: "٣٫١٥" }).correct).toBe(
      true,
    );
    expect(markResponse(number, { type: "number", text: "3.2" }).correct).toBe(
      false,
    );
    expect(
      markResponse(
        { ...number, mode: "range", min: 1, max: 2 },
        { type: "number", text: "1.5" },
      ).correct,
    ).toBe(true);
  });
});

describe("scoring a lesson", () => {
  const right = {
    tries: 1,
    fraction: 1,
    correct: true,
    revealed: false,
    marked: false,
    firstTryCorrect: true,
    review: null,
  };

  it("takes a share off each extra try and gives nothing once the answer is revealed", () => {
    expect(creditOf(right)).toBe(1);
    expect(
      creditOf({ ...right, tries: 2, firstTryCorrect: false }),
    ).toBeCloseTo(2 / 3);
    expect(
      creditOf({
        ...right,
        tries: 1,
        correct: false,
        fraction: 0,
        revealed: true,
      }),
    ).toBe(0);
  });

  it("weights questions by points and finishes a quiz lesson once every question is settled", () => {
    const weighted: LessonDocument = {
      version: 2,
      blocks: [{ ...choice, points: 3 }, typed],
    };
    const states = { [choice.id]: right };
    expect(lessonScore(weighted, states)).toBe(75);
    expect(
      completionMet({ completion: "quiz", passScore: null }, weighted, states),
    ).toBe(false);
    const all = {
      ...states,
      [typed.id]: { ...right, correct: false, fraction: 0, revealed: true },
    };
    expect(
      completionMet({ completion: "quiz", passScore: null }, weighted, all),
    ).toBe(true);
    expect(
      completionMet({ completion: "score", passScore: 80 }, weighted, all),
    ).toBe(false);
  });
});

describe("what a student sees", () => {
  it("never carries keys, hints, explanations or option feedback, and shuffles one way per student", () => {
    const shown = studentBlocks(lesson, "student-a");
    const text = JSON.stringify(shown);
    expect(text).not.toContain("correctOptionIds");
    expect(text).not.toContain("Because.");
    expect(text).not.toContain("Think it over.");
    expect(text).not.toContain("the fourth");
    expect(text).not.toContain("القاهرة");
    expect(text).not.toContain("3.14");
    expect(JSON.stringify(studentBlocks(lesson, "student-a"))).toBe(text);
  });
});

describe("older lessons", () => {
  it("upgrade their quizzes and reflections to today's questions", () => {
    const upgraded = upgradeLesson({
      version: 1,
      blocks: [
        {
          id: uuid(5),
          type: "quiz",
          question: "2 + 2?",
          options: [
            { id: uuid(51), text: "4" },
            { id: uuid(52), text: "5" },
          ],
          correctOptionIds: [uuid(51)],
          explanation: "",
        },
        { id: uuid(6), type: "reflection", prompt: "What did you learn?" },
      ],
    });
    expect(v.safeParse(lessonDocumentSchema, upgraded).success).toBe(true);
    expect(upgraded.blocks.map((block) => block.type)).toEqual([
      "choice",
      "written",
    ]);
  });
});

describe("states from stored tries", () => {
  it("counts tries, reveals once limited tries run out, and takes a written answer's mark", () => {
    const limited: LessonDocument = {
      version: 2,
      blocks: [
        { ...typed, tries: 2 },
        {
          ...common,
          id: uuid(7),
          type: "written",
          prompt: "Explain",
          points: 4,
          wordLimit: null,
        },
      ],
    };
    const states = checkStates(limited, [
      { blockId: typed.id, try: 1, state: "answered", fraction: 0 },
      { blockId: typed.id, try: 2, state: "answered", fraction: 0 },
      { blockId: uuid(7), try: 1, state: "needs_marking", fraction: null },
      { blockId: uuid(7), try: 1, state: "marked", fraction: 0.75 },
    ]);
    expect(states[typed.id]).toMatchObject({
      tries: 2,
      revealed: true,
      correct: false,
    });
    expect(states[uuid(7)]).toMatchObject({
      tries: 1,
      marked: true,
      fraction: 0.75,
    });
  });
});

describe("writing blanks", () => {
  it("reads typed and chosen blanks from brackets and writes them back", () => {
    const source =
      "Water boils at [100/one hundred] degrees and freezes at [0|10|32].";
    const segments = parseGaps(source);
    expect(segments).toMatchObject([
      { type: "text", text: "Water boils at " },
      { type: "gap", answers: ["100", "one hundred"], options: [] },
      { type: "text", text: " degrees and freezes at " },
      { type: "gap", answers: ["0"], options: ["0", "10", "32"] },
      { type: "text", text: "." },
    ]);
    expect(gapsSource(segments)).toBe(source);
  });

  it("keeps each blank's id by position across an edit", () => {
    const first = parseGaps("[a] and [b]");
    const ids = first.flatMap((segment) =>
      segment.type === "gap" ? [segment.id] : [],
    );
    const edited = parseGaps("Now [a] and [c] and [d]", ids);
    const after = edited.flatMap((segment) =>
      segment.type === "gap" ? [segment.id] : [],
    );
    expect(after.slice(0, 2)).toEqual(ids);
    expect(after[2]).not.toBe(ids[1]);
  });
});

describe("matching, ordering and sorting", () => {
  const matching: MatchingBlock = {
    ...common,
    id: uuid(8),
    type: "matching",
    prompt: "Match each country to its capital.",
    pairs: [
      { id: uuid(81), prompt: "Egypt", answer: "Cairo" },
      { id: uuid(82), prompt: "Jordan", answer: "Amman" },
      { id: uuid(83), prompt: "Egypt's capital", answer: "Cairo" },
    ],
    distractors: [{ id: uuid(84), text: "Tunis" }],
  };
  const ordering: OrderingBlock = {
    ...common,
    id: uuid(9),
    type: "ordering",
    prompt: "Put the planets in order from the sun.",
    items: [
      { id: uuid(91), text: "Mercury" },
      { id: uuid(92), text: "Venus" },
      { id: uuid(93), text: "Earth" },
      { id: uuid(94), text: "Mars" },
    ],
    scoring: "neighbours",
  };
  const sorting: SortingBlock = {
    ...common,
    id: uuid(10),
    type: "sorting",
    prompt: "Sort the animals.",
    groups: [
      { id: uuid(101), name: "Mammals" },
      { id: uuid(102), name: "Birds" },
    ],
    items: [
      { id: uuid(103), text: "Camel", groupId: uuid(101) },
      { id: uuid(104), text: "Falcon", groupId: uuid(102) },
      { id: uuid(105), text: "Bat", groupId: uuid(101) },
    ],
  };

  it("marks each pair by its answer, so a repeated answer is offered once and accepted for both", () => {
    const [shown] = studentBlocks({ version: 2, blocks: [matching] }, "s");
    if (shown?.type !== "matching") throw new Error("matching expected");
    expect(shown.choices.map((item) => item.text).toSorted()).toEqual([
      "Amman",
      "Cairo",
      "Tunis",
    ]);
    const marked = markResponse(matching, {
      type: "matching",
      pairs: {
        [uuid(81)]: uuid(81),
        [uuid(82)]: uuid(84),
        [uuid(83)]: uuid(81),
      },
    });
    expect(marked).toMatchObject({
      fraction: 0.6667,
      correct: false,
      parts: { [uuid(81)]: true, [uuid(82)]: false, [uuid(83)]: true },
    });
  });

  it("credits an order by neighbours in place and never shows it already solved", () => {
    const swapped = markResponse(ordering, {
      type: "ordering",
      order: [uuid(91), uuid(92), uuid(94), uuid(93)],
    });
    expect(swapped).toMatchObject({ fraction: 0.3333, correct: false });
    expect(
      markResponse(
        { ...ordering, scoring: "all" },
        { type: "ordering", order: [uuid(91), uuid(92), uuid(94), uuid(93)] },
      ).fraction,
    ).toBe(0);
    expect(
      markResponse(ordering, { type: "ordering", order: [uuid(91), uuid(91)] })
        .fraction,
    ).toBe(0);
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      const [shown] = studentBlocks({ version: 2, blocks: [ordering] }, seed);
      if (shown?.type !== "ordering") throw new Error("ordering expected");
      expect(shown.items.map((item) => item.id)).not.toEqual(
        ordering.items.map((item) => item.id),
      );
    }
  });

  it("sorts items into groups without telling the student which is which", () => {
    const [shown] = studentBlocks({ version: 2, blocks: [sorting] }, "s");
    expect(JSON.stringify(shown)).not.toContain("groupId");
    expect(
      markResponse(sorting, {
        type: "sorting",
        groups: { [uuid(103)]: uuid(101), [uuid(104)]: uuid(101) },
      }),
    ).toMatchObject({ fraction: 0.3333, parts: { [uuid(105)]: false } });
    expect(partKey(sorting)).toEqual({
      [uuid(103)]: "Mammals",
      [uuid(104)]: "Birds",
      [uuid(105)]: "Mammals",
    });
  });
});
