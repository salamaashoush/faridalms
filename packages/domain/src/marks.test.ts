import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { CheckBlock, LessonDocument, LessonResponse } from "./learning";

import { attemptQuiz, attemptScore, quizIssue } from "./coursework";
import {
  isAuto,
  lessonBlockSchema,
  lessonIssue,
  markResponse,
  quizViews,
  responseIssue,
  responseSchema,
  studentQuiz,
} from "./learning";
import { contentOfLesson, drawnQuestion, quizOfBrief } from "./lesson-content";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const common = {
  points: 2,
  hints: ["Think again."],
  explanation: "Because.",
  tries: 2,
};

/** One question of each kind a quiz marks by its key, and a written one. */
const quiz: LessonDocument = {
  version: 2,
  blocks: [
    {
      ...common,
      id: id(1),
      type: "choice",
      prompt: "Which is a verb?",
      options: [
        { id: id(11), text: "Run", feedback: "" },
        { id: id(12), text: "Table", feedback: "A thing." },
        { id: id(13), text: "Blue", feedback: "" },
      ],
      correctOptionIds: [id(11)],
      multiple: false,
      shuffle: true,
    },
    {
      ...common,
      id: id(2),
      type: "choice",
      prompt: "Which are prime?",
      options: [
        { id: id(21), text: "2", feedback: "" },
        { id: id(22), text: "3", feedback: "" },
        { id: id(23), text: "4", feedback: "Even." },
        { id: id(24), text: "9", feedback: "" },
      ],
      correctOptionIds: [id(21), id(22)],
      multiple: true,
      shuffle: false,
    },
    {
      id: id(3),
      type: "poll",
      prompt: "Which do you prefer?",
      points: 0,
      hints: [],
      explanation: "",
      tries: null,
      options: [
        { id: id(31), text: "Tea", feedback: "" },
        { id: id(32), text: "Coffee", feedback: "" },
      ],
      multiple: false,
      classResults: true,
    },
    {
      ...common,
      id: id(4),
      type: "text",
      prompt: "The capital of Egypt?",
      answers: ["القاهرة", "Cairo"],
      caseSensitive: false,
      closeEnough: true,
      tehMarbuta: true,
    },
    {
      ...common,
      id: id(5),
      type: "number",
      prompt: "Half of nine?",
      mode: "exact",
      value: 4.5,
      tolerance: 0.1,
      percent: false,
      min: 0,
      max: 0,
    },
    {
      ...common,
      id: id(6),
      type: "number",
      prompt: "A number between 3 and 7?",
      mode: "range",
      value: 0,
      tolerance: 0,
      percent: false,
      min: 3,
      max: 7,
    },
    {
      ...common,
      id: id(7),
      type: "gaps",
      prompt: "Fill the gaps.",
      segments: [
        { type: "text", text: "The " },
        { type: "gap", id: id(71), answers: ["cat"], options: [] },
        { type: "text", text: " sat on the " },
        {
          type: "gap",
          id: id(72),
          answers: ["mat"],
          options: ["mat", "hat"],
        },
      ],
      caseSensitive: false,
      closeEnough: false,
      tehMarbuta: true,
    },
    {
      ...common,
      id: id(8),
      type: "matching",
      prompt: "Match the capitals.",
      pairs: [
        { id: id(81), prompt: "Egypt", answer: "Cairo" },
        { id: id(82), prompt: "France", answer: "Paris" },
        { id: id(83), prompt: "Japan", answer: "Tokyo" },
      ],
      distractors: [{ id: id(84), text: "Rome" }],
    },
    {
      ...common,
      id: id(9),
      type: "ordering",
      prompt: "Smallest first.",
      items: [
        { id: id(91), text: "1" },
        { id: id(92), text: "2" },
        { id: id(93), text: "3" },
        { id: id(94), text: "4" },
      ],
      scoring: "neighbours",
    },
    {
      ...common,
      id: id(10),
      type: "sorting",
      prompt: "Sort the animals.",
      groups: [
        { id: id(101), name: "Birds" },
        { id: id(102), name: "Fish" },
      ],
      items: [
        { id: id(103), text: "Eagle", groupId: id(101) },
        { id: id(104), text: "Shark", groupId: id(102) },
        { id: id(105), text: "Owl", groupId: id(101) },
      ],
    },
    {
      ...common,
      id: id(14),
      type: "written",
      prompt: "Explain why.",
      wordLimit: 50,
    },
  ],
};

/** Answers right, partly right and wrong to each question above. */
const answers: [string, LessonResponse][] = [
  [id(1), { type: "choice", optionIds: [id(11)] }],
  [id(1), { type: "choice", optionIds: [id(12)] }],
  [id(2), { type: "choice", optionIds: [id(21), id(22)] }],
  [id(2), { type: "choice", optionIds: [id(21), id(23)] }],
  [id(2), { type: "choice", optionIds: [id(24)] }],
  [id(3), { type: "poll", optionIds: [id(32)] }],
  [id(4), { type: "text", text: "القاهره" }],
  [id(4), { type: "text", text: "cairoo" }],
  [id(4), { type: "text", text: "Giza" }],
  [id(5), { type: "number", text: "٤٫٥" }],
  [id(5), { type: "number", text: "4.55" }],
  [id(5), { type: "number", text: "5" }],
  [id(6), { type: "number", text: "7" }],
  [id(6), { type: "number", text: "8" }],
  [id(7), { type: "gaps", answers: { [id(71)]: "Cat", [id(72)]: "hat" } }],
  [
    id(8),
    {
      type: "matching",
      pairs: { [id(81)]: id(81), [id(82)]: id(84), [id(83)]: id(83) },
    },
  ],
  [id(9), { type: "ordering", order: [id(91), id(92), id(94), id(93)] }],
  [
    id(10),
    {
      type: "sorting",
      groups: { [id(103)]: id(101), [id(104)]: id(101), [id(105)]: id(101) },
    },
  ],
  [id(14), { type: "written", text: "Because it rains." }],
];

const byId = (document: LessonDocument, blockId: string) =>
  document.blocks.find((block) => block.id === blockId) as CheckBlock;

/**
 * Marks, scores and exports of one quiz and its answers, written down once
 * before questions became one model shared with forms. Marking, drawing,
 * the student's view and the exports must read them the same since.
 */
describe("marks on the same answers", () => {
  // The quiz as its brief holds it, read back as marking reads it.
  const asked = quizOfBrief(
    contentOfLesson(quiz) ?? {
      root: { type: "root", version: 1, children: [] },
    },
  );

  it("reads the brief back as the quiz it was written as", () => {
    expect(asked.blocks.map((block) => block.type)).toEqual(
      quiz.blocks.map((block) => block.type),
    );
    expect(quizIssue(asked)).toBeNull();
    expect(
      asked.blocks.map(
        (block) => v.safeParse(lessonBlockSchema, block).success,
      ),
    ).toEqual(asked.blocks.map(() => true));
  });

  it("marks every answer as it did", () => {
    const marks = answers.map(([blockId, response]) => {
      const block = byId(asked, blockId);
      return {
        blockId,
        issue: responseIssue(block, v.parse(responseSchema, response)),
        mark: isAuto(block) ? markResponse(block, response) : null,
      };
    });
    expect(marks).toMatchSnapshot("marks");
  });

  it("scores the attempt and shows it as it did", () => {
    const fractions = Object.fromEntries(
      answers.map(([blockId, response]) => {
        const block = byId(asked, blockId);
        return [
          blockId,
          isAuto(block) ? markResponse(block, response).fraction : null,
        ];
      }),
    );
    expect(attemptScore(asked, fractions)).toMatchSnapshot("score");
    const stored = answers.map(([blockId, response]) => ({
      blockId,
      response: response as Record<string, unknown>,
      fraction: fractions[blockId] ?? null,
      state:
        fractions[blockId] === null
          ? ("needs_marking" as const)
          : ("marked" as const),
      feedback: null,
    }));
    expect(quizViews(asked, stored, "answers")).toMatchSnapshot("views");
    expect(studentQuiz(asked, "student:1", true, true)).toMatchSnapshot(
      "student quiz",
    );
  });

  it("draws a kept question as it did", () => {
    const draw = {
      id: id(200),
      type: "draw" as const,
      tag: "verbs",
      count: 1,
      points: 3,
    };
    const node = contentOfLesson({
      version: 2,
      blocks: quiz.blocks.slice(0, 1),
    })?.root.children?.find((child) => child.type === "question");
    const drawn = node ? drawnQuestion(draw, id(201), node) : null;
    expect(drawn).toMatchSnapshot("drawn");
    const attempt = attemptQuiz(
      { version: 2, blocks: [draw] },
      new Map([[draw.id, drawn ? [drawn] : []]]),
    );
    expect(attempt).toMatchSnapshot("attempt");
  });

  it("lets the lesson go to students as it did", () => {
    expect(
      lessonIssue({
        completion: "score",
        content: contentOfLesson(quiz) ?? {
          root: { type: "root", version: 1, children: [] },
        },
      }),
    ).toMatchSnapshot("lesson issue");
  });
});
