import type { ReactNode } from "react";

import { cn } from "../cn";
import { useId } from "react";

/** One row of a summary list. */
export interface SummaryItem {
  id: string;
  label: string;
  value: ReactNode;
  /** The row's own change, such as Change or Record (GOV.UK's row action). */
  action?: ReactNode;
}

export interface SummaryListProps {
  items: readonly SummaryItem[];
  /**
   * Where values sit: at the end, so amounts and limits line up down the
   * column, or at the start beside their names, for text such as a legal
   * name or an address that reads from its first word.
   */
  align?: "end" | "start";
  /** Names the group in a bar above its rows, as a table's header does. */
  title?: string;
  /** An action for the whole group, such as Edit, at the end of the bar. */
  action?: ReactNode;
}

/**
 * Settings read as a list of rows, each a name and its value (GOV.UK's
 * summary list): for values compared down a column, where a grid of facts
 * would scatter them. On a phone a text value moves under its name.
 */
export function SummaryList({
  items,
  align = "end",
  title,
  action,
}: SummaryListProps) {
  const start = align === "start";
  const headingId = useId();
  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className="@container overflow-hidden rounded-lg border bg-card"
    >
      {title ? (
        <div className="flex min-h-10 items-center justify-between gap-3 border-b bg-muted/40 px-4 py-1">
          <h2 id={headingId} className="text-sm leading-5 font-semibold">
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      <dl className="divide-y">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              "px-4 py-3",
              start
                ? "grid items-baseline gap-1 @lg:grid-cols-[minmax(10rem,15rem)_1fr_auto] @lg:gap-6"
                : "flex items-baseline justify-between gap-4",
            )}
          >
            <dt className="text-sm leading-5 text-muted-foreground">
              {item.label}
            </dt>
            <dd
              className={cn(
                "min-w-0 text-sm leading-5 break-words",
                start ? "" : "text-end font-medium tabular-nums",
              )}
            >
              {item.value}
            </dd>
            {item.action ? (
              <dd className="justify-self-start @lg:justify-self-end">
                {item.action}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>
    </section>
  );
}
