import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";

import {
  columnVisibilityFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Search,
  Columns3,
} from "lucide-react";
import { useMemo } from "react";

import { EmptyState } from "~/components/app/primitives";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import * as m from "~/i18n/messages";

import { DirectoryPagination } from "./DirectoryPagination";

const features = tableFeatures({ columnVisibilityFeature });
export interface DataColumn<T, S extends string> {
  id: string;
  label: () => string;
  sort?: S;
  render: (row: T) => ReactNode;
}
export function DataTable<T extends { id: string }, S extends string>({
  rows,
  columns,
  caption,
  query,
  onQuery,
  sort,
  direction,
  onSort,
  filters,
  renderActions,
  page,
  pages,
  total,
  onPage,
}: {
  rows: T[];
  columns: DataColumn<T, S>[];
  caption: string;
  query: string;
  onQuery: (query: string) => void;
  sort: S;
  direction: "asc" | "desc";
  onSort: (sort: S) => void;
  filters?: ReactNode;
  renderActions?: (row: T) => ReactNode;
  page: number;
  pages: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const definitions = useMemo<ColumnDef<typeof features, T>[]>(
    () => columns.map((column) => ({ id: column.id })),
    [columns],
  );
  const table = useTable({
    features,
    columns: definitions,
    data: rows,
    getRowId: (row) => row.id,
  });
  const visibleColumns = columns.filter((column) =>
    table.getColumn(column.id)?.getIsVisible(),
  );
  return (
    <section className="space-y-4" aria-label={caption}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search
            className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            autoComplete="off"
            className="h-8 bg-background ps-9"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            aria-label={m.managementSearchRecords()}
            placeholder={m.managementSearchRecords()}
          />
        </div>
        {filters ? (
          <div className="flex flex-wrap items-center gap-2">{filters}</div>
        ) : null}
        <div className="ms-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="sm" className="h-8" />}
            >
              <Columns3 className="size-4" aria-hidden />
              {m.managementColumns()}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {columns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={table.getColumn(column.id)?.getIsVisible()}
                  disabled={
                    visibleColumns.length === 1 &&
                    table.getColumn(column.id)?.getIsVisible()
                  }
                  onCheckedChange={(checked) =>
                    table.getColumn(column.id)?.toggleVisibility(checked)
                  }
                >
                  {column.label()}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {rows.length ? (
        <section
          className="overflow-x-auto rounded-lg border bg-card"
          aria-label={caption}
        >
          <Table>
            <TableCaption className="sr-only">{caption}</TableCaption>
            <TableHeader>
              <TableRow className="bg-muted/35">
                {visibleColumns.map((column) => (
                  <TableHead
                    key={column.id}
                    className="h-10 px-4 text-xs"
                    aria-sort={
                      column.sort === sort
                        ? direction === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    {column.sort ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-ms-3 text-xs"
                        onClick={() => {
                          if (column.sort) onSort(column.sort);
                        }}
                      >
                        {column.label()}
                        {column.sort === sort ? (
                          direction === "asc" ? (
                            <ArrowUp className="size-3" aria-hidden />
                          ) : (
                            <ArrowDown className="size-3" aria-hidden />
                          )
                        ) : (
                          <ArrowUpDown
                            className="size-3 opacity-40"
                            aria-hidden
                          />
                        )}
                      </Button>
                    ) : (
                      column.label()
                    )}
                  </TableHead>
                ))}
                {renderActions ? (
                  <TableHead className="px-5 text-end text-xs">
                    {m.managementActions()}
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {visibleColumns.map((column) => (
                    <TableCell key={column.id} className="px-4 py-3">
                      {column.render(row.original)}
                    </TableCell>
                  ))}
                  {renderActions ? (
                    <TableCell className="px-5 text-end">
                      {renderActions(row.original)}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : (
        <div className="p-5">
          <EmptyState
            title={m.managementNoMatches()}
            body={m.managementNoMatchesHint()}
          />
        </div>
      )}
      <div className="px-1">
        <DirectoryPagination
          page={page}
          pages={pages}
          total={total}
          onPage={onPage}
        />
      </div>
    </section>
  );
}
