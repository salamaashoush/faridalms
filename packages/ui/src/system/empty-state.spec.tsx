import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EmptyState, FilteredEmptyState } from "./empty-state";
import { renderWithSystem } from "./testing";

describe("empty states", () => {
  it("leads with what to do and its one action", () => {
    renderWithSystem(
      <EmptyState
        title="Add your first school"
        description="Schools appear here once created."
        action={<button type="button">New school</button>}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Add your first school" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "New school" }),
    ).toBeInTheDocument();
  });

  it("offers to clear filters that matched nothing", async () => {
    const onClear = vi.fn<() => void>();
    renderWithSystem(<FilteredEmptyState onClear={onClear} />);
    expect(
      screen.getByRole("heading", {
        name: "Nothing matches your search or filters",
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});
