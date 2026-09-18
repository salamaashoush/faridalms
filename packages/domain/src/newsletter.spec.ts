import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  moveNewsletterBlock,
  newsletterAssetIds,
  newsletterDocumentSchema,
  newsletterPlainText,
} from "./newsletter";
import { plainTextDocument } from "./rich-text";

function fixture() {
  return v.parse(newsletterDocumentSchema, {
    version: 1,
    locale: "ar",
    sections: [
      {
        id: crypto.randomUUID(),
        tone: "plain",
        columns: [
          {
            id: crypto.randomUUID(),
            blocks: [
              {
                id: crypto.randomUUID(),
                type: "heading",
                text: "أخبار المدرسة",
                level: 2,
                alignment: "start",
              },
              {
                id: crypto.randomUUID(),
                type: "text",
                content: plainTextDocument("Salama classroom news"),
              },
            ],
          },
          {
            id: crypto.randomUUID(),
            blocks: [
              {
                id: crypto.randomUUID(),
                type: "image",
                assetId: crypto.randomUUID(),
                alt: "Class activity",
                caption: "Learning together",
              },
            ],
          },
        ],
      },
    ],
  });
}

describe("newsletter documents", () => {
  it("keeps reading order and exposes asset references separately", () => {
    const document = fixture();
    expect(newsletterPlainText(document)).toBe(
      "أخبار المدرسة\n\nSalama classroom news\n\nClass activity\nLearning together",
    );
    expect(newsletterAssetIds(document)).toHaveLength(1);
  });
  it("moves a block across columns without mutating its original document", () => {
    const document = fixture();
    const before = structuredClone(document);
    const [source, target] = document.sections[0]?.columns ?? [];
    const block = source?.blocks[0];
    if (!source || !target || !block) throw new Error("Missing fixture");
    const moved = moveNewsletterBlock(document, block.id, target.id, 1);
    expect(document).toEqual(before);
    expect(moved.sections[0]?.columns[0]?.blocks).toHaveLength(1);
    expect(moved.sections[0]?.columns[1]?.blocks[1]).toEqual(block);
    expect(v.safeParse(newsletterDocumentSchema, moved).success).toBe(true);
  });
  it("rejects duplicate identity and invalid moves", () => {
    const document = fixture();
    const first = document.sections[0];
    if (!first) throw new Error("Missing fixture");
    expect(
      v.safeParse(newsletterDocumentSchema, {
        ...document,
        sections: [first, first],
      }).success,
    ).toBe(false);
    expect(() =>
      moveNewsletterBlock(
        document,
        crypto.randomUUID(),
        crypto.randomUUID(),
        0,
      ),
    ).toThrow("newsletter.block_missing");
    const group = first.columns[0];
    const block = group?.blocks[0];
    if (!group || !block) throw new Error("Missing fixture");
    expect(() =>
      moveNewsletterBlock(document, block.id, group.id, 100),
    ).toThrow("newsletter.invalid_position");
  });
  it("rejects executable links and raw HTML blocks", () => {
    const document = fixture();
    const first = document.sections[0];
    const group = first?.columns[0];
    if (!first || !group) throw new Error("Missing fixture");
    const candidate = (block: unknown) => ({
      ...document,
      sections: [{ ...first, columns: [{ ...group, blocks: [block] }] }],
    });
    expect(
      v.safeParse(
        newsletterDocumentSchema,
        candidate({
          id: crypto.randomUUID(),
          type: "button",
          label: "Open",
          href: "javascript:alert(1)",
          alignment: "start",
        }),
      ).success,
    ).toBe(false);
    expect(
      v.safeParse(
        newsletterDocumentSchema,
        candidate({
          id: crypto.randomUUID(),
          type: "html",
          html: "<script>alert(1)</script>",
        }),
      ).success,
    ).toBe(false);
  });
});
