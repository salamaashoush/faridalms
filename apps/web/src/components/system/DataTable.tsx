import type { LucideIcon } from "lucide-react";
import type { ComponentProps, MouseEvent, ReactNode, Ref } from "react";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { cn } from "@faridalms/ui/cn";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@faridalms/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@faridalms/ui/select";
import { useIsMobile } from "@faridalms/ui/use-mobile";
import { createLink } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  CircleAlert,
  ChevronRight,
  ChevronsUpDown,
  LoaderCircle,
  Minus,
  SlidersHorizontal,
} from "lucide-react";
import { useRef, useState } from "react";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

import type { ActionItem, Confirmation } from "./ActionMenu";
import type { IndexToolbarProps } from "./IndexPage";

import { ActionMenu, attempt, phoneMenuItem, runAndReport } from "./ActionMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  EmptyState,
  FilteredEmptyState,
  IndexToolbar,
  isFiltered,
} from "./IndexPage";

export type SortDirection = "asc" | "desc";

export interface Column<T, S extends string = string> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  sort?: S;
  primary?: boolean;
  className?: string;
}

export type RowAction = ActionItem & { inline?: boolean };

export type BatchAction<T> = {
  label: string;
  icon?: LucideIcon;
  onSelect: (rows: T[]) => void | Promise<unknown>;
} & (
  | { destructive?: false; confirm?: (rows: T[]) => Confirmation }
  | { destructive: true; confirm: (rows: T[]) => Confirmation }
);

function RowAnchor({ className, children, ...props }: ComponentProps<"a">) {
  return (
    <a
      {...props}
      data-slot="row-link"
      dir="auto"
      className={cn(
        "inline-block max-w-full truncate rounded-sm align-top font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring/60",
        className,
      )}
    >
      {children}
    </a>
  );
}

export const RowLink = createLink(RowAnchor);

const interactive =
  "a, button, input, label, select, textarea, [role=checkbox], [role=menuitem]";

/**
 * Clicking anywhere in a row follows the link in its primary cell, so the row
 * is one big target for a pointer while keyboard and screen reader users meet
 * a single real link, not a focusable row that duplicates it.
 */
function followRowLink(event: MouseEvent<HTMLElement>) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  // Menus and dialogs opened from a row are portalled, but React still
  // bubbles their clicks through the row.
  if (!event.currentTarget.contains(target)) return;
  if (target.closest(interactive) || target.closest("[data-row-control]"))
    return;
  if (window.getSelection()?.toString()) return;
  const link = event.currentTarget.querySelector<HTMLAnchorElement>(
    "a[data-slot=row-link]",
  );
  if (!link) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey) {
    window.open(link.href, "_blank", "noopener");
    return;
  }
  link.click();
}

/**
 * The vendored checkbox always draws a tick, which reads as "all selected"
 * when only some rows are; this one draws a dash for the mixed state.
 */
function SelectAllCheckbox({
  className,
  indeterminate,
  ref,
  ...props
}: CheckboxPrimitive.Root.Props & { ref?: Ref<HTMLElement> }) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      data-slot="checkbox"
      indeterminate={indeterminate}
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input shadow-xs transition-shadow outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground dark:bg-input/30 dark:data-indeterminate:bg-primary data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:data-checked:bg-primary",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="grid place-content-center text-current [&>svg]:size-3.5">
        {indeterminate ? <Minus /> : <Check />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

function SortIcon({
  active,
  direction,
}: {
  active: boolean;
  direction: SortDirection;
}) {
  if (!active)
    return (
      <ChevronsUpDown
        className="size-3.5 text-muted-foreground/50"
        aria-hidden
      />
    );
  return direction === "asc" ? (
    <ArrowUp className="size-3.5" aria-hidden />
  ) : (
    <ArrowDown className="size-3.5" aria-hidden />
  );
}

function ViewMenu<S extends string>({
  sort,
  sortOptions,
  columns,
  hidden,
  onToggle,
}: {
  sort?: DataTableSort<S>;
  sortOptions: { value: S; label: string }[];
  columns: { id: string; header: string }[];
  hidden: ReadonlySet<string>;
  onToggle: (id: string, visible: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const showColumns = !isMobile && columns.length > 0;
  if (!sort && !showColumns) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="max-md:size-10"
            aria-label={m.indexView()}
          />
        }
      >
        <SlidersHorizontal aria-hidden />
        <span className="hidden md:inline">{m.indexView()}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto min-w-52">
        {sort ? (
          <>
            <DropdownMenuGroup>
              <DropdownMenuLabel>{m.indexSortBy()}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={sort.value}
                onValueChange={(next: string) => {
                  const option = sortOptions.find(
                    (candidate) => candidate.value === next,
                  );
                  if (option) sort.onChange(option.value, sort.direction);
                }}
              >
                {sortOptions.map((option) => (
                  <DropdownMenuRadioItem
                    key={option.value}
                    value={option.value}
                    className={phoneMenuItem}
                  >
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{m.indexOrder()}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={sort.direction}
                onValueChange={(next: string) =>
                  sort.onChange(sort.value, next === "desc" ? "desc" : "asc")
                }
              >
                <DropdownMenuRadioItem value="asc" className={phoneMenuItem}>
                  {m.indexAscending()}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="desc" className={phoneMenuItem}>
                  {m.indexDescending()}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </>
        ) : null}
        {sort && showColumns ? <DropdownMenuSeparator /> : null}
        {showColumns ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel>{m.managementColumns()}</DropdownMenuLabel>
            {columns.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                className={phoneMenuItem}
                checked={!hidden.has(column.id)}
                onCheckedChange={(checked) => onToggle(column.id, checked)}
              >
                {column.header}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BatchBar<T>({
  rows,
  actions,
  onCancel,
}: {
  rows: T[];
  actions: BatchAction<T>[];
  onCancel: () => void;
}) {
  const [pending, setPending] = useState<BatchAction<T> | null>(null);
  const [confirming, setConfirming] = useState<BatchAction<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: BatchAction<T>) => {
    setPending(action);
    setError(null);
    const failure = await attempt(() => action.onSelect(rows));
    setPending(null);
    setError(failure);
    if (!failure) setConfirming(null);
  };
  const confirmation = confirming?.confirm?.(rows);
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-2 rounded-md bg-primary/8 ps-3 pe-1">
      <p className="me-2 text-sm font-medium tabular-nums">
        {m.indexSelectedCount({ count: formatNumber(rows.length) })}
      </p>
      {actions.map((action) => (
        <Button
          key={action.label}
          type="button"
          variant={action.destructive ? "destructive" : "outline"}
          size="sm"
          disabled={pending !== null}
          onClick={() => {
            if (action.confirm) {
              setError(null);
              setConfirming(action);
            } else void run(action);
          }}
        >
          {pending === action ? (
            <LoaderCircle className="animate-spin" aria-hidden />
          ) : action.icon ? (
            <action.icon aria-hidden />
          ) : null}
          {action.label}
        </Button>
      ))}
      {error && !confirming ? (
        <p
          role="alert"
          className="flex items-center gap-1.5 text-[13px] leading-[18px] text-destructive"
        >
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ms-auto"
        onClick={onCancel}
      >
        {m.commonCancel()}
      </Button>
      {confirming && confirmation ? (
        <ConfirmDialog
          open
          title={confirmation.title}
          body={confirmation.body}
          confirmLabel={confirmation.label}
          pending={pending !== null}
          error={error ?? undefined}
          onCancel={() => setConfirming(null)}
          onConfirm={() => void run(confirming)}
        />
      ) : null}
    </div>
  );
}

function RowActions({
  label,
  actions,
}: {
  label: string;
  actions: RowAction[];
}) {
  const inline = actions.find((action) => action.inline && !action.destructive);
  const rest = actions.filter((action) => action !== inline);
  return (
    <div className="flex items-center justify-end gap-1">
      {inline ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => runAndReport(inline.onSelect)}
        >
          {inline.icon ? <inline.icon aria-hidden /> : null}
          {inline.label}
        </Button>
      ) : null}
      <ActionMenu label={label} actions={rest} />
    </div>
  );
}

const PAGE_SIZES = [25, 50];

export function Pagination({
  page,
  pages,
  total,
  pageSize,
  pageSizes = PAGE_SIZES,
  onPage,
  onPageSize,
}: DataTablePagination) {
  const sizes = pageSizes.includes(pageSize)
    ? pageSizes
    : [...pageSizes, pageSize].toSorted((a, b) => a - b);
  const items = sizes.map((size) => ({
    value: String(size),
    label: formatNumber(size),
  }));
  return (
    <nav
      aria-label={m.paginationLabel()}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
    >
      <p
        className="text-[13px] leading-[18px] text-muted-foreground"
        aria-live="polite"
      >
        {m.paginationStatus({
          page: formatNumber(page),
          pages: formatNumber(pages),
          total: formatNumber(total),
          count: total,
        })}
      </p>
      <div className="flex items-center gap-2">
        {onPageSize ? (
          <div className="hidden items-center gap-2 md:flex">
            <span
              className="text-[13px] leading-[18px] text-muted-foreground"
              aria-hidden
            >
              {m.indexRowsPerPage()}
            </span>
            <Select
              items={items}
              value={String(pageSize)}
              onValueChange={(next) => {
                const size = Number(next);
                if (sizes.includes(size)) onPageSize(size);
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label={m.indexRowsPerPage()}
                className="w-[4.5rem]"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="max-md:size-10"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label={m.paginationPrevious()}
        >
          <ChevronLeft className="rtl:-scale-x-100" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          className="max-md:size-10"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          aria-label={m.paginationNext()}
        >
          <ChevronRight className="rtl:-scale-x-100" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}

export interface DataTableSort<S extends string> {
  value: S;
  direction: SortDirection;
  onChange: (value: S, direction: SortDirection) => void;
}

export interface DataTablePagination {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  pageSizes?: number[];
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
}

const EMPTY = new Set<string>();

// The primary column takes whatever width the others leave and truncates its
// link there, so a long name cannot push the table into sideways scrolling.
// max-width 0 is what lets an auto-layout cell shrink below its content.
const fillColumn = "w-full max-w-0 min-w-32";

export function DataTable<T extends { id: string }, S extends string>({
  caption,
  rows,
  columns,
  rowLabel,
  toolbar,
  sort,
  rowActions,
  batchActions,
  pagination,
  card,
  empty,
}: {
  caption: string;
  rows: T[];
  columns: Column<T, S>[];
  rowLabel: (row: T) => string;
  toolbar?: IndexToolbarProps;
  sort?: DataTableSort<S>;
  rowActions?: (row: T) => RowAction[];
  batchActions?: BatchAction<T>[];
  pagination?: DataTablePagination;
  card: {
    leading?: (row: T) => ReactNode;
    title: (row: T) => ReactNode;
    status?: (row: T) => ReactNode;
    fact?: (row: T) => ReactNode;
  };
  empty: {
    icon?: LucideIcon;
    title: string;
    description?: string;
    action?: ReactNode;
  };
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(EMPTY);
  // Selection belongs to the rows on screen: another page or filter starts
  // afresh, while a background refetch of the same rows keeps it.
  const scope = rows.map((row) => row.id).join(",");
  const [selection, setSelection] = useState({ scope, ids: EMPTY });
  const selected = selection.scope === scope ? selection.ids : EMPTY;
  const select = (ids: ReadonlySet<string>) =>
    setSelection({ scope, ids: new Set(ids) });
  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    select(next);
  };
  const selectAllRef = useRef<HTMLElement>(null);
  const selectedRows = rows.filter((row) => selected.has(row.id));
  const selectable = Boolean(batchActions?.length);
  const visible = columns.filter(
    (column) => column.primary || !hidden.has(column.id),
  );
  const filtered = toolbar ? isFiltered(toolbar) : false;
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  const sortOptions = columns.flatMap((column) =>
    column.sort ? [{ value: column.sort, label: column.header }] : [],
  );
  const toggleSort = (value: S) => {
    if (!sort) return;
    sort.onChange(
      value,
      sort.value === value && sort.direction === "asc" ? "desc" : "asc",
    );
  };
  const view = (
    <ViewMenu
      sort={sort}
      sortOptions={sortOptions}
      columns={columns.filter((column) => !column.primary)}
      hidden={hidden}
      onToggle={(id, show) => {
        const next = new Set(hidden);
        if (show) next.delete(id);
        else next.add(id);
        setHidden(next);
      }}
    />
  );
  return (
    <section
      aria-label={caption}
      className="grid grid-cols-[minmax(0,1fr)] gap-4"
    >
      {selectable ? (
        <p className="sr-only" aria-live="polite">
          {selectedRows.length
            ? m.indexSelectedCount({ count: formatNumber(selectedRows.length) })
            : null}
        </p>
      ) : null}
      {selectedRows.length && batchActions ? (
        <BatchBar
          rows={selectedRows}
          actions={batchActions}
          onCancel={() => {
            selectAllRef.current?.focus();
            select(EMPTY);
          }}
        />
      ) : toolbar && (rows.length || filtered) ? (
        <IndexToolbar {...toolbar} view={view} />
      ) : null}
      {rows.length === 0 ? (
        filtered ? (
          <FilteredEmptyState onClear={toolbar?.onReset} />
        ) : (
          <EmptyState {...empty} />
        )
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
            <div className="relative overflow-x-auto overflow-y-hidden">
              <table className="w-full text-sm">
                <caption className="sr-only">{caption}</caption>
                <thead className="border-b bg-muted/40">
                  <tr>
                    {selectable ? (
                      <th scope="col" className="h-10 w-10 min-w-10 ps-4 pe-0">
                        <SelectAllCheckbox
                          ref={selectAllRef}
                          aria-label={m.indexSelectAll()}
                          checked={allSelected}
                          indeterminate={
                            selectedRows.length > 0 && !allSelected
                          }
                          onCheckedChange={(checked) =>
                            select(
                              checked
                                ? new Set(rows.map((row) => row.id))
                                : EMPTY,
                            )
                          }
                        />
                      </th>
                    ) : null}
                    {visible.map((column) => {
                      const active = column.sort === sort?.value;
                      return (
                        <th
                          key={column.id}
                          scope="col"
                          aria-sort={
                            column.sort && sort
                              ? active
                                ? sort.direction === "asc"
                                  ? "ascending"
                                  : "descending"
                                : "none"
                              : undefined
                          }
                          className={cn(
                            "h-10 px-3 text-start text-[13px] leading-[18px] font-medium whitespace-nowrap text-muted-foreground first:ps-4",
                            column.primary && fillColumn,
                            column.className,
                          )}
                        >
                          {column.sort && sort ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className={cn(
                                "-mx-2 px-2 text-[13px] leading-[18px]",
                                active && "text-foreground",
                              )}
                              onClick={() => {
                                if (column.sort) toggleSort(column.sort);
                              }}
                            >
                              {column.header}
                              <SortIcon
                                active={active}
                                direction={sort.direction}
                              />
                            </Button>
                          ) : (
                            column.header
                          )}
                        </th>
                      );
                    })}
                    {rowActions ? (
                      <th scope="col" className="h-10 w-px pe-2">
                        <span className="sr-only">{m.managementActions()}</span>
                      </th>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isSelected = selected.has(row.id);
                    return (
                      <tr
                        key={row.id}
                        data-state={isSelected ? "selected" : undefined}
                        onClick={followRowLink}
                        className="h-12 cursor-pointer border-b transition-colors last:border-0 hover:bg-accent has-aria-expanded:bg-accent has-[[data-slot=row-link]:focus-visible]:bg-accent data-[state=selected]:bg-primary/5"
                      >
                        {selectable ? (
                          <td
                            data-row-control
                            className="w-10 min-w-10 ps-4 pe-0"
                            onClick={(event) => {
                              if (
                                event.target instanceof Element &&
                                event.target.closest("[role=checkbox]")
                              )
                                return;
                              toggle(row.id, !isSelected);
                            }}
                          >
                            <Checkbox
                              aria-label={m.indexSelectRow({
                                name: rowLabel(row),
                              })}
                              checked={isSelected}
                              onCheckedChange={(checked) =>
                                toggle(row.id, checked)
                              }
                            />
                          </td>
                        ) : null}
                        {visible.map((column) => (
                          <td
                            key={column.id}
                            className={cn(
                              "px-3 py-0 whitespace-nowrap first:ps-4",
                              column.primary && fillColumn,
                              column.className,
                            )}
                          >
                            {column.cell(row)}
                          </td>
                        ))}
                        {rowActions ? (
                          <td data-row-control className="w-px py-0 ps-1 pe-2">
                            <RowActions
                              label={m.indexRowActions({
                                name: rowLabel(row),
                              })}
                              actions={rowActions(row)}
                            />
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {/* A card can anchor its link's ::after to cover the whole card,
              which a table row cannot do reliably, hence the script above. */}
          <ul
            aria-label={caption}
            className="divide-y overflow-hidden rounded-lg border bg-card md:hidden"
          >
            {rows.map((row) => (
              <li
                key={row.id}
                className="relative flex min-h-16 items-center gap-3 py-3 ps-4 pe-2 hover:bg-accent has-aria-expanded:bg-accent has-[[data-slot=row-link]:focus-visible]:bg-accent [&_[data-slot=row-link]]:after:absolute [&_[data-slot=row-link]]:after:inset-0"
              >
                {card.leading?.(row)}
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <div className="min-w-0 truncate text-sm leading-5">
                    {card.title(row)}
                  </div>
                  {card.fact ? (
                    <div className="truncate text-[13px] leading-[18px] text-muted-foreground">
                      {card.fact(row)}
                    </div>
                  ) : null}
                </div>
                {/* Status and menu share one trailing group, centred on the
                    card, so they read as one line beside the text. */}
                {card.status ? (
                  <div className="shrink-0">{card.status(row)}</div>
                ) : null}
                {rowActions ? (
                  <ActionMenu
                    label={m.indexRowActions({ name: rowLabel(row) })}
                    actions={rowActions(row)}
                    size="icon-lg"
                    className="relative"
                  />
                ) : null}
              </li>
            ))}
          </ul>
          {pagination ? <Pagination {...pagination} /> : null}
        </>
      )}
    </section>
  );
}
