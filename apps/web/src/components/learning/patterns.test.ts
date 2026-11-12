import type { LessonBlock } from "@faridalms/domain/learning";

import { lessonIssue, markResponse } from "@faridalms/domain/learning";
import {
  contentOfLesson,
  lessonOfContent,
} from "@faridalms/domain/lesson-content";
import { describe, expect, it } from "vitest";

import { sayIn } from "~/components/content/starters";

import { PATTERNS } from "./patterns";

describe("teaching patterns", () => {
  for (const pattern of PATTERNS)
    for (const locale of ["en", "ar"] as const)
      it(`${pattern.key} in ${locale} is a lesson ready to show, kept whole by the editor`, () => {
        const blocks = pattern.blocks(sayIn(locale));
        const content = contentOfLesson({ version: 2, blocks });
        expect(content).not.toBeNull();
        if (!content) return;
        expect(lessonIssue({ completion: "view", content })).toBeNull();
        expect(
          lessonOfContent(content).blocks.map((block) => block.type),
        ).toEqual(blocks.map((block) => block.type));
      });

  it("asks for the numbers its own steps give", () => {
    const [worked] = PATTERNS;
    const numbers = (worked?.blocks(sayIn("en")) ?? []).filter(
      (block): block is Extract<LessonBlock, { type: "number" }> =>
        block.type === "number",
    );
    expect(numbers.map((block) => block.value)).toEqual([80 - 8, 120 - 30]);
    for (const block of numbers)
      expect(
        markResponse(block, { type: "number", text: String(block.value) }),
      ).toMatchObject({ correct: true });
  });
});
