import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { ContentDocument, ContentNode } from "./content";

import {
  contentDocumentSchema,
  contentFileIds,
  contentPlainText,
  validContentStyle,
  textDirection,
} from "./content";
import { emptyContent, richTextToContent } from "./content-conversion";
import { plainTextDocument } from "./rich-text";

const listItem = (text: string) => ({
  type: "listItem" as const,
  content: [
    {
      type: "paragraph" as const,
      content: [{ type: "text" as const, text }],
    },
  ],
});

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
  it("numbers a list's items as the editor counts them", () => {
    const document = richTextToContent({
      type: "doc",
      content: [
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [listItem("Third"), listItem("Fourth")],
        },
      ],
    });
    expect(
      document.root.children?.[0]?.children?.map((child) => child.value),
    ).toEqual([3, 4]);
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

const text = (value: string) => ({
  type: "text" as const,
  version: 1 as const,
  text: value,
  format: 0,
});
const paragraph = (value: string) => ({
  type: "paragraph" as const,
  version: 1 as const,
  format: "" as const,
  children: [text(value)],
});
const documentOf = (...children: ContentNode[]): ContentDocument => ({
  root: { type: "root", version: 1, format: "", children },
});
const fileId = "7f1c2e0a-4b7d-4c2e-9f51-2a0e8c9d1b34";
const sceneId = "0b8f6c1e-2d4a-4f3b-8e7a-5c9d1e2f3a4b";

describe("block content", () => {
  it("accepts callouts, toggles, columns and media with stable block ids", () => {
    const document = documentOf(
      {
        type: "callout",
        version: 1,
        format: "",
        tone: "warning",
        $: { id: "k3j9x0a1b2c3" },
        children: [paragraph("Pickup moves to 2:30 for Salama.")],
      },
      {
        type: "toggle",
        version: 1,
        format: "",
        open: false,
        children: [
          {
            type: "toggle-title",
            version: 1,
            format: "",
            children: [text("Uniform")],
          },
          {
            type: "toggle-content",
            version: 1,
            format: "",
            children: [paragraph("Sports kit on Mondays.")],
          },
        ],
      },
      {
        type: "columns",
        version: 1,
        format: "",
        layout: "1:2",
        children: [
          {
            type: "column",
            version: 1,
            format: "",
            children: [paragraph("Left")],
          },
          {
            type: "column",
            version: 1,
            format: "",
            children: [paragraph("Right")],
          },
        ],
      },
      {
        type: "image",
        version: 1,
        format: "",
        fileId,
        alt: "Class trip",
        caption: "Trip",
        size: "large",
      },
      {
        type: "media",
        version: 1,
        format: "",
        fileId,
        mime: "video/mp4",
        captionsFileId: sceneId,
        caption: "Lesson",
      },
      {
        type: "embed",
        version: 1,
        format: "",
        provider: "youtube",
        embedId: "dQw4w9WgXcQ",
        caption: "",
      },
      {
        type: "diagram",
        version: 1,
        format: "",
        fileId,
        sceneFileId: sceneId,
        caption: "Water cycle",
        size: "full",
      },
      {
        type: "file",
        version: 1,
        format: "",
        fileId,
        name: "worksheet.pdf",
        mime: "application/pdf",
        bytes: 2048,
      },
    );
    const result = v.safeParse(contentDocumentSchema, document);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.output.root.children?.[0]?.$?.id).toBe("k3j9x0a1b2c3");
    expect(contentFileIds(result.output).toSorted()).toEqual(
      [fileId, sceneId].toSorted(),
    );
    expect(contentPlainText(result.output)).toBe(
      [
        "Pickup moves to 2:30 for Salama.",
        "Uniform\nSports kit on Mondays.",
        "Left\nRight",
        "Trip",
        "Lesson",
        "",
        "Water cycle",
        "worksheet.pdf",
      ].join("\n"),
    );
  });

  it("refuses structures the editor cannot represent", () => {
    const nested = documentOf({
      type: "columns",
      version: 1,
      format: "",
      layout: "1:1",
      children: [
        {
          type: "column",
          version: 1,
          format: "",
          children: [
            {
              type: "columns",
              version: 1,
              format: "",
              layout: "1:1",
              children: [
                {
                  type: "column",
                  version: 1,
                  format: "",
                  children: [paragraph("a")],
                },
                {
                  type: "column",
                  version: 1,
                  format: "",
                  children: [paragraph("b")],
                },
              ],
            },
          ],
        },
        { type: "column", version: 1, format: "", children: [paragraph("c")] },
      ],
    });
    const brokenToggle = documentOf({
      type: "toggle",
      version: 1,
      format: "",
      open: true,
      children: [paragraph("no title")],
    });
    const calloutInCallout = documentOf({
      type: "callout",
      version: 1,
      format: "",
      tone: "info",
      children: [
        {
          type: "callout",
          version: 1,
          format: "",
          tone: "info",
          children: [paragraph("x")],
        },
      ],
    });
    const badEmbed = documentOf({
      type: "embed",
      version: 1,
      format: "",
      provider: "youtube",
      embedId: "https://evil.example/",
      caption: "",
    });
    const scriptMedia = documentOf({
      type: "media",
      version: 1,
      format: "",
      fileId,
      mime: "text/html",
      caption: "",
    });
    const badBlockId = documentOf({ ...paragraph("x"), $: { id: "<script>" } });
    for (const document of [
      nested,
      brokenToggle,
      calloutInCallout,
      badEmbed,
      scriptMedia,
      badBlockId,
    ])
      expect(v.safeParse(contentDocumentSchema, document).success).toBe(false);
  });
});

describe("audio description", () => {
  it("is kept with a video, and its words are read as the document's", () => {
    const video: ContentDocument = {
      root: {
        type: "root",
        version: 1,
        children: [
          {
            type: "media",
            version: 1,
            fileId: "0190a1b2-0000-7000-8000-0000000000d1",
            mime: "video/mp4",
            caption: "The Nile",
            descriptions: "0:12 A map of Egypt\n1:05 Farmers lift water",
          },
        ],
      },
    };
    expect(v.safeParse(contentDocumentSchema, video).success).toBe(true);
    expect(contentPlainText(video)).toBe(
      "The Nile\nA map of Egypt\nFarmers lift water",
    );
  });
});

describe("page breaks", () => {
  it("stand between the blocks of a document, never inside one", () => {
    const pageBreak = { type: "pagebreak", version: 1 } as ContentNode;
    expect(
      v.safeParse(
        contentDocumentSchema,
        documentOf(paragraph("Part one"), pageBreak, paragraph("Part two")),
      ).success,
    ).toBe(true);
    expect(
      v.safeParse(
        contentDocumentSchema,
        documentOf({
          type: "callout",
          version: 1,
          format: "",
          tone: "info",
          children: [paragraph("Inside"), pageBreak],
        }),
      ).success,
    ).toBe(false);
    expect(
      contentPlainText(documentOf(paragraph("A"), pageBreak, paragraph("B"))),
    ).not.toContain("pagebreak");
  });
});

describe("text direction", () => {
  it("reads the first letter, not digits or punctuation", () => {
    expect(textDirection("12. قراءة الفصل")).toBe("rtl");
    expect(textDirection("— Term planning, 2026")).toBe("ltr");
    expect(textDirection("Staff meeting في المكتبة")).toBe("ltr");
    expect(textDirection("2026 - 10:30")).toBeNull();
    expect(textDirection("")).toBeNull();
  });
});
