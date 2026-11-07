import type { TableCellNode, TableNode } from "@lexical/table";

import {
  $computeTableMapSkipCellCheck,
  $createTableNodeWithDimensions,
  $getTableCellNodeRect,
  $getTableNodeFromLexicalNodeOrThrow,
  $insertTableColumnAtNode,
  $insertTableRowAtNode,
  $isTableCellNode,
} from "@lexical/table";
import { $createParagraphNode, $createTextNode } from "lexical";

export const MAX_TABLE_ROWS = 50;
export const MAX_TABLE_COLUMNS = 20;

export interface TableSize {
  rows: number;
  columns: number;
  /** Whether the first row heads the columns. */
  header: boolean;
}

const usable = (grid: string[][]): string[][] | null => {
  const rows = grid.filter((row) => row.some((cell) => cell.trim()));
  const columns = Math.max(0, ...rows.map((row) => row.length));
  if (rows.length === 0 || (rows.length === 1 && columns < 2)) return null;
  if (rows.length > MAX_TABLE_ROWS || columns > MAX_TABLE_COLUMNS) return null;
  return rows;
};

/**
 * The cells of what was copied from a spreadsheet or a web page's table, row
 * by row, or null for anything else. A spreadsheet copies an HTML table
 * beside its tab-separated text, which keeps a cell's own line breaks; text
 * alone counts when every line splits into the same number of cells, so
 * code indented with tabs does not.
 */
export function clipboardGrid(text: string, html: string): string[][] | null {
  if (html && /<table\b/i.test(html)) {
    const table = new DOMParser()
      .parseFromString(html, "text/html")
      .querySelector("table");
    if (!table) return null;
    return usable(
      [...table.rows].map((row) =>
        [...row.cells].map((cell) => cell.textContent.trim()),
      ),
    );
  }
  if (html.trim()) return null;
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  if (lines.some((line) => !line.includes("\t") || line.startsWith("\t")))
    return null;
  const grid = lines.map((line) => line.split("\t"));
  const width = grid[0]?.length ?? 0;
  return grid.every((row) => row.length === width) ? usable(grid) : null;
}

function $write(cell: TableCellNode, text: string) {
  cell.clear();
  cell.append(
    $createParagraphNode().append(...(text ? [$createTextNode(text)] : [])),
  );
}

/** A new table holding a copied grid, its first row heading the columns. */
export function $tableFromGrid(grid: string[][]): TableNode {
  const columns = Math.max(...grid.map((row) => row.length));
  const table = $createTableNodeWithDimensions(grid.length, columns, {
    rows: true,
    columns: false,
  });
  const [map] = $computeTableMapSkipCellCheck(table, null, null);
  for (const [row, cells] of grid.entries())
    for (const [column, text] of cells.entries()) {
      const cell = map[row]?.[column]?.cell;
      if (cell) $write(cell, text);
    }
  return table;
}

/**
 * Pastes a copied grid into a table from the cell being edited, across and
 * down as a spreadsheet does, adding the rows and columns it runs past. A
 * merged cell takes the text of the place it starts at.
 */
export function $pasteGrid(from: TableCellNode, grid: string[][]) {
  const table = $getTableNodeFromLexicalNodeOrThrow(from);
  const { rowIndex, columnIndex } = $getTableCellNodeRect(from) ?? {
    rowIndex: 0,
    columnIndex: 0,
  };
  const rows = rowIndex + grid.length;
  const columns = columnIndex + Math.max(...grid.map((row) => row.length));
  let [map] = $computeTableMapSkipCellCheck(table, null, null);
  if (rows > MAX_TABLE_ROWS || columns > MAX_TABLE_COLUMNS) return false;
  while (map.length < rows) {
    const last = map.at(-1)?.[0]?.cell;
    if (!last) return false;
    $insertTableRowAtNode(last, true);
    [map] = $computeTableMapSkipCellCheck(table, null, null);
  }
  while ((map[0]?.length ?? 0) < columns) {
    const last = map[0]?.at(-1)?.cell;
    if (!last) return false;
    $insertTableColumnAtNode(last, true, false);
    [map] = $computeTableMapSkipCellCheck(table, null, null);
  }
  for (const [row, cells] of grid.entries())
    for (const [column, text] of cells.entries()) {
      const place = map[rowIndex + row]?.[columnIndex + column];
      if (
        place &&
        $isTableCellNode(place.cell) &&
        place.startRow === rowIndex + row &&
        place.startColumn === columnIndex + column
      )
        $write(place.cell, text);
    }
  from.selectEnd();
  return true;
}

/**
 * Tab in a table's last cell adds a row and goes on into it, as in a word
 * processor; anywhere else Tab moves to the next cell. Reports whether it
 * added one.
 */
export function $addRowFromLastCell(cell: TableCellNode): boolean {
  const table = $getTableNodeFromLexicalNodeOrThrow(cell);
  const [map] = $computeTableMapSkipCellCheck(table, null, null);
  if (!map.at(-1)?.at(-1)?.cell.is(cell)) return false;
  if (map.length >= MAX_TABLE_ROWS) return false;
  const row = $insertTableRowAtNode(cell, true);
  const first = row?.getFirstChild();
  if (!$isTableCellNode(first)) return false;
  first.selectStart();
  return true;
}

/**
 * A line to type on just above or below a table, which a table at the very
 * start or end of a document otherwise leaves no way to reach.
 */
export function $lineBeside(table: TableNode, after: boolean) {
  const line = $createParagraphNode();
  if (after) table.insertAfter(line);
  else table.insertBefore(line);
  line.select();
}
