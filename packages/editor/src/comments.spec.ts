import type { LexicalEditor, TextNode } from "lexical";

import {
  $createParagraphNode,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getState,
  $isElementNode,
  $isTextNode,
} from "lexical";
import { describe, expect, it } from "vitest";

import {
  $blockAnchor,
  $caretPoint,
  $placeAnchors,
  $selectionAnchor,
} from "./comments";
import { buildContentEditor } from "./headless";
import { blockIdState } from "./nodes";

/** An editor holding one paragraph a line, each paragraph its pieces of text. */
function writing(...lines: string[][]): LexicalEditor {
  const editor = buildContentEditor();
  editor.update(
    () => {
      const root = $getRoot();
      root.clear();
      for (const pieces of lines) {
        const line = $createParagraphNode();
        for (const [index, piece] of pieces.entries()) {
          const text = $createTextNode(piece);
          if (index % 2 === 1) text.toggleFormat("bold");
          line.append(text);
        }
        root.append(line);
      }
    },
    { discrete: true },
  );
  return editor;
}

const ids = (editor: LexicalEditor) =>
  editor.getEditorState().read(() =>
    $getRoot()
      .getChildren()
      .map((line) => $getState(line, blockIdState)),
  );

/** The text pieces of a line, by the line's place in the document. */
const piecesOf = (line: number): TextNode[] => {
  const node = $getRoot().getChildAtIndex(line);
  return $isElementNode(node) ? node.getChildren().filter($isTextNode) : [];
};

describe("comment anchors in the editor", () => {
  it("anchor selected words by block id and the characters before them, across formatting", () => {
    const editor = writing(["The ", "great", " Nile floods"]);
    const [block] = ids(editor);
    const found = editor.getEditorState().read(() => {
      const [, bold, plain] = piecesOf(0);
      if (!bold || !plain) throw new Error("the line has no pieces");
      const selection = $createRangeSelection();
      selection.anchor.set(bold.getKey(), 0, "text");
      selection.focus.set(plain.getKey(), 5, "text");
      return $selectionAnchor(selection);
    });
    expect(found).toEqual({
      anchor: {
        start: { block, offset: 4 },
        end: { block, offset: 14 },
      },
      quote: "great Nile",
    });
  });

  it("read a selection made backwards the same way", () => {
    const editor = writing(["The Nile"], ["floods in summer"]);
    const [first, second] = ids(editor);
    const found = editor.getEditorState().read(() => {
      const [start] = piecesOf(0);
      const [end] = piecesOf(1);
      if (!start || !end) throw new Error("the lines have no text");
      const selection = $createRangeSelection();
      selection.anchor.set(end.getKey(), 6, "text");
      selection.focus.set(start.getKey(), 4, "text");
      return $selectionAnchor(selection);
    });
    expect(found?.anchor).toEqual({
      start: { block: first, offset: 4 },
      end: { block: second, offset: 6 },
    });
  });

  it("refuse an empty selection", () => {
    const editor = writing(["The Nile"]);
    const found = editor.getEditorState().read(() => {
      const [text] = piecesOf(0);
      if (!text) throw new Error("the line has no text");
      const selection = $createRangeSelection();
      selection.anchor.set(text.getKey(), 2, "text");
      selection.focus.set(text.getKey(), 2, "text");
      return $selectionAnchor(selection);
    });
    expect(found).toBeNull();
  });

  it("anchor a whole block with no length, and place it as the block", () => {
    const editor = writing(["The Nile"], ["floods in summer"]);
    const [, second] = ids(editor);
    const found = editor.getEditorState().read(() => {
      const line = $getRoot().getChildAtIndex(1);
      return line ? $blockAnchor(line.getKey()) : null;
    });
    expect(found).toEqual({
      anchor: {
        start: { block: second, offset: 0 },
        end: { block: second, offset: 0 },
      },
      quote: "floods in summer",
    });
    if (!found) throw new Error("the block was not anchored");
    const placed = editor
      .getEditorState()
      .read(() => $placeAnchors([{ id: "t", anchor: found.anchor }]));
    expect(placed[0]?.placement.kind).toBe("block");
  });

  it("find passages again in reading order, and leave out one whose block was deleted", () => {
    const editor = writing(["The Nile"], ["floods in summer"], ["every year"]);
    const [first, second, third] = ids(editor) as [string, string, string];
    const threads = [
      {
        id: "late",
        anchor: {
          start: { block: third, offset: 0 },
          end: { block: third, offset: 5 },
        },
      },
      {
        id: "early",
        anchor: {
          start: { block: first, offset: 4 },
          end: { block: first, offset: 8 },
        },
      },
      {
        id: "gone",
        anchor: {
          start: { block: second, offset: 0 },
          end: { block: second, offset: 6 },
        },
      },
    ];
    const before = editor
      .getEditorState()
      .read(() => $placeAnchors(threads).map((row) => row.id));
    expect(before).toEqual(["early", "gone", "late"]);
    editor.update(() => $getRoot().getChildAtIndex(1)?.remove(), {
      discrete: true,
    });
    const after = editor.getEditorState().read(() => $placeAnchors(threads));
    expect(after.map((row) => row.id)).toEqual(["early", "late"]);
    const early = after[0]?.placement;
    expect(early?.kind === "text" && early.start.offset).toBe(4);
  });

  it("keep a passage where it was while others write elsewhere in the document", () => {
    const editor = writing(["The Nile"], ["floods in summer"]);
    const [, second] = ids(editor) as [string, string];
    const thread = {
      id: "t",
      anchor: {
        start: { block: second, offset: 0 },
        end: { block: second, offset: 6 },
      },
    };
    editor.update(
      () => {
        const [text] = piecesOf(0);
        text?.setTextContent("The long river Nile");
        $getRoot().getFirstChild()?.insertBefore($createParagraphNode());
      },
      { discrete: true },
    );
    const placed = editor.getEditorState().read(() => {
      const [row] = $placeAnchors([thread]);
      const placement = row?.placement;
      if (placement?.kind !== "text") return null;
      const node = $getRoot()
        .getAllTextNodes()
        .find((text) => text.getKey() === placement.start.key);
      return node?.getTextContent().slice(0, 6);
    });
    expect(placed).toBe("floods");
  });

  it("leave out a passage whose words no longer reach as far", () => {
    const editor = writing(["The Nile"]);
    const [block] = ids(editor) as [string];
    const thread = {
      id: "t",
      anchor: {
        start: { block, offset: 4 },
        end: { block, offset: 8 },
      },
    };
    editor.update(() => piecesOf(0)[0]?.setTextContent("Nil"), {
      discrete: true,
    });
    expect(editor.getEditorState().read(() => $placeAnchors([thread]))).toEqual(
      [],
    );
  });

  it("read where the caret stands as a point in its block", () => {
    const editor = writing(["The ", "Nile"]);
    const [block] = ids(editor);
    const point = editor.getEditorState().read(() => {
      const [, bold] = piecesOf(0);
      if (!bold) throw new Error("the line has no bold piece");
      const selection = $createRangeSelection();
      selection.anchor.set(bold.getKey(), 2, "text");
      selection.focus.set(bold.getKey(), 2, "text");
      return $caretPoint(selection);
    });
    expect(point).toEqual({ block, offset: 6 });
  });
});
