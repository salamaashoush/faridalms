import { describe, expect, it } from "vitest";

import { feedOf, paged, pageWindow } from "./paging";

describe("numbered pages", () => {
  it("count at least one page and carry their size", () => {
    expect(paged([], 0, 1)).toEqual({
      rows: [],
      total: 0,
      page: 1,
      pages: 1,
      pageSize: 25,
    });
    expect(paged([1], 51, 3, 25).pages).toBe(3);
    expect(paged([1], 50, 2, 50).pages).toBe(1);
  });

  it("start each page where the one before ended", () => {
    expect(pageWindow(1)).toEqual({ limit: 25, offset: 0 });
    expect(pageWindow(3, 50)).toEqual({ limit: 50, offset: 100 });
  });
});

const cursor = (row: { id: number }) => row.id;

describe("feeds", () => {
  it("name where the next page starts only when a row past the limit came back", () => {
    const rows = [1, 2, 3, 4].map((id) => ({ id }));
    expect(feedOf(rows, 3, cursor)).toEqual({
      rows: rows.slice(0, 3),
      next: 3,
    });
    expect(feedOf(rows.slice(0, 3), 3, cursor)).toEqual({
      rows: rows.slice(0, 3),
      next: null,
    });
    expect(feedOf([], 3, cursor)).toEqual({ rows: [], next: null });
  });
});
