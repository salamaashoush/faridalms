import { PACKS } from "@faridalms/puzzles/levels";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type {
  ChoiceBlock,
  CrosswordBlock,
  GapsBlock,
  HighlightBlock,
  LabellingBlock,
  LessonDocument,
  StoredTry,
  MatchingBlock,
  NumberBlock,
  OrderingBlock,
  ParsonsBlock,
  PollBlock,
  ProgramBlock,
  PuzzleBlock,
  SortingBlock,
  TextBlock,
  WordSearchBlock,
} from "./learning";

import { crosswordLayout, crosswordLetters, squaresOf } from "./crossword";
import {
  answerKey,
  bandFor,
  checkStates,
  completionMet,
  creditOf,
  describeCheck,
  feedbackAtOf,
  feedbackBandsSchema,
  gapsSource,
  highlightTokens,
  lessonIssue,
  lessonConditionSchema,
  lessonDocumentSchema,
  lessonScore,
  markResponse,
  moduleStanding,
  outputMatches,
  ownResponse,
  parseGaps,
  partKey,
  pathOf,
  prerequisiteMet,
  remarksOf,
  responseIssue,
  settled,
  studentBlocks,
  upgradeLesson,
} from "./learning";
import { contentOfLesson, lessonOfContent } from "./lesson-content";
import { squaresAlong, wordSearch } from "./wordsearch";

const uuid = (n: number) =>
  `0192f0a4-7a1c-7b5a-9a2e-${String(n).padStart(12, "0")}`;

const common = {
  points: 1,
  hints: ["Think it over."],
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
    once: false,
    hints: 0,
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

/** What a student sees of a question after this many wrong tries. */
function afterMisses(block: TextBlock, misses: number) {
  const rows: StoredTry[] = Array.from({ length: misses }, (_, index) => ({
    blockId: block.id,
    try: index + 1,
    state: "answered",
    fraction: 0,
    response: { type: "text", text: "Giza" },
    feedback: null,
  }));
  const states = checkStates({ version: 2, blocks: [block] }, rows);
  return describeCheck(block, rows, states[block.id]);
}

describe("hints in order", () => {
  const steps = ["It is on the Nile.", "It starts with Q.", "Al-Qahira."];
  it("opens one more after each wrong try, saying whether another waits", () => {
    const open = { ...typed, hints: steps };
    expect(afterMisses(open, 0)).toMatchObject({ hints: [], hintsLeft: 0 });
    expect(afterMisses(open, 1)).toMatchObject({
      hints: steps.slice(0, 1),
      hintsLeft: 2,
    });
    expect(afterMisses(open, 3)).toMatchObject({ hints: steps, hintsLeft: 0 });
    expect(afterMisses(open, 5)).toMatchObject({ hints: steps, hintsLeft: 0 });
  });

  it("keeps the last of limited tries for the answer, not a hint", () => {
    const limited = { ...typed, hints: steps, tries: 3 };
    expect(afterMisses(limited, 2)).toMatchObject({
      hints: steps.slice(0, 2),
      hintsLeft: 0,
    });
    expect(afterMisses(limited, 3)).toMatchObject({
      revealed: true,
      hints: [],
      hintsLeft: 0,
    });
  });
});

/** A student's answers to a question, each kept as it came, Cairo right. */
const kept = (block: TextBlock, answers: string[]): StoredTry[] =>
  answers.map((text, index) => ({
    blockId: block.id,
    try: index + 1,
    state: "answered",
    fraction: text === "Cairo" ? 1 : 0,
    response: { type: "text", text },
    feedback: null,
  }));
/** What the student sees of those answers, given which feedback has come. */
const waitingView = (
  block: TextBlock,
  rows: StoredTry[],
  shown: { end: boolean; teacher: boolean },
) =>
  describeCheck(
    block,
    rows,
    checkStates({ version: 2, blocks: [block] }, rows)[block.id],
    shown,
  );

describe("feedback that waits", () => {
  const atEnd = { ...typed, feedbackAt: "end" as const, tries: 2 };

  it("keeps an answer without saying how it went until it is shown", () => {
    const rows = kept(atEnd, ["Giza"]);
    const hidden = waitingView(atEnd, rows, { end: false, teacher: false });
    expect(hidden).toMatchObject({
      tries: 1,
      response: { type: "text", text: "Giza" },
      correct: false,
      revealed: false,
      hints: [],
      key: null,
      explanation: null,
      timing: { at: "end", open: false },
    });
    expect(
      waitingView(atEnd, rows, { end: true, teacher: false }),
    ).toMatchObject({
      correct: false,
      key: ["القاهرة"],
      explanation: "Because.",
      timing: { at: "end", open: true },
    });
  });

  it("counts the last answer once, however often it changed", () => {
    const rows = kept(atEnd, ["Giza", "Luxor", "Cairo"]);
    const state = checkStates({ version: 2, blocks: [atEnd] }, rows)[atEnd.id];
    expect(state).toMatchObject({
      tries: 1,
      correct: true,
      revealed: false,
      firstTryCorrect: true,
    });
    expect(creditOf(state)).toBe(1);
  });

  it("is settled once answered, and waits for its teacher when asked to", () => {
    const forTeacher = { ...typed, feedbackAt: "teacher" as const };
    const rows = kept(forTeacher, ["Giza"]);
    const state = checkStates({ version: 2, blocks: [forTeacher] }, rows)[
      forTeacher.id
    ];
    expect(settled(forTeacher, state)).toBe(true);
    expect(
      waitingView(forTeacher, rows, { end: true, teacher: false }).timing,
    ).toEqual({ at: "teacher", open: false });
  });

  it("answers code and a memory game at once whatever they say", () => {
    expect(feedbackAtOf({ ...typed, feedbackAt: "end" })).toBe("end");
    const memory: MatchingBlock = {
      ...common,
      id: uuid(8),
      type: "matching",
      prompt: "Find the pairs.",
      pairs: [
        { id: uuid(81), prompt: "Egypt", answer: "Cairo" },
        { id: uuid(82), prompt: "Jordan", answer: "Amman" },
      ],
      distractors: [],
      memory: true,
      feedbackAt: "end",
    };
    expect(feedbackAtOf(memory)).toBe("now");
  });

  it("keeps a young lesson's feedback at once", () => {
    const content = contentOfLesson({
      version: 2,
      blocks: [{ ...typed, feedbackAt: "end" }],
    });
    if (!content) throw new Error("the lesson has no content");
    expect(lessonIssue({ completion: "view", content, young: true })).toBe(
      "learning.young_feedback",
    );
    expect(lessonIssue({ completion: "view", content })).toBeNull();
  });
});

describe("hints asked for", () => {
  const steps = ["It is on the Nile.", "It starts with C.", "Al-Qahira."];
  const open = { ...typed, hints: steps };
  const asking = (count: number, answers: string[]): StoredTry[] => [
    ...Array.from({ length: count }, () => ({
      blockId: open.id,
      try: 1,
      state: "hint" as const,
      fraction: null,
      response: {},
      feedback: null,
    })),
    ...kept(open, answers),
  ];
  const seen = (rows: StoredTry[]) => {
    const state = checkStates({ version: 2, blocks: [open] }, rows)[open.id];
    return { state, view: describeCheck(open, rows, state) };
  };

  it("opens the next hint before any answer, and says how many are left", () => {
    expect(seen(asking(1, [])).view).toMatchObject({
      hints: steps.slice(0, 1),
      askable: 2,
    });
  });

  it("adds a wrong try's hint to those asked for, and stops once settled", () => {
    expect(seen(asking(1, ["Giza"])).view).toMatchObject({
      hints: steps.slice(0, 2),
      askable: 1,
    });
    expect(seen(asking(1, ["Giza", "Cairo"])).view).toMatchObject({
      hints: [],
      askable: 0,
    });
  });

  it("costs a hint what a wrong try would, and is no longer right first time", () => {
    const { state } = seen(asking(1, ["Cairo"]));
    expect(state).toMatchObject({ correct: true, firstTryCorrect: false });
    expect(creditOf(state)).toBeCloseTo(2 / 3);
  });
});

describe("marking again under a changed key", () => {
  const nile = uuid(41);
  const amazon = uuid(42);
  const asked: ChoiceBlock = {
    ...common,
    id: uuid(40),
    type: "choice",
    prompt: "Which river flows through Egypt?",
    options: [
      { id: nile, text: "The Nile", feedback: "" },
      { id: amazon, text: "The Amazon", feedback: "" },
    ],
    correctOptionIds: [amazon],
    multiple: false,
    shuffle: false,
  };
  const fixed = { ...asked, correctOptionIds: [nile] };
  const chose = (optionId: string, at: number, fraction: number) => ({
    blockId: asked.id,
    try: at,
    state: "answered" as const,
    fraction,
    response: { type: "choice", optionIds: [optionId] },
    feedback: null,
  });

  it("finds the answers the new key marks differently", () => {
    const rows = [chose(nile, 1, 0), chose(amazon, 2, 1)];
    expect(remarksOf(fixed, rows)).toEqual([
      { try: 1, fraction: 1 },
      { try: 2, fraction: 0 },
    ]);
    expect(remarksOf(asked, rows)).toEqual([]);
  });

  it("counts a try marked right again as where the question ended", () => {
    const rows: StoredTry[] = [
      chose(nile, 1, 0),
      chose(amazon, 2, 1),
      ...remarksOf(fixed, [chose(nile, 1, 0), chose(amazon, 2, 1)]).map(
        (change) => ({
          blockId: asked.id,
          try: change.try,
          state: "remarked" as const,
          fraction: change.fraction,
          response: {},
          feedback: null,
        }),
      ),
    ];
    const state = checkStates({ version: 2, blocks: [fixed] }, rows)[asked.id];
    expect(state).toMatchObject({
      tries: 1,
      correct: true,
      firstTryCorrect: true,
    });
    expect(remarksOf(fixed, rows)).toEqual([]);
  });
});

describe("messages by score", () => {
  const bands = [
    { id: uuid(51), from: 0, text: "Look at the river map again." },
    { id: uuid(52), from: 80, text: "Well done." },
    { id: uuid(53), from: 50, text: "Nearly there." },
  ];

  it("gives the band starting highest at or below the score", () => {
    expect(bandFor(bands, 100)?.text).toBe("Well done.");
    expect(bandFor(bands, 80)?.text).toBe("Well done.");
    expect(bandFor(bands, 79)?.text).toBe("Nearly there.");
    expect(bandFor(bands, 10)?.text).toBe("Look at the river map again.");
    expect(bandFor(bands, null)).toBeNull();
    expect(bandFor(bands.slice(1), 10)).toBeNull();
  });

  it("refuses two bands from the same score", () => {
    const twice = v.safeParse(feedbackBandsSchema, [
      bands[0],
      { ...bands[1], from: 0 },
    ]);
    expect(twice.success).toBe(false);
  });
});

describe("a word bank", () => {
  const banked: GapsBlock = {
    ...gaps,
    segments: gaps.segments.map((segment) =>
      segment.type === "gap" ? { ...segment, options: [] } : segment,
    ),
    bank: ["50", "212"],
  };

  it("gives the student every gap's answer and the extra words in one shuffled bank", () => {
    const [shown] = studentBlocks({ version: 2, blocks: [banked] }, "a");
    if (shown?.type !== "gaps") throw new Error("not gaps");
    expect(shown.bank?.toSorted()).toEqual(["0", "100", "212", "50"]);
    expect(JSON.stringify(shown.segments)).not.toContain("answers");
  });

  it("refuses gaps that choose their own words as well", () => {
    expect(
      v.safeParse(lessonDocumentSchema, {
        version: 2,
        blocks: [{ ...gaps, bank: ["50"] }],
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(lessonDocumentSchema, { version: 2, blocks: [banked] })
        .success,
    ).toBe(true);
  });
});

describe("highlighting words", () => {
  const found: HighlightBlock = {
    ...common,
    id: uuid(60),
    type: "highlight",
    prompt: "Pick out the verbs.",
    segments: [
      { type: "text", text: "The children " },
      { type: "target", id: uuid(61), text: "ran" },
      { type: "text", text: " and " },
      { type: "target", id: uuid(62), text: "jumped" },
      { type: "text", text: " in the park." },
    ],
  };
  const tokens = highlightTokens(found).filter((token) => token.word);
  const idOf = (text: string) =>
    tokens.find((token) => token.text === text)?.id ?? "";

  it("numbers every word alike, so the student cannot tell which to find", () => {
    const [shown] = studentBlocks({ version: 2, blocks: [found] }, "a");
    if (shown?.type !== "highlight") throw new Error("not highlight");
    expect(shown.tokens.map((token) => token.text).join("")).toBe(
      "The children ran and jumped in the park.",
    );
    expect(JSON.stringify(shown)).not.toContain("target");
  });

  it("gives each word found its share and takes one back for each picked wrongly", () => {
    const mark = (...words: string[]) =>
      markResponse(found, { type: "highlight", chosen: words.map(idOf) });
    expect(mark("ran", "jumped")).toMatchObject({ fraction: 1, correct: true });
    expect(mark("ran")).toMatchObject({ fraction: 0.5, correct: false });
    expect(mark("ran", "jumped", "park.")).toMatchObject({
      fraction: 0.5,
      correct: false,
      parts: { [idOf("park.")]: false, [idOf("ran")]: true },
    });
    expect(mark(...tokens.map((token) => token.text)).fraction).toBe(0);
    expect(answerKey(found)).toEqual(["ran", "jumped"]);
  });

  it("keeps its words to find through the document", () => {
    const document = contentOfLesson({ version: 2, blocks: [found] });
    if (!document) throw new Error("no document");
    expect(lessonOfContent(document).blocks[0]).toEqual(found);
  });
});

describe("polls", () => {
  const poll: PollBlock = {
    ...common,
    hints: [],
    explanation: "",
    points: 0,
    id: uuid(70),
    type: "poll",
    prompt: "Which season do you like best?",
    options: ["Spring", "Summer", "Autumn", "Winter"].map((text, index) => ({
      id: uuid(71 + index),
      text,
      feedback: "",
    })),
    multiple: false,
    classResults: true,
  };
  const [spring = "", summer = ""] = poll.options.map((option) => option.id);

  it("settles at the first answer, whichever it is, and counts for nothing", () => {
    expect(
      markResponse(poll, { type: "poll", optionIds: [summer] }),
    ).toMatchObject({ fraction: 1, correct: true });
    expect(lessonScore({ version: 2, blocks: [poll] }, {})).toBeNull();
    expect(answerKey(poll)).toEqual([]);
    expect(
      v.safeParse(lessonDocumentSchema, {
        version: 2,
        blocks: [{ ...poll, points: 1 }],
      }).success,
    ).toBe(false);
  });

  it("takes one vote for each option, and one option unless several may be picked", () => {
    const issue = (...optionIds: string[]) =>
      responseIssue(poll, { type: "poll", optionIds });
    expect(issue(spring)).toBeNull();
    expect(issue(spring, summer)).toBe("learning.option");
    expect(
      responseIssue(
        { ...poll, multiple: true },
        {
          type: "poll",
          optionIds: [spring, summer],
        },
      ),
    ).toBeNull();
    expect(
      responseIssue(
        { ...poll, multiple: true },
        {
          type: "poll",
          optionIds: [spring, spring],
        },
      ),
    ).toBe("learning.option");
    expect(issue(uuid(99))).toBe("learning.option");
  });

  it("shows its options in the order written, as a scale needs", () => {
    const [shown] = studentBlocks({ version: 2, blocks: [poll] }, "a");
    if (shown?.type !== "poll") throw new Error("not a poll");
    expect(shown.options.map((option) => option.text)).toEqual([
      "Spring",
      "Summer",
      "Autumn",
      "Winter",
    ]);
  });

  it("keeps whether the class sees its answers through the document", () => {
    const unshared = { ...poll, classResults: false };
    const document = contentOfLesson({ version: 2, blocks: [unshared] });
    if (!document) throw new Error("no document");
    expect(lessonOfContent(document).blocks[0]).toEqual(unshared);
  });
});

/** Whether a lesson holding just this block may go to students. */
const publishable = (block: LessonDocument["blocks"][number]) =>
  v.safeParse(lessonDocumentSchema, { version: 2, blocks: [block] }).success;

describe("word searches", () => {
  const planets: WordSearchBlock = {
    ...common,
    id: uuid(100),
    type: "wordsearch",
    prompt: "Find the planets.",
    words: [
      { id: uuid(101), answer: "Mars" },
      { id: uuid(102), answer: "Venus" },
      { id: uuid(103), answer: "Earth" },
    ],
  };
  const search = wordSearch(planets.words, planets.id);
  if (!search) throw new Error("no grid");
  /** A word's two ends, as a student marks it, either way round. */
  const ends = (wordId: string, backwards = false) => {
    const line = search.lines[wordId];
    if (!line) throw new Error("not hidden");
    const squares = squaresAlong(line);
    const [first = [0, 0], last = [0, 0]] = backwards
      ? [squares.at(-1), squares[0]]
      : [squares[0], squares.at(-1)];
    return [...first, ...last] as [number, number, number, number];
  };

  it("shows every student of the class the same grid, with the words to find", () => {
    const [first] = studentBlocks({ version: 2, blocks: [planets] }, "one");
    const [second] = studentBlocks({ version: 2, blocks: [planets] }, "two");
    if (first?.type !== "wordsearch") throw new Error("not a word search");
    expect(first.rows).toEqual(search.rows);
    expect(second).toEqual(first);
  });

  it("finds each word marked from either end, and nothing for a stretch that spells none", () => {
    const [mars = "", venus = ""] = planets.words.map((word) => word.id);
    expect(
      markResponse(planets, {
        type: "wordsearch",
        found: [ends(mars), ends(venus, true)],
      }),
    ).toMatchObject({ correct: false, parts: { [mars]: true, [venus]: true } });
    expect(
      markResponse(planets, {
        type: "wordsearch",
        found: planets.words.map((word) => ends(word.id)),
      }),
    ).toMatchObject({ fraction: 1, correct: true });
  });

  it("takes only stretches in a line inside its grid", () => {
    const size = search.rows.length;
    expect(
      responseIssue(planets, { type: "wordsearch", found: [[0, 0, 1, 2]] }),
    ).toBe("learning.option");
    expect(
      responseIssue(planets, {
        type: "wordsearch",
        found: [[0, 0, 0, size]],
      }),
    ).toBe("learning.option");
    expect(
      responseIssue(planets, { type: "wordsearch", found: [[0, 0, 0, 1]] }),
    ).toBeNull();
  });

  it("keeps its words through the document", () => {
    const document = contentOfLesson({ version: 2, blocks: [planets] });
    if (!document) throw new Error("no document");
    expect(lessonOfContent(document).blocks[0]).toEqual(planets);
  });
});

describe("crosswords", () => {
  const rivers: CrosswordBlock = {
    ...common,
    id: uuid(90),
    type: "crossword",
    prompt: "Rivers and seas.",
    words: [
      { id: uuid(91), answer: "river", clue: "Water flowing to the sea" },
      { id: uuid(92), answer: "delta", clue: "Where a river fans out" },
      { id: uuid(93), answer: "sea", clue: "Salt water" },
    ],
  };
  const layout = crosswordLayout(rivers.words);
  if (!layout) throw new Error("no layout");
  /** Every square filled with its word's letters, but for one word's. */
  const filled = (wrong?: string) =>
    Object.fromEntries(
      layout.entries.flatMap((entry) => {
        const letters = crosswordLetters(
          rivers.words.find((word) => word.id === entry.id)?.answer ?? "",
        );
        return squaresOf(entry).map((key, index) => [
          key,
          entry.id === wrong && index === 0 ? "Q" : (letters[index] ?? ""),
        ]);
      }),
    );

  it("shows its grid and clues, with none of the letters", () => {
    const [shown] = studentBlocks({ version: 2, blocks: [rivers] }, "a");
    if (shown?.type !== "crossword") throw new Error("not a crossword");
    expect(shown.entries).toHaveLength(3);
    expect(shown.entries.map((entry) => entry.clue).toSorted()).toEqual(
      rivers.words.map((word) => word.clue).toSorted(),
    );
    expect(JSON.stringify(shown)).not.toContain('"answer"');
    expect(JSON.stringify(shown)).not.toMatch(/RIVER|DELTA/u);
    expect(shown.rtl).toBe(false);
  });

  it("marks each word by its squares, whatever their case", () => {
    const right = filled();
    expect(
      markResponse(rivers, {
        type: "crossword",
        squares: Object.fromEntries(
          Object.entries(right).map(([key, letter]) => [
            key,
            letter.toLowerCase(),
          ]),
        ),
      }),
    ).toMatchObject({ fraction: 1, correct: true });
    const sea = uuid(93);
    expect(
      markResponse(rivers, { type: "crossword", squares: filled(sea) }),
    ).toMatchObject({ correct: false, parts: { [sea]: false } });
    expect(partKey(rivers)).toMatchObject({ [sea]: "SEA" });
  });

  it("takes letters only in its own squares", () => {
    expect(
      responseIssue(rivers, { type: "crossword", squares: filled() }),
    ).toBeNull();
    expect(
      responseIssue(rivers, { type: "crossword", squares: { "40-40": "A" } }),
    ).toBe("learning.option");
    const [first = ""] = Object.keys(filled());
    expect(
      responseIssue(rivers, { type: "crossword", squares: { [first]: "AB" } }),
    ).toBe("learning.option");
  });

  it("needs words that cross, and keeps them through the document", () => {
    expect(publishable(rivers)).toBe(true);
    expect(
      publishable({
        ...rivers,
        words: [
          { id: uuid(94), answer: "cat", clue: "Pet" },
          { id: uuid(95), answer: "dog", clue: "Pet" },
        ],
      }),
    ).toBe(false);
    const document = contentOfLesson({ version: 2, blocks: [rivers] });
    if (!document) throw new Error("no document");
    expect(lessonOfContent(document).blocks[0]).toEqual(rivers);
  });
});

describe("labelling a picture", () => {
  const plant: LabellingBlock = {
    ...common,
    id: uuid(80),
    type: "labelling",
    prompt: "Label the parts of the plant.",
    picture: { fileId: uuid(81), alt: "A flowering plant" },
    places: [
      { box: [0.4, 0.05, 0.2, 0.2], name: "Flower" },
      { box: [0.45, 0.4, 0.1, 0.3], name: "Stem" },
      { box: [0.3, 0.8, 0.4, 0.15], name: "Roots" },
    ],
    extras: ["Bark"],
  };
  it("shows the places by number and every label in one bank, none tied to its place", () => {
    const [shown] = studentBlocks({ version: 2, blocks: [plant] }, "a");
    if (shown?.type !== "labelling") throw new Error("not labelling");
    expect(shown.spots).toEqual(plant.places.map((place) => place.box));
    expect(shown.bank.toSorted()).toEqual(["Bark", "Flower", "Roots", "Stem"]);
    expect(JSON.stringify(shown)).not.toContain('"name"');
  });

  it("gives each place labelled rightly its share", () => {
    const mark = (labels: Record<string, string>) =>
      markResponse(plant, { type: "labelling", labels });
    expect(mark({ 1: "Flower", 2: "Stem", 3: "Roots" })).toMatchObject({
      fraction: 1,
      correct: true,
    });
    expect(mark({ 1: "Flower", 2: "Roots", 3: "Bark" })).toMatchObject({
      correct: false,
      parts: { 1: true, 2: false, 3: false },
    });
    expect(partKey(plant)).toEqual({ 1: "Flower", 2: "Stem", 3: "Roots" });
    expect(answerKey(plant)).toEqual(["1 Flower", "2 Stem", "3 Roots"]);
  });

  it("takes only labels from its bank, for places it has", () => {
    const issue = (labels: Record<string, string>) =>
      responseIssue(plant, { type: "labelling", labels });
    expect(issue({ 1: "Bark" })).toBeNull();
    expect(issue({ 1: "Leaf" })).toBe("learning.option");
    expect(issue({ 4: "Bark" })).toBe("learning.option");
  });

  it("needs its picture, a place, and a different label for each", () => {
    expect(publishable(plant)).toBe(true);
    expect(publishable({ ...plant, picture: null })).toBe(false);
    expect(publishable({ ...plant, places: [] })).toBe(false);
    expect(publishable({ ...plant, extras: ["stem"] })).toBe(false);
  });

  it("keeps its places and extra labels through the document", () => {
    const document = contentOfLesson({ version: 2, blocks: [plant] });
    if (!document) throw new Error("no document");
    expect(lessonOfContent(document).blocks[0]).toEqual(plant);
  });
});

/** Whether a lesson holding just this block may go to students. */
const allowed = (block: NumberBlock) =>
  v.safeParse(lessonDocumentSchema, { version: 2, blocks: [block] }).success;

describe("a number line", () => {
  const placed = { ...number, value: 3, line: { from: 0, to: 5, step: 0.5 } };

  it("shows its line to the student, keeping the answer back", () => {
    const [shown] = studentBlocks({ version: 2, blocks: [placed] }, "a");
    expect(shown).toMatchObject({ line: { from: 0, to: 5, step: 0.5 } });
    expect(JSON.stringify(shown)).not.toContain('"value"');
  });

  it("refuses a line the answer is not on, or one too fine to read", () => {
    expect(allowed(placed)).toBe(true);
    expect(allowed({ ...placed, value: 7 })).toBe(false);
    expect(allowed({ ...placed, line: { from: 0, to: 5, step: 0.01 } })).toBe(
      false,
    );
    expect(allowed({ ...placed, line: { from: 5, to: 0, step: 1 } })).toBe(
      false,
    );
  });
});

describe("older lessons", () => {
  it("read a question's one hint as the first of its hints", () => {
    const { hints: _hints, ...saved } = typed;
    const upgraded = upgradeLesson({
      version: 2,
      blocks: [{ ...saved, hint: "It is on the Nile." }],
    });
    expect(v.safeParse(lessonDocumentSchema, upgraded).success).toBe(true);
    expect(upgraded.blocks[0]).toMatchObject({ hints: ["It is on the Nile."] });
    expect(upgraded.blocks[0]).not.toHaveProperty("hint");
  });

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

const placed = (block: ParsonsBlock, indents = true) =>
  block.lines.map((line) => ({
    id: line.id,
    indent: indents ? line.indent : 0,
  }));

describe("code puzzles", () => {
  const python: ParsonsBlock = {
    ...common,
    id: uuid(20),
    type: "parsons",
    prompt: "Greet someone by name, or everyone.",
    language: "python",
    lines: [
      { id: uuid(201), code: "def greet(name):", indent: 0 },
      { id: uuid(202), code: "if name:", indent: 1 },
      { id: uuid(203), code: 'print("Hello", name)', indent: 2 },
      { id: uuid(204), code: "else:", indent: 1 },
      { id: uuid(205), code: 'print("Hello")', indent: 2 },
    ],
    distractors: [{ id: uuid(206), code: 'print("Hello" name)' }],
  };
  const javascript: ParsonsBlock = {
    ...common,
    id: uuid(21),
    type: "parsons",
    prompt: "Double a positive number.",
    language: "javascript",
    lines: [
      { id: uuid(211), code: "function twice(x) {", indent: 0 },
      { id: uuid(212), code: "if (x > 0) {", indent: 1 },
      { id: uuid(213), code: "return x * 2;", indent: 2 },
      { id: uuid(214), code: "}", indent: 1 },
      { id: uuid(215), code: "return 0;", indent: 1 },
      { id: uuid(216), code: "}", indent: 0 },
    ],
    distractors: [],
  };
  it("marks a Python program by its order and how far each line is indented", () => {
    expect(
      markResponse(python, { type: "parsons", lines: placed(python) }),
    ).toMatchObject({ fraction: 1, correct: true });
    const flat = markResponse(python, {
      type: "parsons",
      lines: placed(python, false),
    });
    expect(flat).toMatchObject({ fraction: 0, correct: false });
    expect(flat.parts).toMatchObject({
      [uuid(201)]: true,
      [uuid(202)]: false,
    });
  });

  it("fails a program that uses a line that belongs nowhere or leaves one out", () => {
    const lines = placed(python);
    expect(
      markResponse(python, {
        type: "parsons",
        lines: lines.with(2, { id: uuid(206), indent: 2 }),
      }),
    ).toMatchObject({ correct: false, parts: { [uuid(206)]: false } });
    expect(
      markResponse(python, { type: "parsons", lines: lines.slice(0, 4) }),
    ).toMatchObject({ fraction: 0, correct: false });
    expect(
      markResponse(python, {
        type: "parsons",
        lines: [...lines, lines[0] ?? { id: uuid(201), indent: 0 }],
      }).fraction,
    ).toBe(0);
  });

  it("takes alike lines either way round and ignores indentation outside Python", () => {
    const lines = placed(javascript, false);
    const swapped = lines
      .with(3, { id: uuid(216), indent: 0 })
      .with(5, { id: uuid(214), indent: 0 });
    expect(
      markResponse(javascript, { type: "parsons", lines: swapped }),
    ).toMatchObject({ fraction: 1, correct: true });
  });

  it("shows every line shuffled together, never in order and never indented", () => {
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      const [shown] = studentBlocks({ version: 2, blocks: [python] }, seed);
      if (shown?.type !== "parsons") throw new Error("parsons expected");
      expect(shown.lines.map((line) => line.id)).not.toEqual(
        [...python.lines, ...python.distractors].map((line) => line.id),
      );
      expect(shown.lines.map((line) => line.id).toSorted()).toEqual(
        [...python.lines, ...python.distractors]
          .map((line) => line.id)
          .toSorted(),
      );
      expect(JSON.stringify(shown)).not.toMatch(/indent|distractors/);
    }
  });

  it("gives the program as its answer, indented, and each line's place", () => {
    expect(answerKey(python)).toEqual([
      "def greet(name):",
      "    if name:",
      '        print("Hello", name)',
      "    else:",
      '        print("Hello")',
    ]);
    expect(partKey(python)).toEqual({
      [uuid(201)]: "1",
      [uuid(202)]: "2",
      [uuid(203)]: "3",
      [uuid(204)]: "4",
      [uuid(205)]: "5",
    });
  });
});

describe("code exercises", () => {
  const exercise: ProgramBlock = {
    ...common,
    id: uuid(30),
    type: "program",
    prompt: "Print the square.",
    language: "python",
    starter: "n = int(input())",
    tests: [
      { id: uuid(301), input: "3", expected: "9", hidden: false },
      { id: uuid(302), input: "-4", expected: "16", hidden: true },
    ],
  };
  const ran = (passed: [boolean, boolean]) => ({
    type: "program" as const,
    code: "print(9)",
    results: {
      [uuid(301)]: {
        passed: passed[0],
        output: "9\n",
        error: null,
        stopped: null,
      },
      [uuid(302)]: {
        passed: passed[1],
        output: null,
        error: null,
        stopped: null,
      },
    },
  });

  it("credits each test the program passed, and nothing for a program never run", () => {
    expect(markResponse(exercise, ran([true, false]))).toMatchObject({
      fraction: 0.5,
      correct: false,
      parts: { [uuid(301)]: true, [uuid(302)]: false },
    });
    expect(markResponse(exercise, ran([true, true]))).toMatchObject({
      fraction: 1,
      correct: true,
    });
    expect(
      markResponse(exercise, { type: "program", code: "print(9)" }).fraction,
    ).toBe(0);
  });

  it("shows a student the tests they may see, and of the hidden ones only that they are there", () => {
    const [shown] = studentBlocks({ version: 2, blocks: [exercise] }, "s");
    if (shown?.type !== "program") throw new Error("program expected");
    expect(shown.tests).toEqual([{ id: uuid(301), input: "3", expected: "9" }]);
    expect(shown.hiddenTests).toEqual([uuid(302)]);
    expect(JSON.stringify(shown)).not.toMatch(/"-4"|"16"/);
  });

  it("compares output by its lines, whatever spaces end them or blank lines follow", () => {
    expect(outputMatches("9", "9\n")).toBe(true);
    expect(outputMatches("a\nb", "a  \r\nb\n\n")).toBe(true);
    expect(outputMatches("a\nb", " a\nb")).toBe(false);
    expect(outputMatches("Yes", "yes")).toBe(false);
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

describe("whose project an answer was built on", () => {
  const classmate = "6a7b8c9d-0e1f-4a2b-8c3d-4e5f6a7b8c9d";
  const file = { fileId: "7b8c9d0e-1f2a-4b3c-9d4e-5f6a7b8c9d0e" };

  it("is nothing a student's answer says for itself", () => {
    expect(
      ownResponse({
        type: "project",
        files: [{ name: "index.html", code: "<h1>Mine</h1>" }],
        remixOf: classmate,
      }),
    ).toEqual({
      type: "project",
      files: [{ name: "index.html", code: "<h1>Mine</h1>" }],
    });
    expect(
      ownResponse({ type: "scratch", project: file, remixOf: classmate }),
    ).toEqual({ type: "scratch", project: file });
  });

  it("leaves every other answer as it was sent", () => {
    const written = { type: "written" as const, text: "My answer." };
    expect(ownResponse(written)).toBe(written);
  });
});

describe("puzzles", () => {
  const staircase = PACKS[2].levels[1];
  const puzzle: PuzzleBlock = {
    ...common,
    id: uuid(300),
    type: "puzzle",
    prompt: "Climb down the stairs to the star.",
    level: staircase,
  };

  it("marks a program by running it on the grid", () => {
    expect(
      markResponse(puzzle, { type: "puzzle", program: staircase.solution }),
    ).toMatchObject({ fraction: 1, correct: true });
    expect(
      markResponse(puzzle, {
        type: "puzzle",
        program: [{ op: "forward" }, { op: "forward" }],
      }),
    ).toMatchObject({ fraction: 0, correct: false });
  });

  it("gives nothing for a program built from blocks the puzzle does not offer", () => {
    const steps = Array.from({ length: 7 }, () => [
      { op: "go" as const, to: "east" as const },
      { op: "go" as const, to: "south" as const },
    ]).flat();
    expect(
      markResponse(puzzle, { type: "puzzle", program: steps }),
    ).toMatchObject({ correct: false });
    // The same walk is right where the puzzle offers those blocks.
    expect(
      markResponse(
        { ...puzzle, level: { ...staircase, blocks: ["go"], limit: null } },
        {
          type: "puzzle",
          program: [
            { op: "go", to: "east" },
            { op: "go", to: "south" },
            { op: "go", to: "east" },
            { op: "go", to: "south" },
            { op: "go", to: "east" },
            { op: "go", to: "south" },
            { op: "go", to: "east" },
          ],
        },
      ),
    ).toMatchObject({ correct: true });
  });

  it("keeps the teacher's program from students, and tells how few blocks it takes", () => {
    const [shown] = studentBlocks({ version: 2, blocks: [puzzle] }, "seed");
    if (shown?.type !== "puzzle") throw new Error("puzzle expected");
    expect(shown.level).not.toHaveProperty("solution");
    expect(shown.level.ideal).toBe(6);
    expect(JSON.stringify(shown)).not.toMatch(/solution|hints|explanation/);
  });

  it("shows the answer as the Python its blocks come to, or as its arrows", () => {
    expect(answerKey(puzzle)).toEqual([
      "for count in range(3):",
      "    forward()",
      "    turn_right()",
      "    forward()",
      "    turn_left()",
      "forward()",
    ]);
    expect(answerKey({ ...puzzle, level: PACKS[0].levels[1] })).toEqual([
      "→ → ↓ ↓",
    ]);
  });

  it("hands over the teacher's program only once the puzzle is settled", () => {
    const tried = (fraction: number): StoredTry => ({
      blockId: puzzle.id,
      state: "answered",
      try: 1,
      fraction,
      response: { type: "puzzle", program: [{ op: "forward" }] },
      feedback: null,
    });
    const view = (fraction: number, block = puzzle) => {
      const rows = [tried(fraction)];
      const states = checkStates({ version: 2, blocks: [block] }, rows);
      return describeCheck(block, rows, states[block.id]);
    };
    expect(view(0)).not.toHaveProperty("keyProgram");
    expect(view(0).key).toBeNull();
    expect(view(0, { ...puzzle, tries: 1 }).keyProgram).toEqual(
      staircase.solution,
    );
    expect(view(1).keyProgram).toEqual(staircase.solution);
  });

  it("refuses a lesson whose puzzle has two things on one square", () => {
    const broken = { ...staircase, gems: [staircase.goal] };
    expect(
      v.safeParse(lessonDocumentSchema, {
        version: 2,
        blocks: [{ ...puzzle, level: broken }],
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(lessonDocumentSchema, { version: 2, blocks: [puzzle] })
        .success,
    ).toBe(true);
  });
});

describe("paths through a module", () => {
  const check = { id: uuid(1), condition: null };
  const more = {
    id: uuid(2),
    condition: { lessonId: uuid(1), atLeast: null, below: 60 },
  };
  const harder = {
    id: uuid(3),
    condition: { lessonId: uuid(1), atLeast: 60, below: null },
  };
  const after = {
    id: uuid(4),
    condition: { lessonId: uuid(3), atLeast: 80, below: null },
  };
  const lessons = [check, more, harder, after];
  const results = (
    ...entries: [number, boolean, number | null][]
  ): Map<string, { completed: boolean; score: number | null }> =>
    new Map(
      entries.map(([n, completed, score]) => [uuid(n), { completed, score }]),
    );

  it("waits on the lesson that sets the score", () => {
    const path = pathOf(lessons, results([1, false, 40]));
    expect([...path.values()]).toEqual(["on", "pending", "pending", "pending"]);
  });

  it("routes a low score to more practice and past the harder step", () => {
    const path = pathOf(lessons, results([1, true, 40]));
    expect(path.get(uuid(2))).toBe("on");
    expect(path.get(uuid(3))).toBe("off");
    expect(path.get(uuid(4))).toBe("off");
  });

  it("takes a score at the boundary up, and chains on the next score", () => {
    expect(pathOf(lessons, results([1, true, 60])).get(uuid(3))).toBe("on");
    const path = pathOf(lessons, results([1, true, 90], [3, true, 85]));
    expect(path.get(uuid(2))).toBe("off");
    expect(path.get(uuid(4))).toBe("on");
  });

  it("keeps finished work on the path after a better score", () => {
    const path = pathOf(lessons, results([1, true, 90], [2, true, 70]));
    expect(path.get(uuid(2))).toBe("on");
  });

  it("shows every branch when the lesson finished without a score", () => {
    const path = pathOf(lessons, results([1, true, null]));
    expect(path.get(uuid(2))).toBe("on");
    expect(path.get(uuid(3))).toBe("on");
  });

  it("drops a condition on a lesson the module no longer has", () => {
    expect(pathOf([more], new Map()).get(uuid(2))).toBe("on");
  });

  it("counts a module along the student's own path", () => {
    const standing = moduleStanding(
      lessons,
      results([1, true, 40], [2, true, 80]),
    );
    expect(standing).toEqual({
      lessons: 2,
      completed: 2,
      finished: true,
      score: 60,
    });
    expect(prerequisiteMet(standing, 60)).toBe(true);
    expect(prerequisiteMet(standing, 61)).toBe(false);
    expect(prerequisiteMet({ ...standing, finished: false }, null)).toBe(false);
    expect(prerequisiteMet({ ...standing, score: null }, 90)).toBe(true);
  });

  it("asks for a range that holds a score", () => {
    const valid = (atLeast: number | null, below: number | null) =>
      v.safeParse(lessonConditionSchema, {
        lessonId: uuid(1),
        atLeast,
        below,
      }).success;
    expect(valid(null, 60)).toBe(true);
    expect(valid(40, 80)).toBe(true);
    expect(valid(null, null)).toBe(false);
    expect(valid(80, 40)).toBe(false);
    expect(valid(60, 60)).toBe(false);
    expect(valid(0, null)).toBe(false);
  });
});
