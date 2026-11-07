import type { ReactNode } from "react";

import type { ActionItem } from "./action-menu";
import type { DataTablePagination } from "./data-table";
import type { EmptyStateProps } from "./empty-state";
import type { IndexToolbarProps } from "./index-toolbar";

import { cn } from "../cn";
import { Check } from "lucide-react";

import { ActionMenu } from "./action-menu";
import { Pagination } from "./data-table";
import { EmptyState, FilteredEmptyState } from "./empty-state";
import { IndexToolbar, isFiltered } from "./index-toolbar";
import { useDesignSystem } from "./provider";

/** How an item reads as a tile. */
export interface MediaGridTile<T> {
  /** The picture the tile shows; none draws `icon` in its place. */
  src: (item: T) => string | null;
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
  pagination?: DataTablePagination;
  empty: EmptyStateProps;
}

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
  pagination,
  empty,
}: MediaGridProps<T>) {
  const { strings } = useDesignSystem();
  const filtered = toolbar ? isFiltered(toolbar) : false;
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
            const title = tile.title(item);
            const chosen = selection?.selected.has(item.id) ?? false;
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
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="text-muted-foreground [&_svg]:size-8">
                        {tile.icon?.(item)}
                      </span>
                    )}
                    {chosen ? (
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
    </div>
  );
}
