import type { LessonBlock } from "@faridalms/domain/learning";

import { studentBlocks } from "@faridalms/domain/learning";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { paperBlock } from "./paper-blocks";
import { keyOf, letterOf, PaperQuestion, writingLines } from "./PaperQuestion";

const base = { points: 1, hint: "", explanation: "", tries: null };
const fileUrl = (fileId: string) => `/files/${fileId}`;
const paper = (block: LessonBlock, answers: boolean, rtl = false) =>
  renderToStaticMarkup(
    <PaperQuestion
      block={block}
      number={3}
      answers={answers}
      rtl={rtl}
      fileUrl={fileUrl}
    />,
  );

const choice: LessonBlock = {
  ...base,
  id: "q1",
  type: "choice",
  prompt: "Which planet is red?",
  options: [
    { id: "a", text: "Mars", feedback: "" },
    { id: "b", text: "Venus", feedback: "" },
  ],
  correctOptionIds: ["a"],
  multiple: false,
  shuffle: true,
};

describe("a question on paper", () => {
  it("letters its options in the document's own script", () => {
    expect([0, 1, 2].map((index) => letterOf(index, false))).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect([0, 1, 2].map((index) => letterOf(index, true))).toEqual([
      "أ",
      "ب",
      "ج",
    ]);
  });

  it("rules about a line for every eight words a written answer allows", () => {
    expect(writingLines(null)).toBe(6);
    expect(writingLines(80)).toBe(10);
    expect(writingLines(5)).toBe(3);
    expect(writingLines(5000)).toBe(20);
  });

  it("leaves a drawing answer a framed space, named in the paper's language", () => {
    const drawing: LessonBlock = {
      ...base,
      id: "q9",
      type: "written",
      prompt: "Draw the story's setting.",
      wordLimit: null,
      answerWith: "drawing",
    };
    expect(paper(drawing, false)).toContain("Draw your answer here");
    expect(paper(drawing, false, true)).toContain("ارسم إجابتك هنا");
    expect(paper({ ...drawing, answerWith: "photo" }, false)).toContain(
      "Draw or stick a picture here",
    );
  });

  it("keeps the author's order and never shows the key on a student's copy", () => {
    const html = paper(choice, false);
    expect(html).toContain("3.");
    expect(html.indexOf("Mars")).toBeLessThan(html.indexOf("Venus"));
    expect(html).not.toContain("bg-neutral-500");
  });

  it("fills in each answer on a teacher's copy", () => {
    expect(paper(choice, true)).toContain("bg-neutral-500");
    const typed = paper(
      {
        ...base,
        id: "q2",
        type: "text",
        prompt: "Capital of Egypt?",
        answers: ["Cairo"],
        caseSensitive: false,
        closeEnough: false,
        tehMarbuta: true,
      },
      true,
    );
    expect(typed).toContain("Cairo");
    const ordering = paper(
      {
        ...base,
        id: "q3",
        type: "ordering",
        prompt: "Order the day.",
        scoring: "all",
        items: [
          { id: "i1", text: "Wake up" },
          { id: "i2", text: "Eat" },
        ],
      },
      true,
    );
    const item = (text: string) =>
      ordering.split("<li").find((chunk) => chunk.includes(text)) ?? "";
    expect(item("Wake up")).toContain(">1<");
    expect(item("Eat")).toContain(">2<");
  });
});

const matching: LessonBlock = {
  ...base,
  id: "q4",
  type: "matching",
  prompt: "Match each animal to its home.",
  pairs: [
    { id: "p1", prompt: "Bee", answer: "Hive" },
    { id: "p2", prompt: "Bird", answer: "Nest" },
  ],
  distractors: [{ id: "d1", text: "Burrow" }],
};

describe("an answer key", () => {
  it("names each answer in the letters and numbers its paper shows", () => {
    expect(keyOf(choice, false)).toBe("a");
    const html = paper(matching, true);
    const key = keyOf(matching, false) ?? "";
    // The key's letter for each prompt is the one printed beside its answer.
    for (const [index, answer] of [
      [1, "Hive"],
      [2, "Nest"],
    ] as const) {
      const letter = /(\d) ([^\s,،]+)/g;
      const found = [...key.matchAll(letter)].find(
        (match) => Number(match[1]) === index,
      )?.[2];
      expect(html).toContain(`${found})</span>`);
      const chunk = html
        .split("<li")
        .find((part) => part.includes(`>${found})<`));
      expect(chunk).toContain(answer);
    }
  });

  it("leaves to the teacher what only a teacher can judge", () => {
    expect(
      keyOf(
        {
          ...base,
          id: "q5",
          type: "written",
          prompt: "Describe your weekend.",
          wordLimit: null,
        },
        false,
      ),
    ).toBeNull();
  });
});

const puzzle: LessonBlock = {
  ...base,
  id: "q5",
  type: "parsons",
  prompt: "Say hello twice.",
  language: "python",
  lines: [
    { id: "l1", code: "for n in range(2):", indent: 0 },
    { id: "l2", code: 'print("hello")', indent: 1 },
  ],
  distractors: [{ id: "l3", code: "print hello" }],
};

const lineOf = (markup: string, code: string) =>
  markup.split("<li").find((chunk) => chunk.includes(code)) ?? "";

describe("a code puzzle on paper", () => {
  it("numbers the program's lines on a teacher's copy and dashes the rest", () => {
    const key = paper(puzzle, true);
    expect(lineOf(key, "for n in range(2):")).toContain(">1<");
    expect(lineOf(key, "print(&quot;hello&quot;)")).toContain(">2<");
    expect(lineOf(key, "print hello")).toContain(">–<");
    expect(paper(puzzle, false)).not.toMatch(/>[12–]</);
  });

  it("prints a student's lines without saying which belong", () => {
    const [student] = studentBlocks({ version: 2, blocks: [puzzle] }, "s");
    if (!student) throw new Error("no block");
    const block = paperBlock(student);
    if (block.type !== "parsons") throw new Error("not parsons");
    expect(block.distractors).toEqual([]);
    expect(block.lines.map((line) => line.code).toSorted()).toEqual(
      ['print("hello")', "for n in range(2):", "print hello"].toSorted(),
    );
    expect(block.lines.every((line) => line.indent === 0)).toBe(true);
  });
});

describe("a student's copy of a lesson", () => {
  it("prints from what the student received, with no key to give away", () => {
    const [student] = studentBlocks(
      { version: 2, blocks: [choice, matching] },
      "student",
    );
    if (!student) throw new Error("no block");
    const block = paperBlock(student);
    expect(block.type === "choice" && block.correctOptionIds).toEqual([]);
    expect(paper(block, false)).toContain("Mars");
  });

  it("rebuilds a matching question's two columns from its prompts and choices", () => {
    const student = studentBlocks({ version: 2, blocks: [matching] }, "s")[0];
    if (!student) throw new Error("no block");
    const block = paperBlock(student);
    if (block.type !== "matching") throw new Error("not matching");
    expect(block.pairs.map((pair) => [pair.prompt, pair.answer])).toEqual([
      ["Bee", "Hive"],
      ["Bird", "Nest"],
    ]);
    expect(block.distractors.map((extra) => extra.text)).toEqual(["Burrow"]);
  });
});
