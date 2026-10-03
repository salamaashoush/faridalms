import { describe, expect, it } from "vitest";

import { plainContent } from "./content-conversion";
import { lessonSteps } from "./lesson-steps";

const text = (id: string, words: string) => ({
  id,
  type: "content",
  content: plainContent(words),
});
const question = (id: string) => ({ id, type: "choice" });

describe("a young child's lesson, one screen at a time", () => {
  it("ends a screen with each question and the words above it", () => {
    const steps = lessonSteps([
      text("a", "Look at the cat."),
      question("q1"),
      question("q2"),
      text("b", "Well done."),
    ]);
    expect(steps.map((step) => step.map((block) => block.id))).toEqual([
      ["a", "q1"],
      ["q2"],
      ["b"],
    ]);
  });

  it("keeps the questions a video stops for on the video's screen", () => {
    const steps = lessonSteps([
      text("v", "Watch the seed grow."),
      { id: "t1", type: "choice", videoAt: 8 },
      { id: "t2", type: "written", videoAt: 20 },
      question("after"),
    ]);
    expect(steps.map((step) => step.map((block) => block.id))).toEqual([
      ["v", "t1", "t2", "after"],
    ]);
  });

  it("leaves out text with nothing in it, such as the line after a question", () => {
    const steps = lessonSteps([question("q"), text("blank", "")]);
    expect(steps.map((step) => step.map((block) => block.id))).toEqual([["q"]]);
  });

  it("starts a new screen at a continue gate", () => {
    const steps = lessonSteps([
      text("a", "Page one."),
      { id: "g", type: "gate" },
      text("b", "Page two."),
    ]);
    expect(steps.map((step) => step.map((block) => block.id))).toEqual([
      ["a"],
      ["b"],
    ]);
  });

  it("turns the page at a divider inside the text", () => {
    const story = text("s", "Once upon a time.");
    const root = story.content.root;
    story.content = {
      root: {
        ...root,
        children: [
          ...(root.children ?? []),
          { type: "horizontalrule", version: 1 },
          ...(plainContent("The end.").root.children ?? []),
        ],
      },
    };
    const steps = lessonSteps([story, question("q")]);
    expect(steps.map((step) => step.map((block) => block.id))).toEqual([
      ["s"],
      ["s:1", "q"],
    ]);
  });
});
