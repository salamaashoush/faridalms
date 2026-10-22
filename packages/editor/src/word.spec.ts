import type { ContentDocument, ContentNode } from "@faridalms/domain/content";

import { contentDocumentSchema } from "@faridalms/domain/content";
import mammoth from "mammoth";
import { readFileSync } from "node:fs";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { buildContentEditor } from "./headless";
import { STORED_PICTURE } from "./nodes/media";
import { $placeWord } from "./plugins/word";

const FILE_ID = "0190a1b2-0000-7000-8000-0000000000c1";

async function readRivers() {
  const { value } = await mammoth.convertToHtml(
    // The page's address stands for the module here, so the file is found
    // from where the tests run.
    { buffer: readFileSync("packages/editor/fixtures/rivers.docx") },
    {
      idPrefix: "word-",
      externalFileAccess: false,
      convertImage: mammoth.images.imgElement(() =>
        Promise.resolve({ src: `${STORED_PICTURE}${FILE_ID}` }),
      ),
    },
  );
  return value;
}

function flat(node: ContentNode): ContentNode[] {
  return [node, ...(node.children ?? []).flatMap(flat)];
}

describe("a Word document brought in", () => {
  it("keeps its headings, words, tables, pictures and footnotes", async () => {
    const html = await readRivers();
    const editor = buildContentEditor();
    editor.update(() => $placeWord(editor, html), { discrete: true });
    const document = editor
      .getEditorState()
      .toJSON() as unknown as ContentDocument;
    const nodes = flat(document.root);
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    expect(nodes.find((node) => node.type === "heading")).toMatchObject({
      tag: "h1",
    });
    expect(
      nodes.find((node) => node.type === "text" && node.text === "longest"),
    ).toMatchObject({ format: 1 });
    expect(nodes.find((node) => node.type === "footnote")).toMatchObject({
      note: "Some measure the Amazon as longer.",
    });
    expect(nodes.some((node) => node.type === "table")).toBe(true);
    expect(nodes.find((node) => node.type === "image")).toMatchObject({
      fileId: FILE_ID,
      alt: "A river",
    });
    expect(
      nodes.some(
        (node) => node.type === "text" && node.text?.includes("النيل أطول"),
      ),
    ).toBe(true);
    // The notes' own list is not brought in beside them.
    expect(nodes.some((node) => node.type === "list")).toBe(false);
  });
});
