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

  it("says in a line that nothing has changed yet", () => {
    renderWithSystem(<ChangeLog labels={LABELS} entries={[]} />);
    expect(
      screen.getByRole("heading", { name: "No changes yet." }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
