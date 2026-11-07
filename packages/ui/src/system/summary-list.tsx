import type { ReactNode } from "react";

/** One row of a summary list. */
export interface SummaryItem {
  id: string;
  label: string;
  value: ReactNode;
}

export interface SummaryListProps {
  items: readonly SummaryItem[];
}

/**
 * Settings read as a list of rows, each a name and its value (GOV.UK's
 * summary list): for values compared down a column, where a grid of facts
 * would scatter them.
 */
export function SummaryList({ items }: SummaryListProps) {
  return (
    <dl className="divide-y rounded-lg border">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-baseline justify-between gap-4 px-4 py-3"
        >
          <dt className="text-sm leading-5 text-muted-foreground">
            {item.label}
          </dt>
          <dd className="text-end text-sm leading-5 font-medium tabular-nums">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
