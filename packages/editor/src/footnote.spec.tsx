import type { ContentDocument, ContentNode } from "@faridalms/domain/content";
import type { LexicalEditor } from "lexical";

import { partsNotesBefore } from "@faridalms/domain/bibliography";
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
import { ContentRenderer, WholeDocumentProvider } from "./view";

const strings = {
  footnotes: "Notes",
  footnoteRef: (number: number) => `Footnote ${number}`,
  footnoteBack: (number: number) => `Back to footnote ${number}`,
  referencesApa: "References",
  referencesMla: "Works Cited",
  referencesChicago: "Bibliography",
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

const noted = (...children: ContentNode[]): ContentDocument => ({
  root: {
    type: "root",
    version: 1,
    children: [{ type: "paragraph", version: 1, children }],
  },
});

describe("footnotes in a lesson's parts", () => {
  it("number on from one part to the next, as on one page", () => {
    const first = noted(text("Rivers."), {
      type: "footnote",
      version: 1,
      note: "One.",
    });
    const second = noted(text("Deltas."), {
      type: "footnote",
      version: 1,
      note: "Two.",
    });
    const parts = [
      { type: "content", content: first },
      { type: "choice" },
      { type: "content", content: second },
    ];
    const html = renderToStaticMarkup(
      <WholeDocumentProvider
        value={{ terms: [], notesBefore: partsNotesBefore(parts) }}
      >
        <ContentRenderer document={first} strings={strings} />
        <ContentRenderer document={second} strings={strings} />
      </WholeDocumentProvider>,
    );
    expect(html).toContain('aria-label="Footnote 1"');
    expect(html).toContain('aria-label="Footnote 2"');
    expect(html).toContain('<ol start="2">');
  });
});

describe("a bibliography", () => {
  it("lists each source the footnotes cite once, by author, named by their style", () => {
    const cited = document.root.children?.[0]?.children?.[3];
    if (!cited?.source) throw new Error("the document cites nothing");
    const page = {
      ...document,
      root: {
        ...document.root,
        children: [
          ...(document.root.children ?? []),
          ...(noted(
            text("Again."),
            { ...cited, source: { ...cited.source, pages: "12" } },
            text("And."),
            {
              type: "footnote",
              version: 1,
              note: "",
              source: {
                ...cited.source,
                authors: "Adams, Jo",
                title: "Deltas",
              },
            },
          ).root.children ?? []),
          { type: "bibliography", version: 1 },
        ],
      },
    } satisfies ContentDocument;
    expect(v.safeParse(contentDocumentSchema, page).success).toBe(true);
    const html = renderToStaticMarkup(
      <ContentRenderer document={page} strings={strings} />,
    );
    const start = html.indexOf("fe-bibliography-block");
    const list = html.slice(start, html.indexOf("</section>", start));
    expect(list).toContain("References");
    expect(list.match(/<li /g)).toHaveLength(2);
    expect(list.indexOf("Adams")).toBeLessThan(list.indexOf("Ali"));
  });
});
