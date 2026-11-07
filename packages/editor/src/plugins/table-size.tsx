import type { ReferenceElement } from "@floating-ui/dom";
import type { NodeKey } from "lexical";
import type { KeyboardEvent } from "react";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $createTableNodeWithDimensions } from "@lexical/table";
import { $getNodeByKey, COMMAND_PRIORITY_LOW, createCommand } from "lexical";
import { Minus, Plus } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import type { EditorStrings } from "../strings";
import type { TableSize } from "./table-grid";

import { $anchorFor, $placeBlock } from "../blocks";
import { useEditorEnvironment } from "../context";
import { focusText, updateFromOutside } from "../outside";
import { cx, Floating, selectionReference } from "../ui";

export const OPEN_TABLE_COMMAND = createCommand<void>("FARIDA_OPEN_TABLE");

/** The largest table the grid offers; the steppers go no further. */
const GRID = 10;

const clamp = (value: number) => Math.max(1, Math.min(GRID, value));

export interface TableSizePickerProps {
  strings: EditorStrings;
  onInsert: (size: TableSize) => void;
  onCancel: () => void;
}

/**
 * Chooses a new table's size. A pointer sweeps a grid, as a word processor
 * offers; arrow keys move the corner (mirrored right to left), Home and End
 * go to a row's ends, and Enter inserts. A touch screen gets steppers
 * instead, a grid of small squares being no target for a finger.
 */
export function TableSizePicker({
  strings,
  onInsert,
  onCancel,
}: TableSizePickerProps) {
  const [rows, setRows] = useState(3);
  const [columns, setColumns] = useState(3);
  const [header, setHeader] = useState(true);
  const [hovered, setHovered] = useState<[number, number] | null>(null);
  const [coarse] = useState(
    () =>
      typeof matchMedia === "function" &&
      matchMedia("(any-pointer: coarse)").matches &&
      !matchMedia("(any-pointer: fine)").matches,
  );
  // The grid takes focus as it opens, and keeps it on its corner as the
  // arrow keys move it; a pointer sweeping it moves no focus.
  const refocus = useRef(!coarse);
  const grid = useRef<HTMLTableElement>(null);
  const headerId = useId();
  const [shownRows, shownColumns] = hovered ?? [rows, columns];

  const focusCorner = (element: HTMLButtonElement | null) => {
    if (!element || !refocus.current) return;
    refocus.current = false;
    element.focus();
    // The menu that opened the picker hands focus back to the text as it
    // closes, after the picker is drawn; take it back once that is done.
    requestAnimationFrame(() => {
      if (element.isConnected && document.activeElement !== element)
        element.focus();
    });
  };
  const move = (row: number, column: number) => {
    setHovered(null);
    setRows(clamp(row));
    setColumns(clamp(column));
  };
  const insert = (row = rows, column = columns) =>
    onInsert({ rows: row, columns: column, header });

  const onGridKey = (event: KeyboardEvent) => {
    const rtl =
      grid.current !== null &&
      getComputedStyle(grid.current).direction === "rtl";
    const step = rtl ? -1 : 1;
    if (event.key === "ArrowUp") move(rows - 1, columns);
    else if (event.key === "ArrowDown") move(rows + 1, columns);
    else if (event.key === "ArrowLeft") move(rows, columns - step);
    else if (event.key === "ArrowRight") move(rows, columns + step);
    else if (event.key === "Home") move(event.ctrlKey ? 1 : rows, 1);
    else if (event.key === "End") move(event.ctrlKey ? GRID : rows, GRID);
    else if (event.key === "Enter" || event.key === " ") insert();
    else if (event.key === "Escape") onCancel();
    else return;
    refocus.current = event.key !== "Escape";
    event.preventDefault();
    event.stopPropagation();
  };

  const places = Array.from({ length: GRID }, (_, index) => index + 1);
  return (
    <div data-editor-prompt="" className="grid w-fit max-w-full gap-3">
      <p className="text-sm font-medium" aria-live="polite">
        {strings.tableSize(shownRows, shownColumns)}
      </p>
      {coarse ? (
        <div className="grid grid-cols-2 gap-3">
          <Stepper
            label={strings.tableRows}
            less={strings.tableRowsLess}
            more={strings.tableRowsMore}
            value={rows}
            onChange={(value) => setRows(clamp(value))}
          />
          <Stepper
            label={strings.tableColumns}
            less={strings.tableColumnsLess}
            more={strings.tableColumnsMore}
            value={columns}
            onChange={(value) => setColumns(clamp(value))}
          />
        </div>
      ) : (
        <table
          ref={grid}
          className="border-separate border-spacing-0.5"
          onPointerLeave={() => setHovered(null)}
        >
          <caption className="sr-only">{strings.tableSizeGrid}</caption>
          <tbody>
            {places.map((row) => (
              <tr key={row}>
                {places.map((column) => {
                  const chosen = row <= shownRows && column <= shownColumns;
                  const current = row === rows && column === columns;
                  return (
                    <td key={column} className="p-0">
                      <button
                        ref={current ? focusCorner : undefined}
                        type="button"
                        tabIndex={current ? 0 : -1}
                        aria-label={strings.tableSize(row, column)}
                        onKeyDown={onGridKey}
                        onPointerEnter={() => setHovered([row, column])}
                        onFocus={() => {
                          if (!current) move(row, column);
                        }}
                        onClick={() => insert(row, column)}
                        className={cx(
                          "block size-5 rounded-[3px] border outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                          chosen
                            ? "border-primary/60 bg-primary/20"
                            : "border-border bg-background",
                        )}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <label
        htmlFor={headerId}
        className="flex min-h-8 items-center gap-2 text-sm"
      >
        <input
          id={headerId}
          type="checkbox"
          checked={header}
          onChange={(event) => setHeader(event.target.checked)}
          className="size-4 accent-primary"
        />
        {strings.tableHeaderRow}
      </label>
      {coarse ? (
        <button
          type="button"
          onClick={() => insert()}
          className="h-11 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {strings.tableInsertButton}
        </button>
      ) : null}
    </div>
  );
}

interface StepperProps {
  label: string;
  less: string;
  more: string;
  value: number;
  onChange: (value: number) => void;
}

function Stepper({ label, less, more, value, onChange }: StepperProps) {
  const button =
    "inline-flex size-11 items-center justify-center rounded-md border bg-background hover:bg-accent disabled:opacity-40 [&_svg]:size-4";
  return (
    <fieldset className="grid min-w-0 gap-1">
      <legend className="text-xs font-medium">{label}</legend>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={less}
          disabled={value <= 1}
          onClick={() => onChange(value - 1)}
          className={button}
        >
          <Minus aria-hidden />
        </button>
        <output className="w-8 text-center text-sm tabular-nums">
          {value}
        </output>
        <button
          type="button"
          aria-label={more}
          disabled={value >= GRID}
          onClick={() => onChange(value + 1)}
          className={button}
        >
          <Plus aria-hidden />
        </button>
      </div>
    </fieldset>
  );
}

export function $insertTable(size: TableSize, anchor = $anchorFor("table")) {
  return $placeBlock(
    $createTableNodeWithDimensions(size.rows, size.columns, {
      rows: size.header,
      columns: false,
    }),
    anchor,
  );
}

/** Opens the size picker where a table is about to go, and inserts it there. */
export function TableInsertPlugin() {
  const [editor] = useLexicalComposerContext();
  const { strings } = useEditorEnvironment();
  const [reference, setReference] = useState<ReferenceElement | null>(null);
  const anchor = useRef<NodeKey | null>(null);

  useEffect(
    () =>
      editor.registerCommand(
        OPEN_TABLE_COMMAND,
        () => {
          anchor.current = $anchorFor("table")?.getKey() ?? null;
          const element = anchor.current
            ? editor.getElementByKey(anchor.current)
            : null;
          setReference(element ?? selectionReference(editor.getRootElement()));
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor],
  );

  if (!reference) return null;
  const close = () => {
    setReference(null);
    focusText(editor);
  };
  const dismiss = (element: HTMLDivElement | null) => {
    if (!element) return undefined;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !element.contains(event.target))
        setReference(null);
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape" || !element.contains(event.target as Node))
        return;
      event.preventDefault();
      close();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  };
  return (
    <Floating
      reference={reference}
      placement="bottom-start"
      className="max-w-[calc(100vw-1rem)] p-3"
      label={strings.tableSizeGrid}
    >
      <div ref={dismiss}>
        <TableSizePicker
          strings={strings}
          onCancel={close}
          onInsert={(size) => {
            setReference(null);
            updateFromOutside(editor, () => {
              const at = anchor.current ? $getNodeByKey(anchor.current) : null;
              $insertTable(size, at?.isAttached() ? at : $anchorFor("table"));
            });
          }}
        />
      </div>
    </Floating>
  );
}
