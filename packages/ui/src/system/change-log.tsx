import type { Column } from "./data-table";

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
}

/** The words the change log says, in the app's language. */
export interface ChangeLogLabels {
  caption: string;
  what: string;
  why: string;
  who: string;
  when: string;
  /** Said in place of the table when nothing has changed yet. */
  empty: string;
  /** What will show here, under the empty state's title. */
  emptyHint?: string;
}

export interface ChangeLogProps {
  entries: readonly ChangeEntry[];
  labels: ChangeLogLabels;
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
 * A record's audit log, newest first (GitHub's audit log, Stripe's events):
 * what was done and the fields it moved, why, by whom and when. On a phone
 * each change is a card.
 */
export function ChangeLog({ entries, labels }: ChangeLogProps) {
  const columns = columnsOf(labels);
  return (
    <DataTable
      caption={labels.caption}
      rows={[...entries]}
      columns={columns}
      rowLabel={(entry) => entry.what}
      card={{
        title: (entry) => entry.what,
        fact: (entry) =>
          [entry.when, entry.who, entry.why].filter(Boolean).join(" · "),
      }}
      empty={{
        icon: History,
        title: labels.empty,
        description: labels.emptyHint,
      }}
    />
  );
}
