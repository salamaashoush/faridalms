import * as v from "valibot";

/**
 * Lists a person pages through by number carry `page`, and answer with a
 * `Page`. Feeds read newest first and carry instead the keyset of the row
 * the previous request ended on (`after`), answering with a `Feed`.
 */
export const PAGE_SIZE = 25;
export const PAGE_SIZES = [25, 50] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export const pageField = v.optional(
  v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10000)),
  1,
);

export const pageSizeField = v.optional(v.picklist(PAGE_SIZES), PAGE_SIZE);

export interface Page<Row> {
  rows: Row[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
}

export function pageWindow(page: number, pageSize: number = PAGE_SIZE) {
  return { limit: pageSize, offset: (page - 1) * pageSize };
}

export function paged<Row>(
  rows: Row[],
  total: number,
  page: number,
  pageSize: number = PAGE_SIZE,
): Page<Row> {
  return {
    rows,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
  };
}

export interface Feed<Row, Cursor> {
  rows: Row[];
  next: Cursor | null;
}

/**
 * A feed read one row past `limit`: that row only says another page
 * exists, and the cursor names the last row kept.
 */
export function feedOf<Row, Cursor>(
  fetched: Row[],
  limit: number,
  cursorOf: (row: Row) => Cursor,
): Feed<Row, Cursor> {
  const rows = fetched.slice(0, limit);
  const last = rows.at(-1);
  return {
    rows,
    next: fetched.length > limit && last ? cursorOf(last) : null,
  };
}
