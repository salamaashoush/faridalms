import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileText } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import type { MediaGridTile } from "./media-grid";

import { MediaGrid } from "./media-grid";
import { renderPageWithSystem, renderWithSystem } from "./testing";

interface Item {
  id: string;
  name: string;
  picture: boolean;
}

const items: Item[] = [
  { id: "a", name: "Sports day.jpg", picture: true },
  { id: "b", name: "Timetable.pdf", picture: false },
];

const tile: MediaGridTile<Item> = {
  src: (item) => (item.picture ? `/files/${item.id}` : null),
  icon: () => <FileText />,
  title: (item) => item.name,
  fact: (item) => (item.picture ? "Picture" : "PDF"),
};

const empty = { title: "Upload the school's first picture" };

describe("a media grid", () => {
  it("shows pictures as themselves and other files by their icon, and opens one", async () => {
    const onOpen = vi.fn<(item: Item) => void>();
    const { container } = renderWithSystem(
      <MediaGrid
        caption="Media library"
        items={items}
        tile={tile}
        onOpen={onOpen}
        empty={empty}
      />,
    );
    const grid = screen.getByRole("list", { name: "Media library" });
    expect(within(grid).getAllByRole("listitem")).toHaveLength(2);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "/files/a",
    );
    await userEvent.click(screen.getByRole("button", { name: /Timetable/ }));
    expect(onOpen).toHaveBeenCalledWith(items[1]);
  });

  it("holds a picture's placeholder and keeps its subject in view", () => {
    const { container } = renderWithSystem(
      <MediaGrid
        caption="Media library"
        items={items}
        tile={{
          ...tile,
          src: (item) => (item.picture ? `/files/${item.id}?w=320` : null),
          placeholder: () => "data:image/png;base64,AAAA",
          position: () => "20% 80%",
        }}
        empty={empty}
      />,
    );
    const picture = container.querySelector("img");
    expect(picture?.getAttribute("src")).toBe("/files/a?w=320");
    expect(picture?.style.backgroundImage).toContain("data:image/png");
    expect(picture?.style.objectPosition).toBe("20% 80%");
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("chooses one tile at a time, or several where it may", async () => {
    const onChange = vi.fn<(next: ReadonlySet<string>) => void>();
    const { rerender } = renderWithSystem(
      <MediaGrid
        caption="Choose a picture"
        items={items}
        tile={tile}
        selection={{ selected: new Set(["a"]), onChange }}
        empty={empty}
      />,
    );
    const first = screen.getByRole("button", { name: /Sports day/ });
    expect(first.getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(screen.getByRole("button", { name: /Timetable/ }));
    expect([...(onChange.mock.lastCall?.[0] ?? [])]).toEqual(["b"]);

    rerender(
      <MediaGrid
        caption="Choose a picture"
        items={items}
        tile={tile}
        selection={{ selected: new Set(["a"]), onChange, multiple: true }}
        empty={empty}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /Timetable/ }));
    expect([...(onChange.mock.lastCall?.[0] ?? [])]).toEqual(["a", "b"]);
  });

  it("offers each item's actions in its own menu", async () => {
    const onSelect = vi.fn<() => void>();
    renderWithSystem(
      <MediaGrid
        caption="Media library"
        items={items}
        tile={tile}
        itemActions={(item) => [{ label: `Rename ${item.name}`, onSelect }]}
        empty={empty}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Actions for Timetable.pdf" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Rename Timetable.pdf" }),
    );
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("says what fills it when empty, and how to clear a search that found nothing", async () => {
    const onReset = vi.fn<() => void>();
    renderWithSystem(
      <MediaGrid caption="Media library" items={[]} tile={tile} empty={empty} />,
    );
    expect(
      screen.getByRole("heading", { name: "Upload the school's first picture" }),
    ).toBeInTheDocument();
    function Searched() {
      return (
        <MediaGrid
          caption="Media library"
          items={[]}
          tile={tile}
          toolbar={{
            search: {
              value: "relay",
              onChange: () => undefined,
              label: "Search",
            },
            onReset,
          }}
          empty={empty}
        />
      );
    }
    renderPageWithSystem(Searched);
    await userEvent.click(
      await screen.findByRole("button", { name: "Clear filters" }),
    );
    expect(onReset).toHaveBeenCalled();
  });

  it("selects several tiles for an action on all of them, keeping each tile's opening", async () => {
    const onOpen = vi.fn<(item: Item) => void>();
    const onDelete = vi.fn<(rows: Item[]) => void>();
    renderWithSystem(
      <MediaGrid
        caption="Media library"
        items={items}
        tile={tile}
        onOpen={onOpen}
        batchActions={[{ label: "Delete", onSelect: onDelete }]}
        empty={empty}
      />,
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Select Sports day.jpg" }),
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Select Timetable.pdf" }),
    );
    expect(
      screen.getByText("2 selected", { selector: "p:not(.sr-only)" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(items);
    await userEvent.click(screen.getByRole("button", { name: /Timetable/ }));
    expect(onOpen).toHaveBeenCalledWith(items[1]);
    // Escape lets the selection go.
    await userEvent.keyboard("{Escape}");
    expect(
      screen.queryByText("2 selected", { selector: "p:not(.sr-only)" }),
    ).toBeNull();
  });
});
