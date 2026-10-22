import { describe, expect, it } from "vitest";

import type { ContentDocument, ContentNode } from "./content";

import { holdsSuggestions } from "./content";
import { lessonIssue } from "./learning";
import { lessonOfContent } from "./lesson-content";
import { suggestedChecks } from "./suggest";

const run = (text: string, bold = false): ContentNode => ({
  type: "text",
  version: 1,
  text,
  format: bold ? 1 : 0,
});

const paragraph = (...children: ContentNode[]): ContentNode => ({
  type: "paragraph",
  version: 1,
  children,
});

const document = (...children: ContentNode[]): ContentDocument => ({
  root: { type: "root", version: 1, children },
});

describe("questions suggested from bold words", () => {
  const reading = document(
    paragraph(
      run("Plants make food by "),
      run("photosynthesis", true),
      run(". They need light."),
    ),
    paragraph(run("يأخذ النبات الماء من "), run("الجذور", true), run("؟ نعم.")),
  );

  it("makes a gap of each bold term in its sentence, after its block, held as suggested", () => {
    const found = suggestedChecks(reading, "Fill in the missing word.");
    expect(found.map((item) => item.after)).toEqual([0, 1]);
    expect(found.every((item) => item.node.suggested)).toBe(true);
    const [first, second] = lessonOfContent(
      document(...found.map((item) => item.node)),
    ).blocks;
    expect(first).toMatchObject({
      type: "gaps",
      prompt: "Fill in the missing word.",
      segments: [
        { type: "text", text: "Plants make food by " },
        { type: "gap", answers: ["photosynthesis"] },
        { type: "text", text: "." },
      ],
    });
    expect(second).toMatchObject({
      segments: [
        { type: "text", text: "يأخذ النبات الماء من " },
        { type: "gap", answers: ["الجذور"] },
        { type: "text", text: "؟" },
      ],
    });
  });

  it("leaves out a term a question already asks", () => {
    const [found] = suggestedChecks(reading, "Fill in.");
    if (!found) throw new Error("no suggestion");
    const asked = document(...(reading.root.children ?? []), {
      ...found.node,
      suggested: false,
    });
    expect(
      suggestedChecks(asked, "Fill in.").map((item) => item.after),
    ).toEqual([1]);
  });

  it("keeps a document with a suggestion from students until it is kept", () => {
    const [found] = suggestedChecks(reading, "Fill in.");
    if (!found) throw new Error("no suggestion");
    const held = document(...(reading.root.children ?? []), found.node);
    expect(holdsSuggestions(held)).toBe(true);
    expect(lessonIssue({ completion: "view", content: held })).toBe(
      "learning.unreviewed",
    );
    const kept = document(...(reading.root.children ?? []), {
      ...found.node,
      suggested: false,
    });
    expect(holdsSuggestions(kept)).toBe(false);
  });
});
