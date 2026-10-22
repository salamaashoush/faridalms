import type { ContentDocument, ContentNode } from "@faridalms/domain/content";

import {
  contentDocumentSchema,
  contentPlainText,
} from "@faridalms/domain/content";
import { renderToStaticMarkup } from "react-dom/server";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { ViewStrings } from "./view";

import { buildContentEditor } from "./headless";
import { ContentRenderer } from "./view";

const lesson = "0190a1b2-0000-7000-8000-0000000000b1";
const person = "0190a1b2-0000-7000-8000-0000000000b2";

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
          text("Ask "),
          {
            type: "mention",
            version: 1,
            mention: { kind: "person", id: person, label: "Sara Ali" },
          },
          text(" about "),
          {
            type: "mention",
            version: 1,
            mention: { kind: "lesson", id: lesson, label: "Rivers" },
          },
        ],
      },
    ],
  },
};

function named(mention: unknown, inParagraph = true): ContentDocument {
  const node = { type: "mention", version: 1, mention } as ContentNode;
  return {
    root: {
      type: "root",
      version: 1,
      children: inParagraph
        ? [{ type: "paragraph", version: 1, children: [node] }]
        : [node],
    },
  };
}

const valid = (doc: ContentDocument) =>
  v.safeParse(contentDocumentSchema, doc).success;

describe("mentions", () => {
  it("name a person or a lesson in running text, read by their names", () => {
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    expect(contentPlainText(document)).toBe("Ask @Sara Ali about @Rivers");
  });

  it("open what they name where the reader is told where, and are only a name otherwise", () => {
    const html = renderToStaticMarkup(
      <ContentRenderer
        document={document}
        strings={{} as ViewStrings}
        mentionHref={(mention) =>
          mention.kind === "lesson" ? `/lessons/${mention.id}` : null
        }
      />,
    );
    expect(html).toContain(`href="/lessons/${lesson}"`);
    expect(html).toContain(
      '<span class="fe-mention" dir="auto">@Sara Ali</span>',
    );
  });

  it("come back from the editor as they went in", () => {
    const editor = buildContentEditor();
    editor.setEditorState(editor.parseEditorState(JSON.stringify(document)));
    const exported = editor
      .getEditorState()
      .toJSON() as unknown as ContentDocument;
    expect(
      exported.root.children?.[0]?.children
        ?.filter((child) => child.type === "mention")
        .map((child) => child.mention?.label),
    ).toEqual(["Sara Ali", "Rivers"]);
  });

  it("stand only in running text and name only what a school holds", () => {
    expect(valid(named({ kind: "lesson", id: lesson, label: "Rivers" }))).toBe(
      true,
    );
    expect(
      valid(named({ kind: "lesson", id: lesson, label: "Rivers" }, false)),
    ).toBe(false);
    expect(valid(named({ kind: "parent", id: person, label: "Sara" }))).toBe(
      false,
    );
    expect(valid(named({ kind: "person", id: "sara", label: "Sara" }))).toBe(
      false,
    );
    expect(valid(named({ kind: "person", id: person, label: "" }))).toBe(false);
    expect(valid(named(undefined))).toBe(false);
  });
});
