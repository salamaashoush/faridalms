import { describe, expect, it } from "vitest";

import type { ContentDocument, ContentNode } from "./content";

import { contentIssues } from "./content-checks";

const text = (value: string): ContentNode => ({
  type: "text",
  version: 1,
  text: value,
  format: 0,
});
const heading = (
  tag: "h1" | "h2" | "h3" | "h4",
  words: string,
): ContentNode => ({
  type: "heading",
  version: 1,
  tag,
  children: [text(words)],
});
const image = (alt: string, decorative = false): ContentNode => ({
  type: "image",
  version: 1,
  fileId: "0190a1b2-0000-7000-8000-000000000001",
  alt,
  ...(decorative ? { decorative } : {}),
});
const documentOf = (...children: ContentNode[]): ContentDocument => ({
  root: { type: "root", version: 1, children },
});

describe("checks before a document reaches readers", () => {
  it("passes headings in order and described or decorative pictures", () => {
    expect(
      contentIssues(
        documentOf(
          heading("h2", "Plants"),
          heading("h3", "Roots"),
          heading("h2", "Animals"),
          image("A frog on a leaf"),
          image("", true),
        ),
      ),
    ).toEqual([]);
  });

  it("names a heading that skips a level, counting the title as the first", () => {
    expect(contentIssues(documentOf(heading("h3", "Roots")))).toEqual([
      "order",
    ]);
    expect(
      contentIssues(documentOf(heading("h2", "Plants"), heading("h4", "Tip"))),
    ).toEqual(["order"]);
  });

  it("names a first-level heading, a picture left undescribed and a vague link", () => {
    const link: ContentNode = {
      type: "link",
      version: 1,
      url: "https://example.com",
      children: [text("click here")],
    };
    expect(
      contentIssues(
        documentOf(
          heading("h1", "Again"),
          { type: "callout", version: 1, children: [image("  ")] },
          { type: "paragraph", version: 1, children: [link] },
        ),
      ).toSorted(),
    ).toEqual(["alt", "heading", "link"]);
  });
});
