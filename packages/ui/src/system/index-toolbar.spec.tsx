import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Facet } from "./index-toolbar";

import { IndexToolbar } from "./index-toolbar";
import { renderPageWithSystem } from "./testing";

const KINDS = [
  { value: "picture", label: "Pictures" },
  { value: "file", label: "Files" },
];

const YEARS = [
  { value: "y1", label: "2025/26" },
  { value: "y2", label: "2026/27" },
];

function kind(selected: string[], onChange = vi.fn<Facet["onChange"]>()) {
  return {
    id: "kind",
    label: "Kind",
    options: KINDS,
    selected,
    onChange,
  } satisfies Facet;
}

function year(selected: string[], onChange = vi.fn<Facet["onChange"]>()) {
  return {
    id: "year",
    label: "School year",
    options: YEARS,
    selected,
    single: true,
    defaultSelected: ["y2"],
    onChange,
  } satisfies Facet;
}

function renderToolbar(facets: Facet[], onReset?: () => void) {
  renderPageWithSystem(() => (
    <IndexToolbar facets={facets} onReset={onReset} />
  ));
}

describe("IndexToolbar", () => {
  it("offers a filter not yet applied with a dashed edge", async () => {
    renderToolbar([kind([])]);
    const trigger = await screen.findByRole("button", { name: /Kind/ });
    expect(trigger).toHaveAttribute("data-unset");
    expect(trigger).toHaveClass("data-unset:border-dashed");
  });

  it("draws an applied filter solid, with its value", async () => {
    renderToolbar([kind(["file"])]);
    const trigger = await screen.findByRole("button", { name: /Kind/ });
    expect(trigger).not.toHaveAttribute("data-unset");
    expect(trigger).toHaveTextContent("Files");
  });

  it("never draws a choice that always holds a value as unset", async () => {
    renderToolbar([year(["y2"])]);
    const trigger = await screen.findByRole("button", { name: /School year/ });
    expect(trigger).not.toHaveAttribute("data-unset");
    expect(trigger).toHaveTextContent("2026/27");
  });

  it("keeps a single choice to one value", async () => {
    const onChange = vi.fn<Facet["onChange"]>();
    renderToolbar([year(["y2"], onChange)]);
    await userEvent.click(
      await screen.findByRole("button", { name: /School year/ }),
    );
    await userEvent.click(
      await screen.findByRole("menuitemradio", { name: "2025/26" }),
    );
    expect(onChange).toHaveBeenCalledWith(["y1"]);
  });

  it("adds to a filter's values and offers to clear them", async () => {
    const onChange = vi.fn<Facet["onChange"]>();
    renderToolbar([kind(["picture"], onChange)]);
    await userEvent.click(await screen.findByRole("button", { name: /Kind/ }));
    await userEvent.click(
      await screen.findByRole("menuitemcheckbox", { name: "Files" }),
    );
    expect(onChange).toHaveBeenLastCalledWith(["picture", "file"]);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Clear filter" }),
    );
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("offers Reset only while the list is narrowed", async () => {
    const onReset = vi.fn<() => void>();
    renderToolbar([kind([]), year(["y2"])], onReset);
    await screen.findByRole("button", { name: /Kind/ });
    expect(screen.queryByRole("button", { name: "Reset" })).toBeNull();
  });

  it("folds only the filters into the phone's sheet, never the scope", async () => {
    renderToolbar([year(["y2"]), kind([])]);
    await userEvent.click(
      await screen.findByRole("button", { name: /^Filters/ }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Filters" });
    expect(within(sheet).getByRole("group", { name: "Kind" })).toBeVisible();
    expect(within(sheet).queryByText("School year")).toBeNull();
  });

  it("resets a narrowed list", async () => {
    const onReset = vi.fn<() => void>();
    renderToolbar([kind([]), year(["y1"])], onReset);
    await userEvent.click(await screen.findByRole("button", { name: "Reset" }));
    expect(onReset).toHaveBeenCalledOnce();
  });
});
