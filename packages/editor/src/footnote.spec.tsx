import type { ContentDocument, ContentNode } from "@faridalms/domain/content";
import type { LexicalEditor } from "lexical";

import {
  contentDocumentSchema,
  contentPlainText,
} from "@faridalms/domain/content";
import { $createParagraphNode, $createTextNode, $getRoot } from "lexical";
import { renderToStaticMarkup } from "react-dom/server";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { ViewStrings } from "./view";

import { buildContentEditor } from "./headless";
import { $insertFootnote, $isFootnoteNode } from "./nodes";
import { ContentRenderer } from "./view";

const strings = {
  footnotes: "Notes",
  footnoteRef: (number: number) => `Footnote ${number}`,
  footnoteBack: (number: number) => `Back to footnote ${number}`,
} as ViewStrings;

const text = (words: string): ContentNode => ({
  type: "text",
  version: 1,
  text: words,
  format: 0,
});

const document: ContentDocument = {
  root: {
    type: "root",
    version: 1,
    children: [
      {
        type: "paragraph",
        version: 1,
        children: [
          text("Rivers carve deltas."),
          { type: "footnote", version: 1, note: "See the map on page 4." },
          text(" Deltas feed millions."),
          {
            type: "footnote",
            version: 1,
            note: "",
            source: {
              kind: "book",
              style: "apa",
              authors: "Ali, Sara",
              title: "Rivers of the world",
              container: "Example Press",
              date: "2021",
              volume: "",
              issue: "",
              pages: "",
              url: "",
            },
          },
        ],
      },
    ],
  },
};

describe("footnotes", () => {
  it("stand in running text, and stay out of its plain words", () => {
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    expect(contentPlainText(document)).toBe(
      "Rivers carve deltas. Deltas feed millions.",
    );
  });

  it("are numbered where they stand and listed below the text, a source in its style", () => {
    const html = renderToStaticMarkup(
      <ContentRenderer document={document} strings={strings} />,
    );
    expect(html.match(/class="fe-footnote-ref"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="Notes"');
    expect(html).toContain("See the map on page 4.");
    expect(html).toContain("<i>Rivers of the world</i>");
    expect(html).toContain('aria-label="Back to footnote 2"');
  });

  it("are added at the caret and chosen, so their words are written next", () => {
    const editor: LexicalEditor = buildContentEditor();
    editor.update(
      () => {
        const paragraph = $createParagraphNode().append(
          $createTextNode("Deltas"),
        );
        $getRoot().clear().append(paragraph);
        paragraph.selectEnd();
        $insertFootnote()?.setNote("A note.");
      },
      { discrete: true },
    );
    const exported = editor
      .getEditorState()
      .toJSON() as unknown as ContentDocument;
    const line = exported.root.children?.[0]?.children ?? [];
    expect(line.map((child) => child.type)).toEqual(["text", "footnote"]);
    expect(line[1]?.note).toBe("A note.");
    expect(
      editor
        .getEditorState()
        .read(() => $getRoot().getFirstDescendant()?.getNextSibling()),
    ).toSatisfy($isFootnoteNode);
  });
});
