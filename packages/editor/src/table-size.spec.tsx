import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EditorStrings } from "./strings";

import { TableSizePicker } from "./plugins/table-size";

const strings = {
  tableSize: (rows: number, columns: number) => `${rows} × ${columns} table`,
  tableSizeGrid: "Table size",
  tableHeaderRow: "Header row",
  tableInsertButton: "Insert table",
  tableRows: "Rows",
  tableColumns: "Columns",
  tableRowsLess: "One row fewer",
  tableRowsMore: "One row more",
  tableColumnsLess: "One column fewer",
  tableColumnsMore: "One column more",
} as EditorStrings;

describe("table size picker", () => {
  it("inserts the size a pointer sweeps to, with a header row", () => {
    const onInsert = vi.fn();
    render(
      <TableSizePicker
        strings={strings}
        onInsert={onInsert}
        onCancel={vi.fn()}
      />,
    );
    const cell = screen.getByRole("button", { name: "4 × 5 table" });
    fireEvent.pointerEnter(cell);
    expect(screen.getByText("4 × 5 table", { selector: "p" })).toBeTruthy();
    fireEvent.click(cell);
    expect(onInsert).toHaveBeenCalledWith({
      rows: 4,
      columns: 5,
      header: true,
    });
  });

  it("moves its corner with the arrow keys, keeping focus on it, and inserts on Enter without a header row", () => {
    const onInsert = vi.fn();
    render(
      <TableSizePicker
        strings={strings}
        onInsert={onInsert}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Header row"));
    const grid = screen.getByRole("button", { name: "3 × 3 table" });
    fireEvent.keyDown(grid, { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByRole("button", { name: "4 × 3 table" }), {
      key: "ArrowRight",
    });
    fireEvent.keyDown(screen.getByRole("button", { name: "4 × 4 table" }), {
      key: "ArrowRight",
    });
    const corner = screen.getByRole("button", { name: "4 × 5 table" });
    expect(document.activeElement).toBe(corner);
    fireEvent.keyDown(corner, { key: "Enter" });
    expect(onInsert).toHaveBeenCalledWith({
      rows: 4,
      columns: 5,
      header: false,
    });
  });

  it("cancels on Escape", () => {
    const onCancel = vi.fn();
    render(
      <TableSizePicker
        strings={strings}
        onInsert={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(screen.getByRole("button", { name: "3 × 3 table" }), {
      key: "Escape",
    });
    expect(onCancel).toHaveBeenCalled();
  });
});
