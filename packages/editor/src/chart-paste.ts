import type { ChartData } from "@faridalms/domain/content";

import { MAX_CHART_LABELS, MAX_CHART_SERIES } from "@faridalms/domain/content";

/**
 * Cells copied from a spreadsheet, a row a line and a cell a tab, as Excel,
 * Google Sheets and LibreOffice put them on the clipboard. Null for words
 * that are one cell, which paste as they would anywhere.
 */
export function gridOf(text: string): string[][] | null {
  if (!/[\t\n]/u.test(text.replace(/\r?\n$/u, ""))) return null;
  const rows = text.replace(/\r?\n$/u, "").split(/\r?\n/u);
  return rows.map((row) => row.split("\t").map((cell) => cell.trim()));
}

const EASTERN = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

/**
 * A number as a spreadsheet shows it: Arabic-Indic digits, a thousands
 * separator, a decimal comma and a percent sign all read; null for words.
 */
export function numberOf(text: string): number | null {
  let plain = text
    .trim()
    .replaceAll(/[٠-٩۰-۹]/gu, (digit) =>
      String(Math.max(EASTERN.indexOf(digit), PERSIAN.indexOf(digit))),
    )
    .replaceAll(/[\s  ٬]/gu, "")
    .replace("٫", ".")
    .replace(/%$/u, "");
  if (!plain) return null;
  const comma = plain.lastIndexOf(",");
  const point = plain.lastIndexOf(".");
  if (comma >= 0 && point >= 0)
    plain =
      comma > point
        ? plain.replaceAll(".", "").replace(",", ".")
        : plain.replaceAll(",", "");
  else if (comma >= 0)
    plain = /^-?\d{1,3}(?:,\d{3})+$/u.test(plain)
      ? plain.replaceAll(",", "")
      : plain.replace(",", ".");
  if (!/^-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?$/iu.test(plain)) return null;
  const value = Number(plain);
  return Number.isFinite(value) ? value : null;
}

/**
 * Whether pasted cells are a whole table: names across the top and down
 * the side, which place it from the table's corner wherever it was pasted.
 */
function isWholeTable(grid: readonly string[][]): boolean {
  const [head, ...body] = grid;
  return (
    Boolean(head) &&
    body.length > 0 &&
    (head?.length ?? 0) > 1 &&
    (head ?? []).slice(1).some((cell) => cell && numberOf(cell) === null) &&
    body.some((row) => row[0] && numberOf(row[0]) === null)
  );
}

/**
 * A chart's table with cells pasted into it from where the caret stood:
 * the table's row 0 holds the series' names and its column 0 the
 * categories, every other cell a value. Rows and series are added as the
 * cells need them, as far as a chart holds; a word where a number goes
 * leaves the cell empty.
 */
export function pasteIntoChart(
  chart: ChartData,
  grid: readonly string[][],
  at: { row: number; column: number },
): ChartData {
  const from = isWholeTable(grid) ? { row: 0, column: 0 } : at;
  const most = chart.kind === "pie" ? 1 : MAX_CHART_SERIES;
  const rowsNeeded = Math.min(
    MAX_CHART_LABELS,
    Math.max(chart.labels.length, from.row + grid.length - 1),
  );
  // A pie draws one series; any others it keeps stay as they were.
  const seriesNeeded = Math.max(
    chart.series.length,
    Math.min(
      most,
      from.column + Math.max(...grid.map((row) => row.length)) - 1,
    ),
  );
  const labels = Array.from(
    { length: rowsNeeded },
    (_, index) => chart.labels[index] ?? "",
  );
  const series = Array.from({ length: seriesNeeded }, (_, index) => {
    const kept = chart.series[index];
    return {
      name: kept?.name ?? "",
      values: Array.from(
        { length: rowsNeeded },
        (__, row) => kept?.values[row] ?? null,
      ),
    };
  });
  grid.forEach((cells, offset) => {
    const row = from.row + offset;
    cells.forEach((cell, across) => {
      const column = from.column + across;
      if (row === 0 && column === 0) return;
      if (row === 0) {
        const named = column <= most ? series[column - 1] : undefined;
        if (named) named.name = cell.slice(0, 60);
        return;
      }
      if (row > rowsNeeded) return;
      if (column === 0) {
        labels[row - 1] = cell.slice(0, 60);
        return;
      }
      const target = column <= most ? series[column - 1] : undefined;
      if (target) target.values[row - 1] = numberOf(cell);
    });
  });
  return { ...chart, labels, series };
}
