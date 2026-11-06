import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Column } from "./data-table";

import { DataTable, RowLink } from "./data-table";
import { renderPageWithSystem } from "./testing";

interface School {
  id: string;
  name: string;
  state: string;
}

const SCHOOLS: School[] = [
  { id: "a", name: "Aspen", state: "Active" },
  { id: "b", name: "Birch", state: "Suspended" },
];

const COLUMNS: Column<School, "name">[] = [
  {
    id: "name",
    header: "School",
    primary: true,
    sort: "name",
    cell: (row) => <RowLink to="/">{row.name}</RowLink>,
  },
  { id: "state", header: "State", cell: (row) => row.state },
];

interface SchoolsProps {
  rows: School[];
}

function Schools({ rows }: SchoolsProps) {
  return (
    <DataTable
      caption="Schools"
      rows={rows}
      columns={COLUMNS}
      rowLabel={(row) => row.name}
      card={{ title: (row) => row.name }}
      empty={{ title: "Add your first school" }}
      rowActions={() => [{ label: "Suspend", onSelect: vi.fn<() => void>() }]}
    />
  );
}

describe("DataTable", () => {
  it("lists rows with a menu named for each", async () => {
    renderPageWithSystem(() => <Schools rows={SCHOOLS} />, {
      path: "/schools",
      paths: ["/"],
    });
    const table = await screen.findByRole("table", { name: "Schools" });
    expect(within(table).getAllByRole("row")).toHaveLength(3);
    expect(
      within(table).getByRole("button", { name: "Actions for Birch" }),
    ).toBeInTheDocument();
  });

  it("opens the record when anywhere in its row is clicked", async () => {
    renderPageWithSystem(() => <Schools rows={SCHOOLS} />, {
      path: "/schools",
      paths: ["/"],
    });
    const table = await screen.findByRole("table", { name: "Schools" });
    await userEvent.click(within(table).getByText("Suspended"));
    expect(await screen.findByText("/")).toBeInTheDocument();
  });

  it("shows its empty state when there are no rows", async () => {
    renderPageWithSystem(() => <Schools rows={[]} />);
    expect(
      await screen.findByRole("heading", { name: "Add your first school" }),
    ).toBeInTheDocument();
  });
});
