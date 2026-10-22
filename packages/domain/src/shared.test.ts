import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { ContentDocument, ContentNode } from "./content";

import { contentDocumentSchema } from "./content";
import { lessonOfContent } from "./lesson-content";
import { inlineShared, sharable, sharedIdsOf } from "./shared";
import { mapSectionBodies, newBlock, newSection } from "./site-sections";

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

const words = (document: ContentDocument) =>
  (document.root.children ?? []).map((node) =>
    (node.children ?? []).map((child) => child.text).join(""),
  );

describe("shared blocks written out in place", () => {
  const kit = crypto.randomUUID();
  const blocks = new Map([[kit, doc(paragraph("Bring water and a hat."))]]);

  it("puts each block's words where it stood, and drops one taken out", () => {
    const gone = crypto.randomUUID();
    const page = doc(shared(kit), shared(gone), paragraph("Before the trip."));
    expect(sharedIdsOf(page)).toEqual([kit, gone]);
    expect(words(inlineShared(page, blocks))).toEqual([
      "Bring water and a hat.",
      "Before the trip.",
    ]);
    const plain = doc(paragraph("Nothing shared."));
    expect(inlineShared(plain, blocks)).toBe(plain);
  });

  it("reaches the bodies in a website section's columns", () => {
    const section = newSection("blocks");
    const block = newBlock("paragraph");
    const page = {
      ...section,
      data: {
        ...section.data,
        columns: [
          {
            id: "column",
            blocks: [{ ...block, data: { body: doc(shared(kit)) } }],
          },
        ],
      },
    };
    const changed = mapSectionBodies(page, (body) =>
      inlineShared(body, blocks),
    );
    const [column] = (
      changed.data as {
        columns: { blocks: { data: { body: ContentDocument } }[] }[];
      }
    ).columns;
    const body = column?.blocks[0]?.data.body;
    if (!body) throw new Error("the paragraph lost its body");
    expect(words(body)).toEqual(["Bring water and a hat."]);
  });
});
