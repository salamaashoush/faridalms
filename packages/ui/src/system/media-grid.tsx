import type { ReactNode } from "react";

import type { ActionItem } from "./action-menu";
import type { BatchAction, DataTablePagination } from "./data-table";
import type { EmptyStateProps } from "./empty-state";
import type { IndexToolbarProps } from "./index-toolbar";

import { Checkbox } from "../checkbox";
import { cn } from "../cn";
import { Check } from "lucide-react";
import { useState } from "react";

import { ActionMenu } from "./action-menu";
import { Pagination } from "./data-table";
import { EmptyState, FilteredEmptyState } from "./empty-state";
import { IndexToolbar, isFiltered } from "./index-toolbar";
import { useDesignSystem } from "./provider";
import { SelectionBar } from "./selection-bar";

/** How an item reads as a tile. */
export interface MediaGridTile<T> {
  /** The picture the tile shows, at a tile's size; none draws `icon` in its place. */
  src: (item: T) => string | null;
  /** A tiny image of the picture, as a data URL, shown while it loads. */
  placeholder?: (item: T) => string | null;
  /** Where the picture's subject sits, as CSS `object-position`, kept in view by the tile. */
  position?: (item: T) => string | undefined;
  icon?: (item: T) => ReactNode;
  title: (item: T) => string;
  fact?: (item: T) => ReactNode;
}

/** Tiles that choose rather than open: each is a toggle. */
export interface MediaGridSelection {
  selected: ReadonlySet<string>;
  onChange: (selected: ReadonlySet<string>) => void;
  /** Several may be chosen at once; otherwise choosing one replaces the last. */
  multiple?: boolean;
}

export interface MediaGridProps<T extends { id: string }> {
  /** Names the grid for screen readers. */
  caption: string;
  items: T[];
  tile: MediaGridTile<T>;
  toolbar?: IndexToolbarProps;
  /** The grid's own actions, such as Upload, at the end of its toolbar. */
  actions?: ReactNode;
  /** What the grid shows before its items, such as the folders of a folder. */
  leading?: ReactNode;
  /** Opens an item when its tile is pressed. */
  onOpen?: (item: T) => void;
  selection?: MediaGridSelection;
  itemActions?: (item: T) => ActionItem[];
  /**
   * Actions on several items at once: each tile then carries a checkbox,
   * and while any are selected the selection bar floats at the grid's foot.
   */
  batchActions?: BatchAction<T>[];
  pagination?: DataTablePagination;
  empty: EmptyStateProps;
}

const NONE: ReadonlySet<string> = new Set();

/**
 * Pictures, video and files as a grid of tiles: a picture shows itself, any
 * other file its icon, each with its name and a fact below. The same grid
 * opens items on a library page and chooses them in a picker; on a phone it
 * keeps two tiles a row.
 */
export function MediaGrid<T extends { id: string }>({
  caption,
  items,
  tile,
  toolbar,
  actions,
  leading,
  onOpen,
  selection,
  itemActions,
  batchActions,
  pagination,
  empty,
}: MediaGridProps<T>) {
  const { strings, formatNumber } = useDesignSystem();
  const filtered = toolbar ? isFiltered(toolbar) : false;
  // Picked items belong to the tiles on screen: another page or filter
  // starts afresh, while a refetch of the same tiles keeps them.
  const scope = items.map((item) => item.id).join(",");
  const [picked, setPicked] = useState({ scope, ids: NONE });
  const pickedIds = picked.scope === scope ? picked.ids : NONE;
  const pickedItems = items.filter((item) => pickedIds.has(item.id));
  const batching = Boolean(batchActions?.length) && !selection;
  const pick = (id: string, on: boolean) => {
    const next = new Set(pickedIds);
    if (on) next.add(id);
    else next.delete(id);
    setPicked({ scope, ids: next });
  };
  const toggle = (item: T) => {
    if (!selection) return;
    const on = !selection.selected.has(item.id);
    const next = new Set(selection.multiple ? selection.selected : []);
    if (on) next.add(item.id);
    else next.delete(item.id);
    selection.onChange(next);
  };
  return (
    <div className="grid gap-4">
      {batching ? (
        <p className="sr-only" aria-live="polite">
          {pickedItems.length
            ? strings.selectedCount(formatNumber(pickedItems.length))
            : null}
        </p>
      ) : null}
      {toolbar || actions ? (
        <IndexToolbar
          {...toolbar}
          actions={items.length > 0 || filtered ? actions : undefined}
        />
      ) : null}
      {leading}
      {items.length === 0 ? (
        filtered ? (
          <FilteredEmptyState onClear={toolbar?.onReset} />
        ) : (
          <EmptyState {...empty} />
        )
      ) : (
        <ul
          aria-label={caption}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
        >
          {items.map((item) => {
            const src = tile.src(item);
            const placeholder = src ? tile.placeholder?.(item) : null;
            const title = tile.title(item);
            const chosen =
              selection?.selected.has(item.id) ?? pickedIds.has(item.id);
            const menu = itemActions?.(item) ?? [];
            return (
              <li
                key={item.id}
                className={cn(
                  "group relative grid content-start gap-1.5 rounded-lg border bg-card p-1.5",
                  chosen && "border-primary ring-2 ring-primary/40",
                )}
              >
                <button
                  type="button"
                  aria-pressed={selection ? chosen : undefined}
                  onClick={() => (selection ? toggle(item) : onOpen?.(item))}
                  className="grid gap-1.5 rounded-md text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  <span className="relative grid aspect-[4/3] place-items-center overflow-hidden rounded-md bg-muted">
                    {src ? (
                      <img
                        src={src}
                        alt=""
                        loading="lazy"
                        draggable={false}
                        className="size-full bg-cover object-cover"
                        style={{
                          objectPosition: tile.position?.(item),
                          backgroundPosition: tile.position?.(item),
                          backgroundImage: placeholder
                            ? `url(${placeholder})`
                            : undefined,
                        }}
                      />
                    ) : (
                      <span className="text-muted-foreground [&_svg]:size-8">
                        {tile.icon?.(item)}
                      </span>
                    )}
                    {chosen && selection ? (
                      <span className="absolute end-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-4" aria-hidden />
                      </span>
                    ) : null}
                  </span>
                  <span className="grid min-w-0 gap-0.5 px-1 pb-0.5">
                    <bdi className="truncate text-sm leading-5 font-medium">
                      {title}
                    </bdi>
                    {tile.fact ? (
                      <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
                        {tile.fact(item)}
                      </span>
                    ) : null}
                  </span>
                </button>
                {batching ? (
                  <span className="absolute start-2.5 top-2.5 hidden size-8 place-items-center rounded-md bg-background/90 shadow-xs md:grid">
                    <Checkbox
                      aria-label={strings.selectRow(title)}
                      checked={pickedIds.has(item.id)}
                      onCheckedChange={(checked) => pick(item.id, checked)}
                    />
                  </span>
                ) : null}
                {menu.length > 0 ? (
                  <ActionMenu
                    label={strings.rowActions(title)}
                    actions={menu}
                    className="absolute end-2.5 top-2.5 bg-background/90 text-foreground shadow-xs hover:bg-background max-md:size-10"
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {pagination && pagination.pages > 1 ? (
        <Pagination {...pagination} />
      ) : null}
      {batching && pickedItems.length && batchActions ? (
        <SelectionBar
          rows={pickedItems}
          actions={batchActions}
          onClear={() => setPicked({ scope, ids: NONE })}
        />
      ) : null}
    </div>
  );
}
