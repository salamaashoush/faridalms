import type { ReactNode } from "react";

import type { Column, DataTablePagination } from "./data-table";
import type { IndexToolbarProps } from "./index-toolbar";

import { History } from "lucide-react";

import { DataTable } from "./data-table";

/** One change, already written out for the reader. */
export interface ChangeEntry {
  id: string;
  /** What was done, such as "Contact added". */
  what: string;
  /** What it moved, one line a field: "Currency: EGP → USD". */
  details: readonly string[];
  why: string | null;
  who: string;
  /** When, as the reader reads it. */
  when: string;
  /** When, as an ISO instant, for the `time` element. */
  at: string;
  /**
   * The record it was made to, where a log spans records: its name, linked
   * to it where it can be opened, so the whole row opens it.
   */
  record?: ReactNode;
}

/** The words the change log says, in the app's language. */
export interface ChangeLogLabels {
  caption: string;
  what: string;
  why: string;
  who: string;
  when: string;
  /** The record column's header, shown where a log spans records. */
  record?: string;
  /** Said in place of the table when nothing has changed yet. */
  empty: string;
  /** What will show here, under the empty state's title. */
  emptyHint?: string;
}

export interface ChangeLogProps {
  entries: readonly ChangeEntry[];
  labels: ChangeLogLabels;
  /** Search and filters, for a log long enough to need them. */
  toolbar?: IndexToolbarProps;
  pagination?: DataTablePagination;
}

function columnsOf(labels: ChangeLogLabels): Column<ChangeEntry>[] {
  return [
    {
      id: "what",
      header: labels.what,
      primary: true,
      cell: (entry) => (
        <span className="grid min-w-0 py-2.5">
          <span className="truncate font-medium">{entry.what}</span>
          {entry.why ? (
            <span
              dir="auto"
              title={entry.why}
              className="truncate text-[13px] leading-[18px] text-foreground/80"
            >
              {labels.why}: {entry.why}
            </span>
          ) : null}
          {entry.details.map((line) => (
            <span
              key={line}
              dir="auto"
              className="text-[13px] leading-[18px] break-words whitespace-normal text-muted-foreground"
            >
              {line}
            </span>
          ))}
        </span>
      ),
    },
    ...(labels.record
      ? [
          {
            id: "record",
            header: labels.record,
            width: "medium",
            cell: (entry) => entry.record,
          } satisfies Column<ChangeEntry>,
        ]
      : []),
    { id: "who", header: labels.who, cell: (entry) => entry.who },
    {
      id: "when",
      header: labels.when,
      align: "end",
      cell: (entry) => (
        <time dateTime={entry.at} className="text-muted-foreground">
          {entry.when}
        </time>
      ),
    },
  ];
}

/**
 * An audit log, newest first (GitHub's audit log, Stripe's events): what was
 * done and the fields it moved, why, by whom and when. A record's History
 * shows its own changes; a log across records adds the record each change
 * was made to, with search, filters and pages. On a phone each change is a
 * card, led by its record where the log spans several.
 */
export function ChangeLog({
  entries,
  labels,
  toolbar,
  pagination,
}: ChangeLogProps) {
  const columns = columnsOf(labels);
  const spans = Boolean(labels.record);
  return (
    <DataTable
      caption={labels.caption}
      rows={[...entries]}
      columns={columns}
      rowLabel={(entry) => entry.what}
      toolbar={toolbar}
      pagination={pagination}
      card={{
        title: (entry) => (spans ? entry.record : entry.what),
        fact: (entry) =>
          (spans
            ? [entry.what, entry.when, entry.who]
            : [entry.when, entry.who, entry.why]
          )
            .filter(Boolean)
            .join(" · "),
      }}
      empty={{
        icon: History,
        title: labels.empty,
        description: labels.emptyHint,
      }}
    />
  );
}
