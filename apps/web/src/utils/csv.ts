type Cell = string | number | null | undefined;

// A spreadsheet runs a cell that starts with one of these as a formula, so an
// exported name like "=HYPERLINK(...)" would execute on the reader's machine.
const FORMULA = /^[=+\-@\t\r]/;

const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && FORMULA.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: readonly (readonly Cell[])[]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/**
 * Saves the rows as a file. The byte-order mark is what makes Excel read the
 * file as UTF-8 rather than mangling Arabic names.
 */
export function downloadCsv(
  filename: string,
  rows: readonly (readonly Cell[])[],
) {
  const blob = new Blob([BYTE_ORDER_MARK, toCsv(rows)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
