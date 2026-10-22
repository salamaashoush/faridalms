import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { ContentDocument, ContentNode } from "./content";

import { contentDocumentSchema } from "./content";
import { lessonOfContent } from "./lesson-content";
import { sharable } from "./shared";

const doc = (...children: ContentNode[]): ContentDocument => ({
  root: { type: "root", version: 1, children },
});
const paragraph = (text: string): ContentNode => ({
  type: "paragraph",
  version: 1,
  children: [{ type: "text", version: 1, text, format: 0 }],
});
const shared = (sharedId: string): ContentNode => ({
  type: "shared",
  version: 1,
  sharedId,
});

describe("shared blocks", () => {
  it("keeps words and pictures, never a question or another shared block", () => {
    expect(sharable(doc(paragraph("Wear goggles.")))).toBe(true);
    expect(sharable(doc())).toBe(false);
    expect(
      sharable(
        doc({
          type: "question",
          version: 1,
          kind: "choice",
          questionId: crypto.randomUUID(),
          children: [],
        }),
      ),
    ).toBe(false);
    expect(sharable(doc(shared(crypto.randomUUID())))).toBe(false);
  });

  it("stands at the top of a document, and a lesson reads it as part of its page", () => {
    const id = crypto.randomUUID();
    const page = doc(paragraph("Before."), shared(id));
    expect(v.safeParse(contentDocumentSchema, page).success).toBe(true);
    expect(
      v.safeParse(
        contentDocumentSchema,
        doc({ type: "quote", version: 1, children: [shared(id)] }),
      ).success,
    ).toBe(false);
    const [block] = lessonOfContent(page).blocks;
    expect(block?.type).toBe("content");
  });
});
