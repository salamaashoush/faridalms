import type { TableNode } from "@lexical/table";

import { contentDocumentSchema } from "@faridalms/domain/content";
import {
  $createTableNodeWithDimensions,
  $isTableCellNode,
  $isTableRowNode,
} from "@lexical/table";
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
} from "lexical";
import * as v from "valibot";
import { describe, expect, it } from "vitest";

import { buildContentEditor } from "./headless";
import {
  $addRowFromLastCell,
  $lineBeside,
  $pasteGrid,
  $tableFromGrid,
  clipboardGrid,
} from "./plugins/table-grid";

const sheet =
  "<google-sheets-html-origin><table><tbody><tr><td>Name</td><td>Mark</td></tr><tr><td>Salama</td><td>18</td></tr></tbody></table>";

function cells(table: TableNode): string[][] {
  return table
    .getChildren()
    .filter($isTableRowNode)
    .map((row) => row.getChildren().map((cell) => cell.getTextContent()));
}

describe("clipboard grids", () => {
  it("reads a spreadsheet's table, keeping each cell's words", () => {
    expect(clipboardGrid("Name\tMark\nSalama\t18", sheet)).toEqual([
      ["Name", "Mark"],
      ["Salama", "18"],
    ]);
  });

  it("reads tab-separated text whose lines split alike", () => {
    expect(clipboardGrid("a\tb\r\nc\td\n", "")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("leaves code indented with tabs, ragged lines and one word alone", () => {
    expect(clipboardGrid("if (x) {\n\treturn;\n}", "")).toBeNull();
    expect(clipboardGrid("a\tb\nc", "")).toBeNull();
    expect(clipboardGrid("a", "")).toBeNull();
  });

  it("leaves a web page's rich text to the ordinary paste", () => {
    expect(clipboardGrid("a\tb", "<p>a b</p>")).toBeNull();
  });
});

describe("pasting into a table", () => {
  it("fills cells across and down from the cell being edited, growing the table", () => {
    const editor = buildContentEditor();
    let grid: string[][] = [];
    editor.update(
      () => {
        const table = $createTableNodeWithDimensions(2, 2, false);
        $getRoot().clear().append(table, $createParagraphNode());
        const second = table.getChildren().filter($isTableRowNode)[1];
        const from = second?.getLastChild();
        if (!$isTableCellNode(from)) throw new Error("no cell");
        $pasteGrid(from, [
          ["x", "y"],
          ["z", "w"],
        ]);
        grid = cells(table);
      },
      { discrete: true },
    );
    expect(grid).toEqual([
      ["", "", ""],
      ["", "x", "y"],
      ["", "z", "w"],
    ]);
    expect(
      v.safeParse(contentDocumentSchema, editor.getEditorState().toJSON())
        .success,
    ).toBe(true);
  });

  it("makes a table from a grid, its first row heading the columns", () => {
    const editor = buildContentEditor();
    let grid: string[][] = [];
    editor.update(
      () => {
        const table = $tableFromGrid([
          ["Name", "Mark"],
          ["Salama", "18"],
        ]);
        $getRoot().clear().append(table);
        grid = cells(table);
      },
      { discrete: true },
    );
    expect(grid).toEqual([
      ["Name", "Mark"],
      ["Salama", "18"],
    ]);
    const saved = v.safeParse(
      contentDocumentSchema,
      editor.getEditorState().toJSON(),
    );
    expect(saved.success).toBe(true);
    const first = saved.success
      ? saved.output.root.children?.[0]?.children?.[0]?.children?.[0]
      : undefined;
    expect(first?.headerState).toBe(1);
  });
});

describe("moving through a table", () => {
  it("adds a row from the last cell and goes on into it", () => {
    const editor = buildContentEditor();
    let rows = 0;
    let added = false;
    let inNewRow = false;
    editor.update(
      () => {
        const table = $createTableNodeWithDimensions(2, 2, false);
        $getRoot().clear().append(table, $createParagraphNode());
        const rowsOf = table.getChildren().filter($isTableRowNode);
        const first = rowsOf[0]?.getFirstChild();
        const last = rowsOf.at(-1)?.getLastChild();
        if (!$isTableCellNode(last) || !$isTableCellNode(first))
          throw new Error("no cells");
        expect($addRowFromLastCell(first)).toBe(false);
        added = $addRowFromLastCell(last);
        rows = table.getChildrenSize();
        const anchor = $getSelection();
        inNewRow =
          $isRangeSelection(anchor) &&
          table.getLastChild()?.isParentOf(anchor.anchor.getNode()) === true;
      },
      { discrete: true },
    );
    expect(added).toBe(true);
    expect(rows).toBe(3);
    expect(inNewRow).toBe(true);
  });

  it("opens a line above and below a table that fills the document", () => {
    const editor = buildContentEditor();
    let types: string[] = [];
    editor.update(
      () => {
        const table = $createTableNodeWithDimensions(1, 1, false);
        $getRoot().clear().append(table);
        $lineBeside(table, false);
        $lineBeside(table, true);
        types = $getRoot()
          .getChildren()
          .map((node) => node.getType());
      },
      { discrete: true },
    );
    expect(types).toEqual(["paragraph", "table", "paragraph"]);
  });
});
