import type { LessonBlock } from "@faridalms/domain/learning";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { letterOf, PaperQuestion, writingLines } from "./PaperQuestion";

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
