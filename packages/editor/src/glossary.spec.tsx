import type { ContentDocument, ContentNode } from "@faridalms/domain/content";
import type { ElementNode, LexicalEditor } from "lexical";

import {
  contentDocumentSchema,
  contentPlainText,
} from "@faridalms/domain/content";
import { documentTerms, glossaryOf } from "@faridalms/domain/glossary";
import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $parseSerializedNode,
  $setSelection,
} from "lexical";
import { renderToStaticMarkup } from "react-dom/server";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { ViewStrings } from "./view";

import { buildContentEditor } from "./headless";
import {
  $defineSelection,
  $glossaryEntries,
  $glossaryFlashCards,
  $glossaryMatching,
} from "./nodes";
import { ContentRenderer } from "./view";

const strings = { glossary: "Glossary", fileRemoved: "Removed" } as ViewStrings;

const text = (words: string): ContentNode => ({
  type: "text",
  version: 1,
  text: words,
  format: 0,
});

const term = (
  words: string,
  definition: string,
  more: Partial<ContentNode> = {},
): ContentNode => ({
  type: "term",
  version: 1,
  definition,
  children: [text(words)],
  ...more,
});

const line = (...children: ContentNode[]): ContentNode => ({
  type: "paragraph",
  version: 1,
  children,
});

const document: ContentDocument = {
  root: {
    type: "root",
    version: 1,
    children: [
      line(
        text("Plants make food by "),
        term("photosynthesis", "Making sugar from light, water and air", {
          gloss: "التمثيل الضوئي",
        }),
        text(" in their "),
        term("Chlorophyll", "The green colouring in leaves"),
        text("."),
      ),
      line(
        text("Again: "),
        term("Photosynthesis", "A second, later definition"),
        text(" and "),
        term("stomata", ""),
      ),
      { type: "glossary", version: 1 },
    ],
  },
};

const valid = (doc: ContentDocument) =>
  v.safeParse(contentDocumentSchema, doc).success;

function wrapped(child: ContentNode): ContentDocument {
  return { root: { type: "root", version: 1, children: [line(child)] } };
}

/** Selects part of a line's words, as a teacher's drag does. */
function $selectWords(paragraph: ElementNode, from: number, to: number) {
  const words = paragraph.getFirstChild();
  if (!words) return;
  const selection = $createRangeSelection();
  selection.anchor.set(words.getKey(), from, "text");
  selection.focus.set(words.getKey(), to, "text");
  $setSelection(selection);
}

describe("glossary terms", () => {
  it("stand in running text as its words, and only as words", () => {
    expect(valid(document)).toBe(true);
    expect(contentPlainText(document)).toContain(
      "Plants make food by photosynthesis in their Chlorophyll.",
    );
    expect(
      valid(
        wrapped({
          type: "link",
          version: 1,
          url: "https://example.com",
          children: [term("leaf", "A leaf")],
        }),
      ),
    ).toBe(false);
    expect(
      valid(
        wrapped({
          type: "term",
          version: 1,
          definition: "Inside",
          children: [term("leaf", "A leaf")],
        }),
      ),
    ).toBe(false);
    expect(
      valid(
        wrapped({ type: "term", version: 1, children: [text("no meaning")] }),
      ),
    ).toBe(false);
  });

  it("gather into a glossary once each, defined where first defined, in alphabetical order", () => {
    expect(
      glossaryOf(documentTerms(document), "en").map((entry) => [
        entry.words,
        entry.definition,
      ]),
    ).toEqual([
      ["Chlorophyll", "The green colouring in leaves"],
      ["photosynthesis", "Making sugar from light, water and air"],
    ]);
    const arabic = glossaryOf(
      [
        { words: "مُحَمَّد", definition: "اسم" },
        { words: "محمد", definition: "تعريف آخر" },
        { words: "أسد", definition: "حيوان" },
      ],
      "ar",
    );
    expect(arabic.map((entry) => entry.definition)).toEqual(["حيوان", "اسم"]);
  });

  it("open in place to what they mean, and list in the glossary block", () => {
    const html = renderToStaticMarkup(
      <ContentRenderer document={document} strings={strings} />,
    );
    expect(html.match(/class="fe-term"/g)).toHaveLength(3);
    expect(html).toContain(
      '<section aria-label="Glossary" class="fe-glossary">',
    );
    expect(html).toContain("التمثيل الضوئي");
    expect(html.indexOf("The green colouring")).toBeLessThan(
      html.indexOf("Making sugar"),
    );
    // A term not yet defined reads as plain words.
    expect(html).toContain(
      '<span data-fe-text=""> and </span><span data-fe-text="">stomata</span></p>',
    );
  });

  it("are made from the words chosen, without their spaces, starting from an earlier definition", () => {
    const editor: LexicalEditor = buildContentEditor();
    editor.update(
      () => {
        const first = $createParagraphNode().append(
          $createTextNode("Leaves hold chlorophyll."),
        );
        const second = $createParagraphNode().append(
          $createTextNode("Green chlorophyll again."),
        );
        $getRoot().clear().append(first, second);
        $selectWords(first, 11, 23);
        $defineSelection()?.setFacts({ definition: "Green colouring" });
        $selectWords(second, 5, 17);
        $defineSelection();
      },
      { discrete: true },
    );
    const exported = editor
      .getEditorState()
      .toJSON() as unknown as ContentDocument;
    const terms = documentTerms(exported);
    expect(terms.map((entry) => [entry.words, entry.definition])).toEqual([
      ["chlorophyll", "Green colouring"],
      ["chlorophyll", "Green colouring"],
    ]);
    expect(exported.root.children?.[0]?.children?.[0]?.text).toBe(
      "Leaves hold ",
    );
    expect(valid(exported)).toBe(true);
  });
});

describe("a glossary turned into practice", () => {
  /** The document's glossary made into cards and questions, as its block's menu does. */
  function practised(): ContentDocument {
    const editor = buildContentEditor();
    editor.update(
      () => {
        $getRoot().clear();
        for (const node of document.root.children ?? [])
          $getRoot().append($parseSerializedNode(node));
        const entries = $glossaryEntries("en");
        $getRoot().append(
          ...$glossaryFlashCards(entries),
          ...$glossaryMatching(entries, "Match each word to its meaning."),
        );
      },
      { discrete: true },
    );
    return editor.getEditorState().toJSON() as unknown as ContentDocument;
  }

  it("makes a card for each word, its meaning and other-language word behind it", () => {
    const made = practised();
    expect(valid(made)).toBe(true);
    const cards = made.root.children?.find((node) => node.type === "panels");
    expect(cards?.layout).toBe("cards");
    expect(
      contentPlainText({
        root: { type: "root", version: 1, children: cards ? [cards] : [] },
      }),
    ).toContain("Chlorophyll");
    expect(cards?.children).toHaveLength(2);
    expect(JSON.stringify(cards)).toContain("التمثيل الضوئي");
  });

  it("asks a matching question pairing each word with its meaning", () => {
    const question = practised().root.children?.find(
      (node) => node.type === "question",
    );
    expect(question?.kind).toBe("matching");
    expect(
      (question?.children ?? []).filter(
        (part) => part.type === "question-pair",
      ),
    ).toHaveLength(2);
    expect(JSON.stringify(question)).toContain("The green colouring in leaves");
  });

  it("offers each word read aloud, where the page can read it", () => {
    const html = renderToStaticMarkup(
      <ContentRenderer
        document={document}
        strings={strings}
        speaker={(words) => <button type="button">Say {words}</button>}
      />,
    );
    expect(html).toContain("Say photosynthesis");
    expect(html).toContain("Say Chlorophyll");
  });
});
