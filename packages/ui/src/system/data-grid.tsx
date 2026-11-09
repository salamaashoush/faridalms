import type { KeyboardEvent, ReactNode } from "react";

import { CircleAlert, Plus, RotateCcw, X } from "lucide-react";
import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import type { ActionItem } from "./action-menu";

import { Button } from "../button";
import { Checkbox } from "../checkbox";
import { cn } from "../cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../select";
import { ActionMenu, phoneMenuItem } from "./action-menu";
import { useDesignSystem, useSystemStrings } from "./provider";

/** One column of figures or fields beside the column naming each row. */
export interface GridColumn<Row> {
  id: string;
  /** The heading as shown, short enough to sit over a figure. */
  header: ReactNode;
  /** Figures sit at the end of the cell in tabular digits. */
  numeric?: boolean;
  cell: (row: Row) => ReactNode;
}

/** Rows under one heading, such as a grade's three times of year. */
export interface GridGroup<Row> {
  id: string;
  title: string;
  /** A word beside the title, such as "Added" or "2 changed". */
  note?: ReactNode;
  /** What can be done to the whole group; shown while editing. */
  actions?: ActionItem[];
  rows: Row[];
}

/** What the grid says about the figures it shows, under the table. */
export interface GridLegend {
  /** How many figures differ from the baseline; the mark is explained when any do. */
  changed?: number;
  /** Some cells hold no figure; the dash is explained. */
  empty?: string;
}

/** The row that adds a grid up: its name, and a cell under each column that has one. */
export interface GridTotals {
  label: string;
  cells: Partial<Record<string, ReactNode>>;
}

/** A problem with one cell, listed under the grid and linked to the cell. */
export interface GridIssue {
  /** The id of the cell's control. */
  target: string;
  /** Which cell, when the message alone does not say, such as "Points for Meets". */
  label?: string;
  message: string;
}

export interface DataGridProps<Row> {
  /** Names the table and its scrolling region. */
  caption: string;
  /** The first column: what each row is. */
  rowHeader: { header: ReactNode; cell: (row: Row) => ReactNode };
  columns: GridColumn<Row>[];
  /** A heading spanning the figure columns, such as "Percentile". */
  columnGroup?: string;
  /** Rows under headings; a flat list is one group without a title. */
  groups: GridGroup<Row>[];
  rowKey: (row: Row) => string;
  /** The last cell of a row while editing, such as its Remove button. */
  rowEnd?: (row: Row) => ReactNode;
  /**
   * A line of its own under each row for what is too long for a column,
   * such as what work at a rubric level looks like.
   */
  rowDetail?: (row: Row) => ReactNode;
  editing?: boolean;
  /**
   * Where the figures come from when nobody has changed them, such as
   * "Hasbrouck and Tindal". A changed figure is marked and names it.
   */
  baselineName?: string;
  legend?: GridLegend;
  issues?: GridIssue[];
  /** A last row adding the figures up, such as weights to 100%. */
  totals?: GridTotals;
  /**
   * What the first column is held against while the rest scrolls: a card
   * (a settings section), a sheet, or the page itself.
   */
  surface?: GridSurface;
  /**
   * `container` squeezes the columns into the space there is; `content`
   * keeps every column as wide as it needs and scrolls the table in its
   * region, for a grid with a column per piece of work.
   */
  fit?: "container" | "content";
  /** Below the table while editing: the way to add a row. */
  footer?: ReactNode;
}

interface FocusedCell {
  id: string;
  label: string;
  baseline?: string;
  reset?: () => void;
}

interface GridContextValue {
  baselineName?: string;
  direction: "ltr" | "rtl";
  issues: ReadonlyMap<string, string>;
  report: (cell: FocusedCell | null) => void;
}

const GridContext = createContext<GridContextValue>({
  direction: "ltr",
  issues: new Map(),
  report: () => undefined,
});

const NO_ISSUES: GridIssue[] = [];

export type GridSurface = "card" | "sheet" | "page";

const SURFACE: Record<GridSurface, string> = {
  card: "bg-card",
  sheet: "bg-popover",
  page: "bg-background",
};

/** A cell's field: a calm tint until hovered or focused, ringed when invalid. */
const CELL_SURFACE = cn(
  "h-8 min-w-0 rounded-md border border-transparent bg-muted/60 text-sm outline-none transition-[color,box-shadow,border-color] max-md:h-10",
  "placeholder:text-muted-foreground hover:border-input focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/50",
  "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
);

const CELL = "[data-grid-cell]:not(:disabled)";

function focusCell(target: HTMLElement | null | undefined) {
  if (!target) return false;
  target.focus();
  if (target instanceof HTMLInputElement) target.select();
  return true;
}

/** The control in the same column of the next row with one, either way. */
function moveRow(cell: HTMLTableCellElement, step: 1 | -1) {
  const row = cell.parentElement as HTMLTableRowElement | null;
  const table = row?.closest("table");
  if (!row || !table) return false;
  const rows = [
    ...table.querySelectorAll<HTMLTableRowElement>("tr[data-grid-row]"),
  ];
  for (
    let at = rows.indexOf(row) + step;
    at >= 0 && at < rows.length;
    at += step
  ) {
    const target =
      rows[at]?.cells[cell.cellIndex]?.querySelector<HTMLElement>(CELL);
    if (target) return focusCell(target);
  }
  return false;
}

/** The next control along the row, in the order the cells are written. */
function moveColumn(cell: HTMLTableCellElement, step: 1 | -1) {
  const row = cell.parentElement as HTMLTableRowElement | null;
  if (!row) return false;
  for (
    let at = cell.cellIndex + step;
    at >= 0 && at < row.cells.length;
    at += step
  ) {
    const target = row.cells[at]?.querySelector<HTMLElement>(CELL);
    if (target) return focusCell(target);
  }
  return false;
}

/**
 * Whether a horizontal arrow moves to the next cell rather than the caret:
 * it does when the cell was just arrived at (its text all selected), is
 * empty, or has been typed into since; after F2 or a click inside a cell
 * already focused, arrows edit the text, as in a spreadsheet.
 */
function arrowsLeaveCell(input: HTMLInputElement) {
  if (input.dataset.gridMode === "edit") return false;
  const { value, selectionStart, selectionEnd } = input;
  if (value === "") return true;
  if (selectionStart === 0 && selectionEnd === value.length) return true;
  return input.dataset.gridMode === "enter";
}

/**
 * Focuses a control by its id once the change that draws it has rendered,
 * such as the first cell of a row just added or the Edit button after
 * Cancel. Call it beside the state change that draws the control.
 */
export function useFocusAfterRender(): (id: string) => void {
  const pending = useRef<string | null>(null);
  useEffect(() => {
    if (!pending.current) return;
    const target = document.getElementById(pending.current);
    pending.current = null;
    focusCell(target);
  });
  return useCallback((id: string) => {
    pending.current = id;
  }, []);
}

/**
 * The keys that move between a grid's cells, for a cell's own key handler:
 * arrows, Enter and Shift+Enter, F2 to edit the text in place.
 */
export function moveInGrid(
  event: KeyboardEvent<HTMLElement>,
  direction: "ltr" | "rtl",
) {
  const control = event.currentTarget;
  const input = control instanceof HTMLInputElement ? control : null;
  const cell = control.closest<HTMLTableCellElement>("td, th");
  if (!cell) return;
  const forward = direction === "rtl" ? "ArrowLeft" : "ArrowRight";
  const back = direction === "rtl" ? "ArrowRight" : "ArrowLeft";
  let moved = false;
  switch (event.key) {
    case "ArrowDown":
      moved = moveRow(cell, 1);
      break;
    case "ArrowUp":
      moved = moveRow(cell, -1);
      break;
    case "Enter":
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      moveRow(cell, event.shiftKey ? -1 : 1);
      return;
    case "F2": {
      if (!input) return;
      input.dataset.gridMode = "edit";
      const end = input.value.length;
      input.setSelectionRange(end, end);
      event.preventDefault();
      return;
    }
    case forward:
    case back:
      if (input && !arrowsLeaveCell(input)) return;
      moved = moveColumn(cell, event.key === forward ? 1 : -1);
      break;
    default:
      if (input && event.key.length === 1 && !input.dataset.gridMode)
        input.dataset.gridMode = "enter";
      return;
  }
  if (moved) event.preventDefault();
}

/**
 * A table of figures read at a glance and edited in place: rows under
 * group headings, figures in tabular digits at the end of their cells, a
 * mark on each figure that differs from where the figures came from, and
 * the problems with what was typed listed under it, each linked to its
 * cell. While editing, every cell is still a field in the tab order, so it
 * reads as a form; the arrow keys and Enter move between cells as a
 * spreadsheet does, mirrored in Arabic, and the line under the table says
 * which cell is focused, what it was, and offers it back.
 */
export function DataGrid<Row>({
  caption,
  rowHeader,
  columns,
  columnGroup,
  groups,
  rowKey,
  rowEnd,
  rowDetail,
  editing = false,
  baselineName,
  legend,
  issues = NO_ISSUES,
  totals,
  surface = "card",
  fit = "container",
  footer,
}: DataGridProps<Row>) {
  const held = cn("sticky start-0", SURFACE[surface]);
  const { direction, formatNumber } = useDesignSystem();
  const strings = useSystemStrings();
  const [focused, setFocused] = useState<FocusedCell | null>(null);
  const issueMap = useMemo(
    () => new Map(issues.map((issue) => [issue.target, issue.message])),
    [issues],
  );
  const context = useMemo(
    () => ({ baselineName, direction, issues: issueMap, report: setFocused }),
    [baselineName, direction, issueMap],
  );
  const width = 1 + columns.length + (editing && rowEnd ? 1 : 0);
  const titled = groups.some((group) => group.title);
  const changedNote =
    legend?.changed && baselineName
      ? strings.gridChanged(baselineName, formatNumber(legend.changed))
      : null;
  const focusedIssue = focused ? issueMap.get(focused.id) : undefined;
  return (
    <GridContext.Provider value={context}>
      <div className="grid min-w-0 gap-3">
        {columnGroup ? (
          <p className="-mb-2 text-end text-[13px] leading-[18px] text-muted-foreground">
            {columnGroup}
          </p>
        ) : null}
        <section
          aria-label={caption}
          tabIndex={editing ? undefined : 0}
          className="min-w-0 overflow-x-auto rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <table
            className={cn(
              "w-full border-collapse text-sm leading-5",
              fit === "content" && "min-w-max",
            )}
          >
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr className="border-b text-[13px] leading-[18px] text-muted-foreground">
                <th
                  scope="col"
                  className={cn(
                    held,
                    "py-2 pe-3 text-start font-medium whitespace-nowrap max-md:pe-2",
                  )}
                >
                  <span className="max-md:sr-only">{rowHeader.header}</span>
                </th>
                {columns.map((column) => (
                  <th
                    key={column.id}
                    scope="col"
                    className={cn(
                      "px-1 py-2 font-medium whitespace-nowrap",
                      column.numeric ? "text-end" : "text-start",
                    )}
                  >
                    {column.header}
                  </th>
                ))}
                {editing && rowEnd ? (
                  <th scope="col" className="w-10">
                    <span className="sr-only">{strings.actions}</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody
                key={group.id}
                className={cn(titled && "border-b last:border-b-0")}
              >
                {group.title ? (
                  <tr>
                    <th
                      scope="rowgroup"
                      colSpan={width}
                      className="pt-4 pb-1 text-start font-normal"
                    >
                      <span className="flex min-h-8 items-center gap-2">
                        <span className="font-semibold whitespace-nowrap">
                          {group.title}
                        </span>
                        {group.note ? (
                          <span className="text-[13px] leading-[18px] text-muted-foreground">
                            {group.note}
                          </span>
                        ) : null}
                        {editing && group.actions?.length ? (
                          <ActionMenu
                            label={strings.rowActions(group.title)}
                            actions={group.actions}
                            className="ms-auto max-md:size-10"
                          />
                        ) : null}
                      </span>
                    </th>
                  </tr>
                ) : null}
                {group.rows.map((row) => (
                  <Fragment key={rowKey(row)}>
                    <tr
                      data-grid-row=""
                      className={cn(
                        !titled && !rowDetail && "border-b last:border-b-0",
                      )}
                    >
                      <th
                        scope="row"
                        className={cn(
                          held,
                          "pe-3 text-start font-normal whitespace-nowrap max-md:pe-2",
                          editing ? "py-1" : "py-2",
                          titled && "ps-3 max-md:ps-1",
                        )}
                      >
                        {rowHeader.cell(row)}
                      </th>
                      {columns.map((column) => (
                        <td
                          key={column.id}
                          className={cn(
                            "px-1 max-md:px-0.5",
                            editing ? "py-1" : "py-2",
                            column.numeric &&
                              "text-end whitespace-nowrap tabular-nums",
                          )}
                        >
                          {column.cell(row)}
                        </td>
                      ))}
                      {editing && rowEnd ? (
                        <td className="py-1 ps-1 text-end">{rowEnd(row)}</td>
                      ) : null}
                    </tr>
                    {rowDetail ? (
                      <tr className={cn(!titled && "border-b last:border-b-0")}>
                        <td colSpan={width} className="pt-0.5 pb-2">
                          {rowDetail(row)}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            ))}
            {totals ? (
              <tfoot className="border-t font-medium">
                <tr>
                  <th
                    scope="row"
                    className={cn(
                      held,
                      "py-2 pe-3 text-start whitespace-nowrap",
                    )}
                  >
                    {totals.label}
                  </th>
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={cn(
                        "py-2",
                        column.numeric
                          ? "pe-3 text-end whitespace-nowrap tabular-nums"
                          : "px-1",
                      )}
                    >
                      {totals.cells[column.id] ?? null}
                    </td>
                  ))}
                  {editing && rowEnd ? <td>{null}</td> : null}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </section>
        {editing ? (
          <p
            className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-[18px] text-muted-foreground"
            data-slot="grid-status"
          >
            {focused ? (
              <>
                <span className="font-medium text-foreground">
                  {focused.label}
                </span>
                {focused.baseline !== undefined && baselineName ? (
                  <span>
                    {strings.gridBaseline(baselineName, focused.baseline)}
                  </span>
                ) : null}
                {focused.reset ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    className="max-md:h-8"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={focused.reset}
                  >
                    <RotateCcw aria-hidden />
                    {strings.gridReset}
                  </Button>
                ) : null}
                {focusedIssue ? (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <CircleAlert className="size-3.5" aria-hidden />
                    {focusedIssue}
                  </span>
                ) : null}
              </>
            ) : (
              strings.gridKeys
            )}
          </p>
        ) : null}
        {changedNote || legend?.empty ? (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] leading-[18px] text-muted-foreground">
            {changedNote ? (
              <span className="inline-flex items-center gap-1.5">
                <ChangedDot />
                {changedNote}
              </span>
            ) : null}
            {legend?.empty ? (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden>—</span>
                {legend.empty}
              </span>
            ) : null}
          </p>
        ) : null}
        {issues.length ? (
          <div
            role="alert"
            className="grid gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm leading-5 text-destructive"
          >
            <p className="flex items-center gap-2 font-medium">
              <CircleAlert className="size-4 shrink-0" aria-hidden />
              {strings.errorSummaryTitle}
            </p>
            <ul className="grid gap-0.5 ps-6">
              {issues.map((issue) => (
                <li key={issue.target}>
                  <a
                    href={`#${issue.target}`}
                    className="underline underline-offset-2"
                    onClick={(event) => {
                      event.preventDefault();
                      focusCell(document.getElementById(issue.target));
                    }}
                  >
                    {issue.label
                      ? strings.errorSummaryItem(issue.label, issue.message)
                      : issue.message}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {editing && footer ? <div>{footer}</div> : null}
      </div>
    </GridContext.Provider>
  );
}

function ChangedDot() {
  return (
    <span
      aria-hidden
      className="inline-block size-1.5 shrink-0 rounded-full bg-primary"
    />
  );
}

export interface GridFigureProps {
  value: number | null;
  /** The figure where the values came from; marked when it differs. */
  baseline?: number | null;
}

/** A figure read in the grid: the reader's digits, a dash for none, a mark when changed. */
export function GridFigure({ value, baseline }: GridFigureProps) {
  const { formatNumber } = useDesignSystem();
  const strings = useSystemStrings();
  const { baselineName } = useContext(GridContext);
  const changed = baseline !== undefined && baseline !== value;
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {changed ? <ChangedDot /> : null}
      {value === null ? (
        <span className="text-muted-foreground">
          <span aria-hidden>—</span>
          <span className="sr-only">{strings.gridNoFigure}</span>
        </span>
      ) : (
        formatNumber(value)
      )}
      {changed && baselineName ? (
        <span className="sr-only">
          {strings.gridBaseline(
            baselineName,
            baseline === null ? strings.gridNoFigure : formatNumber(baseline),
          )}
        </span>
      ) : null}
    </span>
  );
}

const ARABIC_INDIC = /[٠-٩]/g;
const PERSIAN = /[۰-۹]/g;
const SEPARATORS = /[.٫,]/g;
const NOT_DIGIT = /[^0-9٠-٩۰-۹]/g;
const NOT_FIGURE = /[^0-9٠-٩۰-۹.٫,]/g;

/**
 * A number as typed in either script: Arabic-Indic and Persian digits read
 * as their Western values, and the Arabic decimal separator as a point.
 * Null for nothing typed, NaN for text that is not a number.
 */
export function readNumber(text: string): number | null {
  const plain = text
    .trim()
    .replace(ARABIC_INDIC, (char) => String(char.charCodeAt(0) - 0x660))
    .replace(PERSIAN, (char) => String(char.charCodeAt(0) - 0x6f0))
    .replace(SEPARATORS, ".");
  if (plain === "") return null;
  return /^\d*\.?\d*$/.test(plain) && plain !== "." ? Number(plain) : NaN;
}

/** A number in the reader's digits, without grouping, as a field shows it. */
export function writeNumber(
  value: number,
  formatNumber: (value: number) => string,
): string {
  const point = formatNumber(1.5).replace(/[^.٫,]/g, "") || ".";
  return String(value).replace(/[.\d]/g, (char) =>
    char === "." ? point : formatNumber(Number(char)),
  );
}

export interface NumberCellProps {
  id: string;
  /** The cell's full name, such as "Grade 2, autumn, 50th percentile". */
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  /** The figure where the values came from; the cell is marked when it differs and can go back to it. */
  baseline?: number | null;
  /** Digits allowed after the point; none for whole numbers. */
  decimals?: number;
  placeholder?: string;
}

/**
 * A figure typed in a grid cell: no spinner, digits at the end in tabular
 * figures, in the reader's digits. Arriving selects the whole figure so
 * typing replaces it; Escape puts back the figure the cell had when it
 * was reached.
 */
export function NumberCell({
  id,
  label,
  value,
  onChange,
  baseline,
  decimals = 0,
  placeholder,
}: NumberCellProps) {
  const { formatNumber } = useDesignSystem();
  const strings = useSystemStrings();
  const { baselineName, direction, issues, report } = useContext(GridContext);
  const [text, setText] = useState<string | null>(null);
  const arrived = useRef<number | null>(null);
  const fresh = useRef(false);
  const describedBy = useId();
  const issue = issues.get(id);
  const changed = baseline !== undefined && baseline !== value;
  const written = (figure: number | null) =>
    figure === null ? "" : writeNumber(figure, formatNumber);
  const baselineText =
    baseline === undefined
      ? undefined
      : baseline === null
        ? strings.gridNoFigure
        : formatNumber(baseline);
  const reportFocus = (current: number | null) =>
    report({
      id,
      label,
      baseline: baselineText,
      reset:
        baseline !== undefined && baseline !== current
          ? () => {
              onChange(baseline);
              setText(written(baseline));
              report({ id, label, baseline: baselineText });
            }
          : undefined,
    });
  return (
    <span className="relative inline-flex">
      {changed ? (
        <span className="pointer-events-none absolute start-1 top-1/2 -translate-y-1/2">
          <ChangedDot />
        </span>
      ) : null}
      <input
        id={id}
        type="text"
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        autoComplete="off"
        data-grid-cell=""
        aria-label={label}
        aria-invalid={issue ? true : undefined}
        aria-describedby={changed || issue ? describedBy : undefined}
        placeholder={placeholder}
        value={text ?? written(value)}
        className={cn(
          CELL_SURFACE,
          "w-16 ps-3 pe-2 text-end tabular-nums max-md:w-11 max-md:ps-2 max-md:pe-1.5",
        )}
        onFocus={(event) => {
          arrived.current = value;
          fresh.current = true;
          delete event.currentTarget.dataset.gridMode;
          setText(written(value));
          event.currentTarget.select();
          reportFocus(value);
        }}
        onMouseDown={(event) => {
          if (document.activeElement === event.currentTarget)
            event.currentTarget.dataset.gridMode = "edit";
        }}
        onMouseUp={(event) => {
          if (!fresh.current) return;
          fresh.current = false;
          event.preventDefault();
        }}
        onBlur={(event) => {
          delete event.currentTarget.dataset.gridMode;
          setText(null);
          report(null);
        }}
        onChange={(event) => {
          fresh.current = false;
          const typed = event.target.value.replace(
            decimals > 0 ? NOT_FIGURE : NOT_DIGIT,
            "",
          );
          const figure = readNumber(typed);
          if (Number.isNaN(figure)) return;
          const places = typed.split(/[.٫,]/)[1] ?? "";
          if (places.length > decimals) return;
          const rounded =
            figure === null
              ? null
              : Number(figure.toFixed(Math.max(0, decimals)));
          setText(typed);
          if (rounded !== value) onChange(rounded);
          reportFocus(rounded);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") {
            moveInGrid(event, direction);
            return;
          }
          if (arrived.current === value) return;
          event.preventDefault();
          event.stopPropagation();
          onChange(arrived.current);
          setText(written(arrived.current));
          event.currentTarget.select();
          reportFocus(arrived.current);
        }}
      />
      {changed || issue ? (
        <span id={describedBy} className="sr-only">
          {[
            issue,
            changed && baselineName && baselineText !== undefined
              ? strings.gridBaseline(baselineName, baselineText)
              : null,
          ]
            .filter(Boolean)
            .join(". ")}
        </span>
      ) : null}
    </span>
  );
}

export interface TextCellProps {
  id: string;
  /** The cell's full name, such as "Name of grade 2". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  /** Codes and Latin names stay left to right; free text takes its own. */
  dir?: "auto" | "ltr";
  lang?: string;
  /** `fill` takes the width the figures leave; `note` is a sentence's room. */
  size?: "fill" | "note";
}

/**
 * A short name typed in a grid cell, such as a grade's label. It fills its
 * column, so names take the width the figures leave. Arriving selects the
 * text; once typed into, the arrows move the caret, and Escape puts back
 * what the cell held when it was reached.
 */
export function TextCell({
  id,
  label,
  value,
  onChange,
  placeholder,
  maxLength,
  dir = "auto",
  lang,
  size = "fill",
}: TextCellProps) {
  const { direction, issues, report } = useContext(GridContext);
  const arrived = useRef(value);
  const fresh = useRef(false);
  const describedBy = useId();
  const issue = issues.get(id);
  return (
    <span className="flex">
      <input
        id={id}
        type="text"
        autoComplete="off"
        data-grid-cell=""
        dir={dir}
        lang={lang}
        maxLength={maxLength}
        aria-label={label}
        aria-invalid={issue ? true : undefined}
        aria-describedby={issue ? describedBy : undefined}
        placeholder={placeholder}
        value={value}
        className={cn(
          CELL_SURFACE,
          "px-2 text-start",
          size === "fill" ? "w-full min-w-16" : "w-64 max-md:w-56",
        )}
        onFocus={(event) => {
          arrived.current = value;
          fresh.current = true;
          delete event.currentTarget.dataset.gridMode;
          event.currentTarget.select();
          report({ id, label });
        }}
        onMouseDown={(event) => {
          if (document.activeElement === event.currentTarget)
            event.currentTarget.dataset.gridMode = "edit";
        }}
        onMouseUp={(event) => {
          if (!fresh.current) return;
          fresh.current = false;
          event.preventDefault();
        }}
        onBlur={(event) => {
          delete event.currentTarget.dataset.gridMode;
          report(null);
        }}
        onChange={(event) => {
          fresh.current = false;
          event.currentTarget.dataset.gridMode = "edit";
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") {
            moveInGrid(event, direction);
            return;
          }
          if (arrived.current === value) return;
          event.preventDefault();
          event.stopPropagation();
          delete event.currentTarget.dataset.gridMode;
          onChange(arrived.current);
        }}
      />
      {issue ? (
        <span id={describedBy} className="sr-only">
          {issue}
        </span>
      ) : null}
    </span>
  );
}

export interface NoteCellProps {
  id: string;
  /** The cell's full name, such as "What work at Meets looks like". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}

/**
 * A few sentences written in a row's own line (`DataGrid rowDetail`),
 * such as what work at a level looks like. Its text takes its own
 * direction; Enter starts a new line, so the arrows and Enter stay the
 * text's, and Escape puts back what it held when it was reached.
 */
export function NoteCell({
  id,
  label,
  value,
  onChange,
  placeholder,
  maxLength,
}: NoteCellProps) {
  const { issues, report } = useContext(GridContext);
  const arrived = useRef(value);
  const describedBy = useId();
  const issue = issues.get(id);
  return (
    <span className="flex">
      <textarea
        id={id}
        dir="auto"
        rows={2}
        maxLength={maxLength}
        aria-label={label}
        aria-invalid={issue ? true : undefined}
        aria-describedby={issue ? describedBy : undefined}
        placeholder={placeholder}
        value={value}
        className={cn(
          CELL_SURFACE,
          "h-auto min-h-14 w-full resize-y px-2 py-1.5 leading-5 max-md:h-auto",
        )}
        onFocus={() => {
          arrived.current = value;
          report({ id, label });
        }}
        onBlur={() => report(null)}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || arrived.current === value) return;
          event.preventDefault();
          event.stopPropagation();
          onChange(arrived.current);
        }}
      />
      {issue ? (
        <span id={describedBy} className="sr-only">
          {issue}
        </span>
      ) : null}
    </span>
  );
}

/** One choice of a `SelectCell`. */
export interface GridOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectCellProps<T extends string> {
  id: string;
  /** The cell's full name, such as "Kind of item 2". */
  label: string;
  value: T;
  options: readonly GridOption<T>[];
  onChange: (value: T) => void;
  /** `fill` takes the column's width; `code` is as narrow as a currency. */
  size?: "fill" | "code";
}

/**
 * A choice from a short fixed list in a grid cell, such as a checklist
 * item's kind: the same calm tint as the other cells, opening the design's
 * own list. The arrows belong to the list once it opens, so they move
 * between cells only from the cells beside it.
 */
export function SelectCell<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  size = "fill",
}: SelectCellProps<T>) {
  const { report } = useContext(GridContext);
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => {
        const match = options.find((option) => option.value === next);
        if (match) onChange(match.value);
      }}
    >
      <SelectTrigger
        id={id}
        data-grid-cell=""
        aria-label={label}
        onFocus={() => report({ id, label })}
        onBlur={() => report(null)}
        className={cn(
          "h-8 border-transparent bg-muted/60 shadow-none hover:border-input max-md:h-10 dark:bg-muted/60",
          size === "fill" ? "w-full min-w-28" : "w-20",
        )}
      >
        <SelectValue className="block min-w-0 truncate" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface CheckCellProps {
  id: string;
  /** The cell's full name, such as "Item 2 is required". */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** A yes or no in a grid cell, toggled by Space; the arrows leave it. */
export function CheckCell({ id, label, checked, onChange }: CheckCellProps) {
  const { direction, report } = useContext(GridContext);
  return (
    <span className="flex min-h-8 items-center justify-center max-md:min-h-10">
      <Checkbox
        id={id}
        data-grid-cell=""
        aria-label={label}
        checked={checked}
        onCheckedChange={(next) => onChange(next)}
        onFocus={() => report({ id, label })}
        onBlur={() => report(null)}
        onKeyDown={(event) => moveInGrid(event, direction)}
      />
    </span>
  );
}

export interface TimeCellProps {
  id: string;
  /** The cell's full name, such as "Starts, Period 3". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The earliest time it may take, such as the start for an end. */
  min?: string;
}

/**
 * A time of day in a grid cell, in the browser's own time field, which
 * keeps the arrow keys for its hours and minutes; times run left to right
 * in either script.
 */
export function TimeCell({ id, label, value, onChange, min }: TimeCellProps) {
  const { issues, report } = useContext(GridContext);
  const describedBy = useId();
  const issue = issues.get(id);
  return (
    <span className="flex">
      <input
        id={id}
        type="time"
        dir="ltr"
        data-grid-cell=""
        aria-label={label}
        aria-invalid={issue ? true : undefined}
        aria-describedby={issue ? describedBy : undefined}
        min={min}
        value={value}
        className={cn(
          CELL_SURFACE,
          "w-[5.25rem] px-1.5 tabular-nums [&::-webkit-calendar-picker-indicator]:hidden",
        )}
        onFocus={() => report({ id, label })}
        onBlur={() => report(null)}
        onChange={(event) => onChange(event.target.value)}
      />
      {issue ? (
        <span id={describedBy} className="sr-only">
          {issue}
        </span>
      ) : null}
    </span>
  );
}

export interface DateCellProps {
  id: string;
  /** The cell's full name, such as "Period from, line 2". */
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** The earliest day it may take, such as the start for an end. */
  min?: string;
}

/**
 * A day in a grid cell, in the browser's own date field with its picker,
 * which keeps the arrow keys for its day, month and year.
 */
export function DateCell({ id, label, value, onChange, min }: DateCellProps) {
  const { issues, report } = useContext(GridContext);
  const describedBy = useId();
  const issue = issues.get(id);
  return (
    <span className="flex">
      <input
        id={id}
        type="date"
        data-grid-cell=""
        aria-label={label}
        aria-invalid={issue ? true : undefined}
        aria-describedby={issue ? describedBy : undefined}
        min={min}
        value={value}
        className={cn(CELL_SURFACE, "w-[9rem] px-2 tabular-nums")}
        onFocus={() => report({ id, label })}
        onBlur={() => report(null)}
        onChange={(event) => onChange(event.target.value)}
      />
      {issue ? (
        <span id={describedBy} className="sr-only">
          {issue}
        </span>
      ) : null}
    </span>
  );
}

/** One choice of a row to add. */
export interface GridAddChoice {
  value: string;
  label: string;
}

export interface GridAddButtonProps {
  label: string;
  /** What can be added; without them the button adds a row at once. */
  choices?: GridAddChoice[];
  onAdd: (value?: string) => void;
  /** No more rows may be added, such as at a list's limit. */
  disabled?: boolean;
}

/**
 * Adds a row under the grid: at once for a list of like rows, or from a
 * menu of what is not there yet, such as the grades still to write.
 */
export function GridAddButton({
  label,
  choices,
  onAdd,
  disabled = false,
}: GridAddButtonProps) {
  const button = (
    <Button
      type="button"
      variant="outline"
      className="max-md:h-10"
      disabled={disabled || (choices !== undefined && choices.length === 0)}
      onClick={choices ? undefined : () => onAdd()}
    >
      <Plus aria-hidden />
      {label}
    </Button>
  );
  if (!choices) return button;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={button} />
      <DropdownMenuContent align="start" className="w-auto min-w-44">
        {choices.map((choice) => (
          <Fragment key={choice.value}>
            <DropdownMenuItem
              className={phoneMenuItem}
              onClick={() => onAdd(choice.value)}
            >
              {choice.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface GridRemoveButtonProps {
  /** Names the row it removes, such as "Remove grade 3". */
  label: string;
  onRemove: () => void;
  /** The list is at its smallest. */
  disabled?: boolean;
}

/**
 * The quiet x at the end of a row in a list of like rows (bands, lines,
 * periods), shown only while editing; a grid of a fixed shape removes from
 * its group's menu instead.
 */
export function GridRemoveButton({
  label,
  onRemove,
  disabled = false,
}: GridRemoveButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      disabled={disabled}
      onClick={onRemove}
      className="text-muted-foreground max-md:size-10"
    >
      <X aria-hidden />
    </Button>
  );
}
