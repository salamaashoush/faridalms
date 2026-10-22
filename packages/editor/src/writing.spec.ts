import type { LexicalEditor } from "lexical";

import { TEXT_SIZES, validContentStyle } from "@faridalms/domain/content";
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isTextNode,
} from "lexical";
import { describe, expect, it } from "vitest";

import { $applyTextSize, $clearFormatting } from "./formatting";
import { buildContentEditor } from "./headless";
import { $findInDocument, $replaceFound } from "./plugins/find";

/** A document of one line, its pieces written each with their own marks. */
function line(...pieces: [text: string, format?: number][]): LexicalEditor {
  const editor = buildContentEditor();
  editor.update(
    () => {
      const paragraph = $createParagraphNode();
      for (const [text, format = 0] of pieces)
        paragraph.append($createTextNode(text).setFormat(format));
      $getRoot().clear().append(paragraph);
    },
    { discrete: true },
  );
  return editor;
}

const text = (editor: LexicalEditor) =>
  editor.getEditorState().read(() => $getRoot().getTextContent());

const BOLD = 1;

describe("find and replace", () => {
  it("finds a word set half in bold, and Arabic without its marks", () => {
    const editor = line(["Photo"], ["synthesis", BOLD], [" makes food."]);
    expect(
      editor
        .getEditorState()
        .read(() => $findInDocument("photosynthesis", false)),
    ).toHaveLength(1);
    const arabic = line(["قال مُحَمَّد"]);
    expect(
      arabic.getEditorState().read(() => $findInDocument("محمد", false)),
    ).toHaveLength(1);
  });

  it("replaces every match, those after the first still where they were", () => {
    const editor = line(["the cat sat on the "], ["cat", BOLD], [" mat"]);
    editor.update(() => $replaceFound($findInDocument("cat", false), "dog"), {
      discrete: true,
    });
    expect(text(editor)).toBe("the dog sat on the dog mat");
  });
});

const selectAll = (editor: LexicalEditor) =>
  editor.update(() => $getRoot().select(0, $getRoot().getChildrenSize()), {
    discrete: true,
  });

describe("text size and clearing formats", () => {
  it("sets a size as a share of the text around it, which a document keeps", () => {
    const editor = line(["Big words"]);
    selectAll(editor);
    editor.update(() => $applyTextSize("large"), { discrete: true });
    const style = editor
      .getEditorState()
      .read(
        () => $getRoot().getAllTextNodes().find($isTextNode)?.getStyle() ?? "",
      );
    expect(style).toContain(`font-size: ${TEXT_SIZES.large}`);
    expect(validContentStyle(style)).toBe(true);
  });

  it("takes every mark, colour and size off the words chosen", () => {
    const editor = line(["plain "], ["bold", BOLD]);
    selectAll(editor);
    editor.update(() => $applyTextSize("huge"), { discrete: true });
    editor.update(() => $clearFormatting(), { discrete: true });
    const nodes = editor.getEditorState().read(() =>
      $getRoot()
        .getAllTextNodes()
        .map((node) => [node.getFormat(), node.getStyle()]),
    );
    expect(nodes.every(([format, style]) => format === 0 && !style)).toBe(true);
  });
});
