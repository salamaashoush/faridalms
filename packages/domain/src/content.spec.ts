import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  contentDocumentSchema,
  contentPlainText,
  validContentStyle,
} from "./content";
import { emptyContent, richTextToContent } from "./content-conversion";
import { plainTextDocument } from "./rich-text";

describe("shared content documents", () => {
  it("converts saved text and marks without discarding paragraph boundaries", () => {
    const document = richTextToContent({
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Salama",
                  marks: [
                    { type: "bold" },
                    { type: "link", attrs: { href: "https://example.com" } },
                  ],
                },
              ],
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: "Second paragraph" }],
            },
          ],
        },
      ],
    });
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    expect(contentPlainText(document)).toBe("Salama\nSecond paragraph");
    expect(JSON.stringify(document)).toContain('"format":1');
    expect(JSON.stringify(document)).toContain('"url":"https://example.com"');
  });
  it("accepts an empty editor and rejects unsupported or executable content", () => {
    expect(v.safeParse(contentDocumentSchema, emptyContent()).success).toBe(
      true,
    );
    const document = richTextToContent(plainTextDocument("Salama"));
    const paragraph = document.root.children?.[0];
    if (!paragraph) throw new Error("Missing fixture");
    for (const child of [
      { type: "iframe", version: 1, src: "https://example.com" },
      { type: "link", version: 1, children: [], url: "javascript:alert(1)" },
      {
        type: "text",
        version: 1,
        text: "Salama",
        format: 0,
        style: "background-image:url(https://example.com/tracker)",
      },
    ])
      expect(
        v.safeParse(contentDocumentSchema, {
          root: {
            ...document.root,
            children: [{ ...paragraph, children: [child] }],
          },
        }).success,
      ).toBe(false);
  });
  it("validates hierarchy and bounds recursion before recursive parsing", () => {
    const document = emptyContent();
    expect(
      v.safeParse(contentDocumentSchema, {
        root: {
          ...document.root,
          children: [
            {
              type: "table",
              version: 1,
              children: [
                { type: "text", version: 1, text: "invalid cell", format: 0 },
              ],
            },
          ],
        },
      }).success,
    ).toBe(false);
    const loop: Record<string, unknown> = { type: "quote", version: 1 };
    loop.children = [loop];
    expect(
      v.safeParse(contentDocumentSchema, {
        root: { ...document.root, children: [loop] },
      }).success,
    ).toBe(false);
  });
  it("allows only presentation styles that can be safely rendered", () => {
    expect(
      validContentStyle(
        "color:#123456;background-color:#fef08a;font-size:18px;font-family:Georgia",
      ),
    ).toBe(true);
    expect(validContentStyle("position:fixed;inset:0")).toBe(false);
    expect(validContentStyle("color:expression(alert(1))")).toBe(false);
  });
});
