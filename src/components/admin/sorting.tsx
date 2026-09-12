import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { Button } from "~/components/ui/button";
import { TableHead } from "~/components/ui/table";
import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";

export type SortDirection = "asc" | "desc";

export function SortableHeader<T extends string>({
  column,
  label,
  active,
  direction,
  onSort,
  className,
}: {
  column: T;
  label: string;
  active: boolean;
  direction: SortDirection;
  onSort: (column: T) => void;
  className?: string;
}) {
  const Icon = !active
    ? ChevronsUpDown
    : direction === "asc"
      ? ArrowUp
      : ArrowDown;

  return (
    <TableHead
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : "none"
      }
      className={className}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        aria-label={m.adminSortBy({ column: label })}
        className="inline-flex items-center gap-1 rounded-md py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {label}
        <Icon
          className={cn(
            "size-3.5",
            active ? "text-foreground" : "text-muted-foreground/60",
          )}
          aria-hidden
        />
      </button>
    </TableHead>
  );
}

export function SortDirectionToggle({
  direction,
  onToggle,
}: {
  direction: SortDirection;
  onToggle: () => void;
}) {
  const Icon = direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <Button
      variant="outline"
      size="icon-sm"
      onClick={onToggle}
      aria-label={
        direction === "asc" ? m.adminSortDescending() : m.adminSortAscending()
      }
    >
      <Icon aria-hidden />
    </Button>
  );
}
