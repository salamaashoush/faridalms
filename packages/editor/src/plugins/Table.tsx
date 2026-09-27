import type { TableCellNode, TableNode } from "@lexical/table";
import type { ElementFormatType, LexicalEditor } from "lexical";

import { Menu } from "@base-ui/react/menu";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $computeTableMapSkipCellCheck,
  $createTableSelectionFrom,
  $deleteTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $getTableCellNodeFromLexicalNode,
  $getTableCellNodeRect,
  $getTableNodeFromLexicalNodeOrThrow,
  $insertTableColumnAtNode,
  $insertTableRowAtNode,
  $isTableCellNode,
  $isTableNode,
  $isTableSelection,
  $mergeCells,
  $moveTableColumn,
  $moveTableRow,
  $setTableColumnIsHeader,
  $setTableRowIsHeader,
  $unmergeCellNode,
  TableCellHeaderStates,
} from "@lexical/table";
import {
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  KEY_ENTER_COMMAND,
} from "lexical";
import {
  AlignCenter,
  AlignEndVertical,
  AlignLeft,
  AlignRight,
  AlignStartVertical,
  AlignVerticalJustifyCenter,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  Columns3,
  Combine,
  GripHorizontal,
  GripVertical,
  Minus,
  Plus,
  Rows3,
  Split,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { EditorStrings } from "../strings";

import { useEditorEnvironment } from "../context";
import { backgroundColors } from "../formatting";
import { textFocus, updateFromOutside } from "../outside";
import { editorColors } from "../strings";
import { cx, menuItemClass, menuPopupClass } from "../ui";

const MIN_COLUMN = 48;
const WIDTH_STEP = 40;

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Line {
  /** The row's node, or for a column the cell that best stands for it. */
  key: string;
  start: number;
  size: number;
}

interface Target {
  tableKey: string;
  table: Box;
  rtl: boolean;
  /** Each row's top and height, relative to the editor. */
  rows: Line[];
  /** Each grid column's left edge and width, relative to the editor, in visual order of the grid. */
  columns: Line[];
  striped: boolean;
  firstRowHeader: boolean;
  headerRows: boolean[];
  headerColumns: boolean[];
  cell: {
    key: string;
    box: Box;
    row: number;
    column: number;
    merged: boolean;
    selected: number;
    headerRow: boolean;
    headerColumn: boolean;
  } | null;
}

type Scope =
  | { kind: "row"; index: number }
  | { kind: "column"; index: number }
  | { kind: "cell" };

const boxIn = (rect: DOMRect, anchor: HTMLElement): Box => {
  const outer = anchor.getBoundingClientRect();
  return {
    top: rect.top - outer.top + anchor.scrollTop,
    left: rect.left - outer.left + anchor.scrollLeft,
    width: rect.width,
    height: rect.height,
  };
};

const tableElementOf = (editor: LexicalEditor, key: string) => {
  const element = editor.getElementByKey(key);
  return element instanceof HTMLTableElement
    ? element
    : (element?.querySelector("table") ?? null);
};

/** Each grid column's rendered width, from cells that span one column. */
function measuredWidths(table: HTMLTableElement, columns: number): number[] {
  const widths = Array.from<number>({ length: columns }).fill(0);
  for (const row of table.rows) {
    let column = 0;
    for (const cell of row.cells) {
      if (cell.colSpan === 1 && column < columns && widths[column] === 0)
        widths[column] = cell.getBoundingClientRect().width;
      column += cell.colSpan;
    }
  }
  const known = widths.filter((width) => width > 0);
  const fallback = known.length
    ? known.reduce((sum, width) => sum + width, 0) / known.length
    : table.getBoundingClientRect().width / Math.max(1, columns);
  return widths.map((width) => Math.round(width || fallback));
}

function $cellFromSelection(): TableCellNode | null {
  const selection = $getSelection();
  if ($isTableSelection(selection)) {
    const node = $getNodeByKey(selection.focus.key);
    return $isTableCellNode(node) ? node : null;
  }
  if ($isRangeSelection(selection))
    return $getTableCellNodeFromLexicalNode(selection.anchor.getNode());
  return null;
}

/** The distinct cells covering a row or column of the grid. */
function $cellsIn(table: TableNode, scope: Scope): TableCellNode[] {
  const [map] = $computeTableMapSkipCellCheck(table, null, null);
  const cells = new Set<TableCellNode>();
  if (scope.kind === "row")
    for (const value of map[scope.index] ?? []) cells.add(value.cell);
  else if (scope.kind === "column")
    for (const row of map) {
      const value = row[scope.index];
      if (value) cells.add(value.cell);
    }
  return [...cells];
}

/** The cells a change applies to: a chosen block of cells, else the one being edited. */
function $chosenCells(fallback: TableCellNode | null): TableCellNode[] {
  const selection = $getSelection();
  if ($isTableSelection(selection))
    return selection.getNodes().filter($isTableCellNode);
  return fallback ? [fallback] : [];
}

function $alignCells(cells: TableCellNode[], format: ElementFormatType) {
  for (const cell of cells)
    for (const child of cell.getChildren())
      if ($isElementNode(child)) child.setFormat(format);
}

/** Selects a whole row or column, so what follows applies to all of it. */
function $selectLine(table: TableNode, scope: Scope) {
  const cells = $cellsIn(table, scope);
  const first = cells[0];
  const last = cells.at(-1);
  if (first && last)
    $setSelection($createTableSelectionFrom(table, first, last));
}

/**
 * Tables worked on where they stand. Every row and column has a grip: drag
 * it to move the row or column, or click it to choose the whole line and
 * open its menu. The cell being edited has a menu of its own (Alt+Enter
 * opens it from the keyboard) for merging, colour, alignment and the table
 * as a whole. Buttons at the table's end add a row or column, and column
 * borders drag to resize, with menu items doing the same without a pointer.
 */
export function TablePlugin({ anchor }: { anchor: HTMLElement | null }) {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();
  const [target, setTarget] = useState<Target | null>(null);
  const hovered = useRef<string | null>(null);
  const [menu, setMenu] = useState<{ scope: Scope; at: HTMLElement } | null>(
    null,
  );
  const cellButton = useRef<HTMLButtonElement>(null);
  // Choosing from a menu takes focus, and the selection with it; the table
  // it acts on stays until the menu closes.
  const menuOpen = useRef(false);
  useEffect(() => {
    menuOpen.current = menu !== null;
  }, [menu]);

  const measure = useCallback(() => {
    if (!anchor || !editor.isEditable()) {
      setTarget(null);
      return;
    }
    if (menuOpen.current) return;
    const found = editor.getEditorState().read(
      () => {
        const cell = $cellFromSelection();
        const table = cell
          ? $getTableNodeFromLexicalNodeOrThrow(cell)
          : hovered.current
            ? $getNodeByKey(hovered.current)
            : null;
        if (!$isTableNode(table)) return null;
        const [map] = $computeTableMapSkipCellCheck(table, null, null);
        const rect = cell ? $getTableCellNodeRect(cell) : null;
        const selection = $getSelection();
        const columnKeys = (map[0] ?? []).map((_, column) => {
          const single = map
            .map((row) => row[column]?.cell)
            .find((item) => item?.getColSpan() === 1);
          return (
            single?.getKey() ?? `${map[0]?.[column]?.cell.getKey()}:${column}`
          );
        });
        return {
          tableKey: table.getKey(),
          rowKeys: table.getChildren().map((row) => row.getKey()),
          columnKeys,
          columnCount: map[0]?.length ?? 0,
          striped: table.getRowStriping(),
          firstRowHeader:
            $cellsIn(table, { kind: "row", index: 0 })[0]?.hasHeaderState(
              TableCellHeaderStates.ROW,
            ) ?? false,
          headerRows: map.map((row) =>
            row.every((value) =>
              value.cell.hasHeaderState(TableCellHeaderStates.ROW),
            ),
          ),
          headerColumns: (map[0] ?? []).map((_, column) =>
            map.every((row) =>
              row[column]?.cell.hasHeaderState(TableCellHeaderStates.COLUMN),
            ),
          ),
          cell: cell
            ? {
                key: cell.getKey(),
                row: rect?.rowIndex ?? 0,
                column: rect?.columnIndex ?? 0,
                merged: cell.getColSpan() > 1 || cell.getRowSpan() > 1,
                selected: $isTableSelection(selection)
                  ? selection.getNodes().filter($isTableCellNode).length
                  : 1,
                headerRow: cell.hasHeaderState(TableCellHeaderStates.ROW),
                headerColumn: cell.hasHeaderState(TableCellHeaderStates.COLUMN),
              }
            : null,
        };
      },
      { editor },
    );
    const element = found ? tableElementOf(editor, found.tableKey) : null;
    if (!found || !element) {
      setTarget(null);
      return;
    }
    const rtl = getComputedStyle(element).direction === "rtl";
    const table = boxIn(element.getBoundingClientRect(), anchor);
    const rows = [...element.rows].map((row, index) => {
      const box = boxIn(row.getBoundingClientRect(), anchor);
      return {
        key: found.rowKeys[index] ?? `row:${index}`,
        start: box.top,
        size: box.height,
      };
    });
    const widths = measuredWidths(element, found.columnCount);
    const columns: Line[] = [];
    let edge = rtl ? table.left + table.width : table.left;
    for (const [index, width] of widths.entries()) {
      columns.push({
        key: found.columnKeys[index] ?? `column:${index}`,
        start: rtl ? edge - width : edge,
        size: width,
      });
      edge += rtl ? -width : width;
    }
    const cellElement = found.cell
      ? editor.getElementByKey(found.cell.key)
      : null;
    setTarget({
      tableKey: found.tableKey,
      table,
      rtl,
      rows,
      columns,
      striped: found.striped,
      firstRowHeader: found.firstRowHeader,
      headerRows: found.headerRows,
      headerColumns: found.headerColumns,
      cell:
        found.cell && cellElement
          ? {
              ...found.cell,
              box: boxIn(cellElement.getBoundingClientRect(), anchor),
            }
          : null,
    });
  }, [anchor, editor]);

  useEffect(() => {
    const unregister = editor.registerUpdateListener(() => measure());
    window.addEventListener("resize", measure);
    return () => {
      unregister();
      window.removeEventListener("resize", measure);
    };
  }, [editor, measure]);

  useEffect(() => {
    if (!anchor) return undefined;
    const hover = (key: string | null) => {
      if (hovered.current === key) return;
      hovered.current = key;
      measure();
    };
    const onMove = (event: PointerEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      if (!element || element.closest("[data-table-tools]")) return;
      const table = element.closest("table");
      if (!table || !anchor.contains(table)) {
        hover(null);
        return;
      }
      hover(
        editor.getEditorState().read(
          () => {
            const node = $getNearestNodeFromDOMNode(table);
            return $isTableNode(node) ? node.getKey() : null;
          },
          { editor },
        ),
      );
    };
    const onLeave = () => hover(null);
    anchor.addEventListener("pointermove", onMove);
    anchor.addEventListener("pointerleave", onLeave);
    return () => {
      anchor.removeEventListener("pointermove", onMove);
      anchor.removeEventListener("pointerleave", onLeave);
    };
  }, [anchor, editor, measure]);

  useEffect(
    () =>
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (!event?.altKey || !cellButton.current) return false;
          const inCell = editor
            .getEditorState()
            .read(() => $cellFromSelection() !== null, { editor });
          if (!inCell) return false;
          event.preventDefault();
          setMenu({ scope: { kind: "cell" }, at: cellButton.current });
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor],
  );

  /** Runs a change on the table, with the cell being edited when there is one. */
  const act = (
    change: (table: TableNode, cell: TableCellNode | null) => void,
  ) => {
    if (!target) return;
    updateFromOutside(editor, () => {
      const table = $getNodeByKey(target.tableKey);
      if (!$isTableNode(table)) return;
      const cell = target.cell ? $getNodeByKey(target.cell.key) : null;
      change(table, $isTableCellNode(cell) ? cell : null);
    });
  };

  /** Moves width between a column and its neighbour, keeping the table's width. */
  const resize = (column: number, change: number) => {
    if (!target) return;
    const element = tableElementOf(editor, target.tableKey);
    if (!element) return;
    const widths = measuredWidths(element, target.columns.length);
    const neighbour = column + 1 < widths.length ? column + 1 : column - 1;
    if (neighbour < 0) return;
    const pair = (widths[column] ?? 0) + (widths[neighbour] ?? 0);
    const next = Math.min(
      pair - MIN_COLUMN,
      Math.max(MIN_COLUMN, (widths[column] ?? 0) + change),
    );
    widths[column] = Math.round(next);
    widths[neighbour] = Math.round(pair - next);
    act((table) => table.setColWidths(widths));
  };

  const insertRow = (index: number, after: boolean) =>
    act((table) => {
      const cell = $cellsIn(table, { kind: "row", index })[0];
      if (cell) $insertTableRowAtNode(cell, after);
    });
  const insertColumn = (index: number, after: boolean) =>
    act((table) => {
      const cell = $cellsIn(table, { kind: "column", index })[0];
      if (cell) $insertTableColumnAtNode(cell, after, false);
    });
  const deleteLine = (scope: Scope) =>
    act((table) => {
      const count =
        scope.kind === "row" ? target?.rows.length : target?.columns.length;
      if ((count ?? 0) <= 1) {
        table.selectPrevious();
        table.remove();
        return;
      }
      const cell = $cellsIn(table, scope)[0];
      if (!cell) return;
      cell.selectStart();
      if (scope.kind === "row") $deleteTableRowAtSelection();
      else {
        const widths = table.getColWidths();
        $deleteTableColumnAtSelection();
        if (widths && scope.kind === "column")
          table.setColWidths(
            widths.filter((_, index) => index !== scope.index),
          );
      }
    });
  const paint = (scope: Scope, color: string | null) =>
    act((table, cell) => {
      const cells =
        scope.kind === "cell" ? $chosenCells(cell) : $cellsIn(table, scope);
      for (const item of cells) item.setBackgroundColor(color);
    });
  const align = (scope: Scope, format: ElementFormatType) =>
    act((table, cell) =>
      $alignCells(
        scope.kind === "cell" ? $chosenCells(cell) : $cellsIn(table, scope),
        format,
      ),
    );
  const alignVertically = (value: "top" | "middle" | "bottom") =>
    act((_, cell) => {
      for (const item of $chosenCells(cell)) item.setVerticalAlign(value);
    });

  if (!target) return null;
  const openLine = (scope: Scope, at: HTMLElement) => {
    act((table) => $selectLine(table, scope));
    setMenu({ scope, at });
  };

  return (
    <div data-table-tools>
      {target.rows.map((row, index) => (
        <Grip
          key={row.key}
          axis="row"
          label={strings.rowHandle(index + 1)}
          style={{
            top: row.start + row.size / 2 - 10,
            left: target.rtl
              ? target.table.left + target.table.width + 2
              : target.table.left - 16,
          }}
          lines={target.rows}
          rtl={target.rtl}
          index={index}
          onOpen={(at) => openLine({ kind: "row", index }, at)}
          onMove={(to) => act((table) => $moveTableRow(table, index, to))}
          span={target.table}
        />
      ))}
      {target.columns.map((column, index) => (
        <Grip
          key={column.key}
          axis="column"
          label={strings.columnHandle(index + 1)}
          style={{
            top: target.table.top - 15,
            left: column.start + column.size / 2 - 10,
          }}
          lines={target.columns}
          rtl={target.rtl}
          index={index}
          onOpen={(at) => openLine({ kind: "column", index }, at)}
          onMove={(to) => act((table) => $moveTableColumn(table, index, to))}
          span={target.table}
        />
      ))}
      {target.cell ? (
        <button
          ref={cellButton}
          type="button"
          aria-label={strings.cellMenu}
          title={`${strings.cellMenu} (Alt+Enter)`}
          style={{
            top: target.cell.box.top + 4,
            left: target.rtl
              ? target.cell.box.left + 4
              : target.cell.box.left + target.cell.box.width - 26,
          }}
          className="absolute z-10 inline-flex size-[22px] items-center justify-center rounded-md border bg-background text-muted-foreground shadow-xs hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-3.5"
          onClick={(event) =>
            setMenu({ scope: { kind: "cell" }, at: event.currentTarget })
          }
        >
          <ChevronDown aria-hidden />
        </button>
      ) : null}
      <EdgeButton
        label={strings.addRowAtEnd}
        style={{
          top: target.table.top + target.table.height + 4,
          left: target.table.left,
          width: target.table.width,
        }}
        className="h-4"
        onClick={() => insertRow(target.rows.length - 1, true)}
      />
      <EdgeButton
        label={strings.addColumnAtEnd}
        style={{
          top: target.table.top,
          left: target.rtl
            ? target.table.left - 20
            : target.table.left + target.table.width + 4,
          height: target.table.height,
        }}
        className="w-4"
        onClick={() => insertColumn(target.columns.length - 1, true)}
      />
      <ColumnResizers target={target} onResize={resize} />
      <Menu.Root
        open={menu !== null}
        onOpenChange={(open) => {
          if (open) return;
          setMenu(null);
          requestAnimationFrame(measure);
        }}
      >
        <Menu.Portal>
          <Menu.Positioner
            anchor={menu?.at}
            side="bottom"
            align="start"
            sideOffset={4}
            className="z-50"
          >
            <Menu.Popup
              finalFocus={textFocus(editor)}
              className={cx(menuPopupClass, "max-h-[70vh] overflow-y-auto")}
            >
              {menu ? (
                <TableMenu
                  scope={menu.scope}
                  target={target}
                  strings={strings}
                  onInsertRow={insertRow}
                  onInsertColumn={insertColumn}
                  onDelete={deleteLine}
                  onPaint={paint}
                  onAlign={align}
                  onAlignVertically={alignVertically}
                  onResize={resize}
                  act={act}
                />
              ) : null}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}

function Item({
  icon: Icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <Menu.Item
      className={cx(
        menuItemClass,
        destructive && "text-destructive [&_svg]:text-destructive",
      )}
      onClick={onClick}
    >
      <Icon aria-hidden />
      <span className="flex-1">{label}</span>
    </Menu.Item>
  );
}

function Section({
  label,
  first = false,
  children,
}: {
  label: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  // A plain heading rather than Menu.Group: a submenu inside a group closes
  // the whole menu as soon as the highlight leaves its trigger.
  return (
    <>
      {first ? null : <Menu.Separator className="-mx-1 my-1 h-px bg-border" />}
      <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
        {label}
      </div>
      {children}
    </>
  );
}

/** A row of small choices in a menu, each an item of its own for the keyboard. */
function Choices({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Menu.Group aria-label={label} className="flex flex-wrap gap-1 px-1.5 pb-1">
      {children}
    </Menu.Group>
  );
}

const choiceClass =
  "inline-flex size-7 items-center justify-center rounded-md outline-none data-highlighted:bg-accent data-highlighted:ring-2 data-highlighted:ring-ring/40 [&_svg]:size-4";

function Choice({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Menu.Item
      aria-label={label}
      title={label}
      className={choiceClass}
      onClick={onClick}
    >
      {children}
    </Menu.Item>
  );
}

function StyleItems({
  scope,
  strings,
  onPaint,
  onAlign,
}: {
  scope: Scope;
  strings: EditorStrings;
  onPaint: (scope: Scope, color: string | null) => void;
  onAlign: (scope: Scope, format: ElementFormatType) => void;
}) {
  return (
    <>
      <Choices label={strings.cellColor}>
        <Choice
          label={strings.defaultColor}
          onClick={() => onPaint(scope, null)}
        >
          <span className="size-4 rounded-full border" aria-hidden />
        </Choice>
        {editorColors.map((color) => (
          <Choice
            key={color}
            label={strings.colors[color]}
            onClick={() => onPaint(scope, backgroundColors[color])}
          >
            <span
              className="size-4 rounded-full border"
              style={{ backgroundColor: backgroundColors[color] }}
              aria-hidden
            />
          </Choice>
        ))}
      </Choices>
      <Choices label={strings.textAlign}>
        <Choice
          label={strings.alignStart}
          onClick={() => onAlign(scope, "start")}
        >
          <AlignLeft aria-hidden className="rtl:-scale-x-100" />
        </Choice>
        <Choice
          label={strings.alignCenter}
          onClick={() => onAlign(scope, "center")}
        >
          <AlignCenter aria-hidden />
        </Choice>
        <Choice label={strings.alignEnd} onClick={() => onAlign(scope, "end")}>
          <AlignRight aria-hidden className="rtl:-scale-x-100" />
        </Choice>
      </Choices>
    </>
  );
}

function TableMenu({
  scope,
  target,
  strings,
  onInsertRow,
  onInsertColumn,
  onDelete,
  onPaint,
  onAlign,
  onAlignVertically,
  onResize,
  act,
}: {
  scope: Scope;
  target: Target;
  strings: EditorStrings;
  onInsertRow: (index: number, after: boolean) => void;
  onInsertColumn: (index: number, after: boolean) => void;
  onDelete: (scope: Scope) => void;
  onPaint: (scope: Scope, color: string | null) => void;
  onAlign: (scope: Scope, format: ElementFormatType) => void;
  onAlignVertically: (value: "top" | "middle" | "bottom") => void;
  onResize: (column: number, change: number) => void;
  act: (change: (table: TableNode, cell: TableCellNode | null) => void) => void;
}) {
  const before = target.rtl ? ArrowRight : ArrowLeft;
  const after = target.rtl ? ArrowLeft : ArrowRight;
  if (scope.kind === "row") {
    const index = scope.index;
    const header = target.headerRows[index] ?? false;
    return (
      <>
        <Section label={strings.rowHandle(index + 1)} first>
          <Item
            icon={ArrowUp}
            label={strings.insertRowAbove}
            onClick={() => onInsertRow(index, false)}
          />
          <Item
            icon={ArrowDown}
            label={strings.insertRowBelow}
            onClick={() => onInsertRow(index, true)}
          />
          {index > 0 ? (
            <Item
              icon={ArrowUp}
              label={strings.moveRowUp}
              onClick={() =>
                act((table) => $moveTableRow(table, index, index - 1))
              }
            />
          ) : null}
          {index < target.rows.length - 1 ? (
            <Item
              icon={ArrowDown}
              label={strings.moveRowDown}
              onClick={() =>
                act((table) => $moveTableRow(table, index, index + 1))
              }
            />
          ) : null}
          <Item
            icon={Rows3}
            label={header ? strings.headerRowOff : strings.headerRowOn}
            onClick={() =>
              act((table) => {
                const cell = $cellsIn(table, scope)[0];
                $setTableRowIsHeader(
                  table,
                  index,
                  !cell?.hasHeaderState(TableCellHeaderStates.ROW),
                );
              })
            }
          />
        </Section>
        <Section label={strings.tableStyle}>
          <StyleItems
            scope={scope}
            strings={strings}
            onPaint={onPaint}
            onAlign={onAlign}
          />
        </Section>
        <Section label={strings.tableDanger}>
          <Item
            icon={Trash2}
            label={strings.deleteRow}
            destructive
            onClick={() => onDelete(scope)}
          />
        </Section>
      </>
    );
  }
  if (scope.kind === "column") {
    const index = scope.index;
    return (
      <>
        <Section label={strings.columnHandle(index + 1)} first>
          <Item
            icon={before}
            label={strings.insertColumnBefore}
            onClick={() => onInsertColumn(index, false)}
          />
          <Item
            icon={after}
            label={strings.insertColumnAfter}
            onClick={() => onInsertColumn(index, true)}
          />
          {index > 0 ? (
            <Item
              icon={before}
              label={strings.moveColumnBefore}
              onClick={() =>
                act((table) => $moveTableColumn(table, index, index - 1))
              }
            />
          ) : null}
          {index < target.columns.length - 1 ? (
            <Item
              icon={after}
              label={strings.moveColumnAfter}
              onClick={() =>
                act((table) => $moveTableColumn(table, index, index + 1))
              }
            />
          ) : null}
          <Item
            icon={Columns3}
            label={
              target.headerColumns[index]
                ? strings.headerColumnOff
                : strings.headerColumnOn
            }
            onClick={() =>
              act((table) => {
                const cell = $cellsIn(table, scope)[0];
                $setTableColumnIsHeader(
                  table,
                  index,
                  !cell?.hasHeaderState(TableCellHeaderStates.COLUMN),
                );
              })
            }
          />
        </Section>
        <Section label={strings.tableStyle}>
          <StyleItems
            scope={scope}
            strings={strings}
            onPaint={onPaint}
            onAlign={onAlign}
          />
          {target.columns.length > 1 ? (
            <>
              <Item
                icon={Plus}
                label={strings.widenColumn}
                onClick={() => onResize(index, WIDTH_STEP)}
              />
              <Item
                icon={Minus}
                label={strings.narrowColumn}
                onClick={() => onResize(index, -WIDTH_STEP)}
              />
              <Item
                icon={Columns3}
                label={strings.equalColumns}
                onClick={() => act((table) => table.setColWidths(undefined))}
              />
            </>
          ) : null}
        </Section>
        <Section label={strings.tableDanger}>
          <Item
            icon={Trash2}
            label={strings.deleteColumn}
            destructive
            onClick={() => onDelete(scope)}
          />
        </Section>
      </>
    );
  }
  const cell = target.cell;
  return (
    <>
      <Section label={strings.cellMenu} first>
        {cell && cell.selected > 1 ? (
          <Item
            icon={Combine}
            label={strings.mergeCells}
            onClick={() =>
              act(() => {
                const selection = $getSelection();
                if (!$isTableSelection(selection)) return;
                $mergeCells(
                  selection.getNodes().filter($isTableCellNode),
                )?.selectEnd();
              })
            }
          />
        ) : null}
        {cell?.merged ? (
          <Item
            icon={Split}
            label={strings.splitCell}
            onClick={() =>
              act((_, current) => {
                if (current) $unmergeCellNode(current);
              })
            }
          />
        ) : null}
        <StyleItems
          scope={scope}
          strings={strings}
          onPaint={onPaint}
          onAlign={onAlign}
        />
        <Choices label={strings.verticalAlign}>
          <Choice
            label={strings.alignTop}
            onClick={() => onAlignVertically("top")}
          >
            <AlignStartVertical aria-hidden className="rotate-90" />
          </Choice>
          <Choice
            label={strings.alignMiddle}
            onClick={() => onAlignVertically("middle")}
          >
            <AlignVerticalJustifyCenter aria-hidden />
          </Choice>
          <Choice
            label={strings.alignBottom}
            onClick={() => onAlignVertically("bottom")}
          >
            <AlignEndVertical aria-hidden className="rotate-90" />
          </Choice>
        </Choices>
      </Section>
      {cell ? (
        <Section label={strings.tableInsert}>
          <Item
            icon={ArrowUp}
            label={strings.insertRowAbove}
            onClick={() => onInsertRow(cell.row, false)}
          />
          <Item
            icon={ArrowDown}
            label={strings.insertRowBelow}
            onClick={() => onInsertRow(cell.row, true)}
          />
          <Item
            icon={before}
            label={strings.insertColumnBefore}
            onClick={() => onInsertColumn(cell.column, false)}
          />
          <Item
            icon={after}
            label={strings.insertColumnAfter}
            onClick={() => onInsertColumn(cell.column, true)}
          />
        </Section>
      ) : null}
      <Section label={strings.tableWhole}>
        <Item
          icon={Rows3}
          label={target.striped ? strings.stripesOff : strings.stripesOn}
          onClick={() =>
            act((table) => {
              table.setRowStriping(!target.striped);
            })
          }
        />
        <Item
          icon={Rows3}
          label={
            target.firstRowHeader ? strings.headerRowOff : strings.headerRowOn
          }
          onClick={() =>
            act((table) => {
              const first = $cellsIn(table, { kind: "row", index: 0 })[0];
              $setTableRowIsHeader(
                table,
                0,
                !first?.hasHeaderState(TableCellHeaderStates.ROW),
              );
            })
          }
        />
        <Item
          icon={Trash2}
          label={strings.deleteTable}
          destructive
          onClick={() =>
            act((table) => {
              table.selectPrevious();
              table.remove();
            })
          }
        />
      </Section>
    </>
  );
}

/**
 * A row's or column's grip. A click opens the line's menu; a drag past a few
 * pixels moves the line to where it is dropped, shown by a guide.
 */
function Grip({
  axis,
  label,
  style,
  lines,
  rtl,
  index,
  span,
  onOpen,
  onMove,
}: {
  axis: "row" | "column";
  label: string;
  style: React.CSSProperties;
  lines: Line[];
  rtl: boolean;
  index: number;
  span: Box;
  onOpen: (at: HTMLElement) => void;
  onMove: (to: number) => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [drop, setDrop] = useState<{ to: number; at: number } | null>(null);
  const moved = useRef(false);

  /** Where a drop lands: the boundary between lines under the pointer, in the grid's order. */
  const placeOf = (x: number, y: number, anchor: HTMLElement) => {
    const outer = anchor.getBoundingClientRect();
    const position =
      axis === "row"
        ? y - outer.top + anchor.scrollTop
        : x - outer.left + anchor.scrollLeft;
    const reversed = axis === "column" && rtl;
    const boundary = lines.filter((line) => {
      const middle = line.start + line.size / 2;
      return reversed ? position < middle : position > middle;
    }).length;
    const edge = (line: Line, far: boolean) =>
      far !== reversed ? line.start + line.size : line.start;
    const next = lines[boundary];
    const last = lines.at(-1);
    const at = next ? edge(next, false) : last ? edge(last, true) : 0;
    return { to: boundary > index ? boundary - 1 : boundary, at };
  };

  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        style={style}
        className={cx(
          "absolute z-10 inline-flex touch-none items-center justify-center rounded text-muted-foreground/60 hover:bg-accent hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
          axis === "row" ? "h-5 w-3.5 cursor-grab" : "h-3.5 w-5 cursor-grab",
        )}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          // Keeps the browser from selecting the cells the pointer crosses.
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          start.current = { x: event.clientX, y: event.clientY };
          moved.current = false;
        }}
        onPointerMove={(event) => {
          if (!start.current) return;
          const distance =
            Math.abs(event.clientX - start.current.x) +
            Math.abs(event.clientY - start.current.y);
          if (distance < 5 && !moved.current) return;
          moved.current = true;
          const anchor = event.currentTarget.offsetParent;
          if (anchor instanceof HTMLElement)
            setDrop(placeOf(event.clientX, event.clientY, anchor));
        }}
        onPointerUp={(event) => {
          const button = event.currentTarget;
          const wasDrag = moved.current;
          start.current = null;
          moved.current = false;
          if (wasDrag && drop) {
            if (drop.to !== index) onMove(drop.to);
          } else if (!wasDrag) onOpen(button);
          setDrop(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onOpen(event.currentTarget);
          }
        }}
      >
        {axis === "row" ? (
          <GripVertical aria-hidden className="size-3.5" />
        ) : (
          <GripHorizontal aria-hidden className="size-3.5" />
        )}
      </button>
      {drop ? (
        <div
          aria-hidden
          style={
            axis === "row"
              ? { top: drop.at - 1, left: span.left, width: span.width }
              : { left: drop.at - 1, top: span.top, height: span.height }
          }
          className={cx(
            "pointer-events-none absolute z-10 bg-primary",
            axis === "row" ? "h-0.5" : "w-0.5",
          )}
        />
      ) : null}
    </>
  );
}

function EdgeButton({
  label,
  style,
  className,
  onClick,
}: {
  label: string;
  style: React.CSSProperties;
  className: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      style={style}
      className={cx(
        "absolute z-10 flex items-center justify-center rounded-md bg-muted/60 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/40 group-hover/editor:opacity-60 [&_svg]:size-3",
        className,
      )}
      onClick={onClick}
    >
      <Plus aria-hidden />
    </button>
  );
}

/**
 * Handles on the borders between columns. A drag moves width from one
 * column to its neighbour; the column menu's widen and narrow do the same.
 */
function ColumnResizers({
  target,
  onResize,
}: {
  target: Target;
  onResize: (column: number, change: number) => void;
}) {
  const drag = useRef<{ column: number; x: number; at: number } | null>(null);
  const [guide, setGuide] = useState<number | null>(null);
  const borders = target.columns.slice(0, -1).map((column, index) => ({
    column: index,
    at: target.rtl ? column.start : column.start + column.size,
  }));
  return (
    <>
      {borders.map((border) => (
        <div
          key={border.column}
          aria-hidden
          style={{
            top: target.table.top,
            left: border.at - 3,
            height: target.table.height,
          }}
          className="absolute z-[5] w-1.5 cursor-col-resize touch-none rounded hover:bg-primary/40"
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              column: border.column,
              x: event.clientX,
              at: border.at,
            };
            setGuide(border.at);
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            setGuide(drag.current.at + (event.clientX - drag.current.x));
          }}
          onPointerUp={(event) => {
            if (!drag.current) return;
            const moved = event.clientX - drag.current.x;
            if (Math.abs(moved) > 2)
              onResize(drag.current.column, target.rtl ? -moved : moved);
            drag.current = null;
            setGuide(null);
          }}
        />
      ))}
      {guide === null ? null : (
        <div
          aria-hidden
          style={{
            top: target.table.top,
            left: guide - 1,
            height: target.table.height,
          }}
          className="pointer-events-none absolute z-10 w-0.5 bg-primary"
        />
      )}
    </>
  );
}
