import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { GridColumn, GridIssue } from "./data-grid";

import {
  DataGrid,
  GridAddButton,
  GridFigure,
  GridRemoveButton,
  NumberCell,
  readNumber,
  TextCell,
  writeNumber,
} from "./data-grid";
import { ENGLISH } from "./english";
import { renderWithSystem } from "./testing";

interface Row {
  grade: string;
  season: string;
  low: number | null;
  high: number | null;
}

const ROWS: Row[] = [
  { grade: "Grade 1", season: "Autumn", low: null, high: null },
  { grade: "Grade 1", season: "Winter", low: 9, high: 97 },
  { grade: "Grade 2", season: "Autumn", low: 23, high: 111 },
];

const SOURCE: Row[] = [
  { grade: "Grade 1", season: "Autumn", low: null, high: null },
  { grade: "Grade 1", season: "Winter", low: 9, high: 90 },
  { grade: "Grade 2", season: "Autumn", low: 23, high: 111 },
];

type Key = "low" | "high";

const idOf = (row: Row, key: Key) => `${row.grade}-${row.season}-${key}`;

const baseline = (row: Row, key: Key) =>
  SOURCE.find(
    (item) => item.grade === row.grade && item.season === row.season,
  )?.[key];

function figureColumns(
  editing: boolean,
  rows: Row[],
  onRows: (rows: Row[]) => void,
): GridColumn<Row>[] {
  return (["low", "high"] as const).map((key) => ({
    id: key,
    header: key === "low" ? "10th" : "90th",
    numeric: true,
    cell: (row) =>
      editing ? (
        <NumberCell
          id={idOf(row, key)}
          label={`${row.grade}, ${row.season}, ${key}`}
          value={row[key]}
          baseline={baseline(row, key)}
          onChange={(value) =>
            onRows(
              rows.map((item) =>
                item === row ? { ...item, [key]: value } : item,
              ),
            )
          }
        />
      ) : (
        <GridFigure value={row[key]} baseline={baseline(row, key)} />
      ),
  }));
}

interface GridProps {
  editing?: boolean;
  issues?: GridIssue[];
  direction?: "ltr" | "rtl";
  onRows?: (rows: Row[]) => void;
}

function Grid({ editing = false, issues, onRows }: GridProps) {
  const [rows, setRows] = useState(ROWS);
  const columns = figureColumns(editing, rows, (next) => {
    setRows(next);
    onRows?.(next);
  });
  return (
    <DataGrid<Row>
      caption="Norms by grade"
      editing={editing}
      rowHeader={{ header: "Time of year", cell: (row) => row.season }}
      columnGroup="Words a minute, by percentile"
      columns={columns}
      groups={["Grade 1", "Grade 2"].map((grade) => ({
        id: grade,
        title: grade,
        actions: [{ label: `Remove ${grade}`, onSelect: vi.fn() }],
        rows: rows.filter((row) => row.grade === grade),
      }))}
      rowKey={(row) => `${row.grade}:${row.season}`}
      baselineName="Hasbrouck and Tindal"
      legend={{ changed: 1, empty: "No norm for that time of year" }}
      issues={issues}
    />
  );
}

const cell = (name: string) => screen.getByRole("textbox", { name });

describe("DataGrid", () => {
  it("reads figures under their group's heading, a dash for none, and marks a changed one", () => {
    renderWithSystem(<Grid />);
    const table = screen.getByRole("table", { name: "Norms by grade" });
    expect(
      within(table).getByRole("rowheader", { name: "Grade 1" }),
    ).toBeVisible();
    expect(within(table).getAllByText("No figure")).toHaveLength(2);
    expect(
      within(table).getByText("Hasbrouck and Tindal: 90"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("1 changed from Hasbrouck and Tindal"),
    ).toBeVisible();
    expect(screen.getByText("No norm for that time of year")).toBeVisible();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Actions for/ }),
    ).not.toBeInTheDocument();
  });

  it("edits figures in plain text fields, without spinners, offering each group's actions", () => {
    renderWithSystem(<Grid editing />);
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
    expect(cell("Grade 1, Winter, high")).toHaveValue("97");
    expect(cell("Grade 1, Winter, high")).toHaveAttribute(
      "inputmode",
      "numeric",
    );
    expect(
      screen.getByRole("button", { name: "Actions for Grade 1" }),
    ).toBeVisible();
  });

  it("takes digits only, in either script, and Escape puts back what the cell had", async () => {
    const onRows = vi.fn();
    renderWithSystem(<Grid editing onRows={onRows} />);
    const high = cell("Grade 2, Autumn, high");
    await userEvent.click(high);
    await userEvent.keyboard("1a٢3");
    expect(high).toHaveValue("1٢3");
    expect(onRows).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ high: 123 })]),
    );
    await userEvent.keyboard("{Escape}");
    expect(high).toHaveValue("111");
  });

  it("moves down a column across groups with the arrows and Enter, and along a row from a selected cell", async () => {
    renderWithSystem(<Grid editing />);
    await userEvent.click(cell("Grade 1, Autumn, low"));
    await userEvent.keyboard("{ArrowDown}");
    expect(cell("Grade 1, Winter, low")).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(cell("Grade 2, Autumn, low")).toHaveFocus();
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    expect(cell("Grade 1, Winter, low")).toHaveFocus();
    await userEvent.keyboard("{ArrowRight}");
    expect(cell("Grade 1, Winter, high")).toHaveFocus();
    await userEvent.keyboard("{F2}{ArrowLeft}");
    expect(cell("Grade 1, Winter, high")).toHaveFocus();
  });

  it("mirrors the arrows along a row in Arabic", async () => {
    renderWithSystem(<Grid editing />, {
      system: { ...ENGLISH, direction: "rtl" },
    });
    await userEvent.click(cell("Grade 1, Winter, low"));
    await userEvent.keyboard("{ArrowLeft}");
    expect(cell("Grade 1, Winter, high")).toHaveFocus();
  });

  it("says which cell is focused, what it was, and puts the figure back", async () => {
    const onRows = vi.fn();
    renderWithSystem(<Grid editing onRows={onRows} />);
    const changed = cell("Grade 1, Winter, high");
    expect(changed).toHaveAccessibleDescription("Hasbrouck and Tindal: 90");
    await userEvent.click(changed);
    expect(
      screen.getByText("Grade 1, Winter, high", { selector: "span" }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Put it back" }));
    expect(changed).toHaveValue("90");
    expect(changed).not.toHaveAccessibleDescription();
  });

  it("lists the problems under the grid, each taking the person to its cell", async () => {
    renderWithSystem(
      <Grid
        editing
        issues={[
          {
            target: "Grade 2-Autumn-high",
            message: "Grade 2, Autumn, high is lower than the low.",
          },
        ]}
      />,
    );
    const target = cell("Grade 2, Autumn, high");
    expect(target).toHaveAttribute("aria-invalid", "true");
    await userEvent.click(
      within(screen.getByRole("alert")).getByRole("link", {
        name: "Grade 2, Autumn, high is lower than the low.",
      }),
    );
    expect(target).toHaveFocus();
  });
});

interface Band {
  key: string;
  label: string;
  weight: number | null;
}

const BANDS: Band[] = [
  { key: "a", label: "Coursework", weight: 40 },
  { key: "b", label: "Exams", weight: 60 },
];

function bandGrid(
  rows: Band[],
  onRows: (rows: Band[]) => void,
  onRemove: (key: string) => void,
) {
  const set = (key: string, change: Partial<Band>) =>
    onRows(rows.map((row) => (row.key === key ? { ...row, ...change } : row)));
  return {
    rowHeader: {
      header: "Name",
      cell: (row: Band) => (
        <TextCell
          id={`name-${row.key}`}
          label={`Name of ${row.key}`}
          value={row.label}
          onChange={(label) => set(row.key, { label })}
        />
      ),
    },
    columns: [
      {
        id: "weight",
        header: "Weight",
        numeric: true,
        cell: (row: Band) => (
          <NumberCell
            id={`weight-${row.key}`}
            label={`Weight of ${row.key}`}
            decimals={2}
            value={row.weight}
            onChange={(weight) => set(row.key, { weight })}
          />
        ),
      },
    ],
    rowEnd: (row: Band) => (
      <GridRemoveButton
        label={`Remove ${row.key}`}
        disabled={rows.length <= 1}
        onRemove={() => onRemove(row.key)}
      />
    ),
  };
}

function BandList() {
  const [rows, setRows] = useState(BANDS);
  return (
    <DataGrid<Band>
      caption="Weights"
      editing
      {...bandGrid(rows, setRows, (key) =>
        setRows(rows.filter((row) => row.key !== key)),
      )}
      groups={[{ id: "all", title: "", rows }]}
      rowKey={(row) => row.key}
      totals={{
        label: "Total",
        cells: {
          weight: String(rows.reduce((sum, row) => sum + (row.weight ?? 0), 0)),
        },
      }}
    />
  );
}

describe("DataGrid as a list of like rows", () => {
  it("names each row from a text cell, adds the figures up, and removes a row by its own button", async () => {
    renderWithSystem(<BandList />);
    const table = screen.getByRole("table", { name: "Weights" });
    expect(
      within(table).getByRole("rowheader", { name: "Total" }),
    ).toBeVisible();
    expect(within(table).getByText("100")).toBeVisible();
    await userEvent.click(screen.getByRole("textbox", { name: "Weight of b" }));
    await userEvent.keyboard("5.255");
    expect(screen.getByRole("textbox", { name: "Weight of b" })).toHaveValue(
      "5.25",
    );
    expect(within(table).getByText("45.25")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Remove a" }));
    expect(
      screen.queryByRole("textbox", { name: "Name of a" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove b" })).toBeDisabled();
  });

  it("edits a name in place, its arrows moving the caret once typed, and Escape puts it back", async () => {
    renderWithSystem(<BandList />);
    const name = screen.getByRole("textbox", { name: "Name of a" });
    await userEvent.click(name);
    await userEvent.keyboard("Tasks{ArrowRight}");
    expect(name).toHaveFocus();
    expect(name).toHaveValue("Tasks");
    await userEvent.keyboard("{Escape}");
    expect(name).toHaveValue("Coursework");
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("textbox", { name: "Name of b" })).toHaveFocus();
  });
});

describe("GridAddButton", () => {
  it("adds from a menu of what is not there yet", async () => {
    const onAdd = vi.fn();
    renderWithSystem(
      <GridAddButton
        label="Add grade"
        choices={[{ value: "grade_3", label: "Grade 3" }]}
        onAdd={onAdd}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Add grade" }));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Grade 3" }),
    );
    expect(onAdd).toHaveBeenCalledWith("grade_3");
  });

  it("adds a row at once without choices", async () => {
    const onAdd = vi.fn();
    renderWithSystem(<GridAddButton label="Add a band" onAdd={onAdd} />);
    await userEvent.click(screen.getByRole("button", { name: "Add a band" }));
    expect(onAdd).toHaveBeenCalledOnce();
  });
});

const arabic = (value: number) => new Intl.NumberFormat("ar-EG").format(value);

describe("numbers as typed and shown", () => {
  it("reads either script's digits and decimal separator", () => {
    expect(readNumber("١٢٣")).toBe(123);
    expect(readNumber("۴۵")).toBe(45);
    expect(readNumber("2٫5")).toBe(2.5);
    expect(readNumber(" ")).toBeNull();
    expect(readNumber("1.2.3")).toBeNaN();
  });

  it("writes a figure in the reader's digits without grouping", () => {
    expect(writeNumber(1250.5, arabic)).toBe("١٢٥٠٫٥");
    expect(writeNumber(42, (value) => String(value))).toBe("42");
  });
});
