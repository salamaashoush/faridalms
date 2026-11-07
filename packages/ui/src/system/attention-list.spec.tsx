import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AttentionList } from "./attention-list";
import { renderWithSystem } from "./testing";

describe("AttentionList", () => {
  it("puts the most urgent first, each with its fix", () => {
    renderWithSystem(
      <AttentionList
        title="To do"
        items={[
          { id: "dpa", tone: "info", title: "Agreement not accepted" },
          {
            id: "late",
            tone: "danger",
            title: "Invoice 2026-0004 is 34 days overdue",
            detail: "3,990 EGP owed",
            action: <button type="button">Open invoice</button>,
          },
        ]}
      />,
    );
    const list = screen.getByRole("region", { name: "To do 2" });
    const [first, second] = within(list).getAllByRole("listitem");
    expect(first).toHaveTextContent("Invoice 2026-0004 is 34 days overdue");
    expect(first).toHaveTextContent("3,990 EGP owed");
    expect(
      within(first as HTMLElement).getByRole("button", {
        name: "Open invoice",
      }),
    ).toBeInTheDocument();
    expect(second).toHaveTextContent("Agreement not accepted");
  });

  it("draws nothing when nothing needs doing", () => {
    renderWithSystem(<AttentionList title="To do" items={[]} />);
    expect(screen.queryByRole("heading", { name: /To do/ })).toBeNull();
  });
});
