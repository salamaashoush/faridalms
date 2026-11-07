import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ChangeLog } from "./change-log";
import { renderWithSystem } from "./testing";

const LABELS = {
  caption: "Changes",
  what: "Change",
  why: "Why",
  who: "By",
  when: "When",
  empty: "No changes yet.",
};

describe("ChangeLog", () => {
  it("lists each change with what it moved, why, by whom and when", () => {
    renderWithSystem(
      <ChangeLog
        labels={LABELS}
        entries={[
          {
            id: "1",
            what: "Details changed",
            details: ["Currency: EGP → USD"],
            why: "Moved to a dollar contract",
            who: "Salama Ashoush",
            when: "Nov 7, 2026, 4:00 PM",
            at: "2026-11-07T14:00:00Z",
          },
        ]}
      />,
    );
    const table = screen.getByRole("table", { name: "Changes" });
    const row = within(table).getAllByRole("row")[1];
    expect(row).toHaveTextContent("Details changed");
    expect(row).toHaveTextContent("Currency: EGP → USD");
    expect(row).toHaveTextContent("Moved to a dollar contract");
    expect(row).toHaveTextContent("Salama Ashoush");
    expect(within(table).getByText("Nov 7, 2026, 4:00 PM")).toHaveAttribute(
      "datetime",
      "2026-11-07T14:00:00Z",
    );
  });

  it("names the record of each change where the log spans records", () => {
    renderWithSystem(
      <ChangeLog
        labels={{ ...LABELS, record: "Record" }}
        entries={[
          {
            id: "1",
            what: "Host added",
            details: [],
            why: "The school wants its own address",
            who: "Salama Ashoush",
            when: "Nov 7, 2026, 4:00 PM",
            at: "2026-11-07T14:00:00Z",
            record: <a href="/schools/1">Fernhill School</a>,
          },
        ]}
        pagination={{
          page: 1,
          pages: 1,
          total: 1,
          pageSize: 50,
          onPage: () => undefined,
        }}
      />,
    );
    const table = screen.getByRole("table", { name: "Changes" });
    expect(
      within(table).getByRole("columnheader", { name: "Record" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("link", { name: "Fernhill School" }),
    ).toHaveAttribute("href", "/schools/1");
    expect(screen.getByRole("navigation", { name: "Table pages" })).toBeVisible();
  });

  it("has no record column on a single record's history", () => {
    renderWithSystem(
      <ChangeLog
        labels={LABELS}
        entries={[
          {
            id: "1",
            what: "Details changed",
            details: [],
            why: null,
            who: "Salama Ashoush",
            when: "Nov 7, 2026, 4:00 PM",
            at: "2026-11-07T14:00:00Z",
          },
        ]}
      />,
    );
    expect(
      screen.queryByRole("columnheader", { name: "Record" }),
    ).not.toBeInTheDocument();
  });

  it("says in a line that nothing has changed yet", () => {
    renderWithSystem(<ChangeLog labels={LABELS} entries={[]} />);
    expect(
      screen.getByRole("heading", { name: "No changes yet." }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
