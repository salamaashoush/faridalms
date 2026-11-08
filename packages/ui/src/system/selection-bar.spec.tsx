import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Archive, Download, FolderInput, Tag, Trash2 } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import type { BatchAction } from "./selection-bar";

import { SelectionBar } from "./selection-bar";
import { renderWithSystem } from "./testing";

interface Row {
  id: string;
}

const ROWS: Row[] = [{ id: "a" }, { id: "b" }];

const remove = (onSelect = vi.fn()): BatchAction<Row> => ({
  label: "Delete",
  icon: Trash2,
  destructive: true,
  confirm: (rows) => ({
    title: `Delete ${rows.length} files?`,
    body: "They go to the trash.",
    label: "Delete",
  }),
  onSelect,
});

describe("SelectionBar", () => {
  it("says how many are selected and clears them by button or Escape", async () => {
    const onClear = vi.fn();
    renderWithSystem(
      <SelectionBar rows={ROWS} actions={[remove()]} onClear={onClear} />,
    );
    const bar = screen.getByRole("group", {
      name: "Actions for the selected rows",
    });
    expect(bar).toHaveTextContent("2 selected");
    await userEvent.click(
      screen.getByRole("button", { name: "Clear selection" }),
    );
    await userEvent.keyboard("{Escape}");
    expect(onClear).toHaveBeenCalledTimes(2);
  });

  it("stands the first actions as buttons and keeps the rest, then the destructive, under More", async () => {
    const actions: BatchAction<Row>[] = [
      { label: "Move", icon: FolderInput, onSelect: vi.fn() },
      { label: "Tag", icon: Tag, onSelect: vi.fn() },
      { label: "Download", icon: Download, onSelect: vi.fn() },
      { label: "Archive", icon: Archive, onSelect: vi.fn() },
      remove(),
    ];
    renderWithSystem(
      <SelectionBar rows={ROWS} actions={actions} onClear={vi.fn()} />,
    );
    for (const name of ["Move", "Tag", "Download"])
      expect(screen.getByRole("button", { name })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "More actions" }));
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Archive",
      "Delete",
    ]);
  });

  it("stands a destructive action beside the others when nothing waits under More, and confirms it", async () => {
    const onSelect = vi.fn();
    renderWithSystem(
      <SelectionBar
        rows={ROWS}
        actions={[
          { label: "Move", icon: FolderInput, onSelect: vi.fn() },
          remove(onSelect),
        ]}
        onClear={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Delete 2 files?");
    expect(onSelect).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getAllByRole("button", { name: "Delete" }).at(-1) as HTMLElement,
    );
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(ROWS));
  });

  it("runs a regular action on every selected row at once", async () => {
    const onSelect = vi.fn();
    renderWithSystem(
      <SelectionBar
        rows={ROWS}
        actions={[{ label: "Move", onSelect }]}
        onClear={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Move" }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(ROWS));
  });

  it("leaves Escape to a field that takes it", async () => {
    const onClear = vi.fn();
    renderWithSystem(
      <>
        <input aria-label="Search" />
        <SelectionBar rows={ROWS} actions={[remove()]} onClear={onClear} />
      </>,
    );
    await userEvent.click(screen.getByRole("textbox", { name: "Search" }));
    await userEvent.keyboard("{Escape}");
    expect(onClear).not.toHaveBeenCalled();
  });
});
