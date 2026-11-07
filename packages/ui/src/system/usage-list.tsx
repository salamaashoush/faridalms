import type { ReactNode } from "react";

import { cn } from "../cn";

/** One limit and how much of it is used. */
export interface UsageItem {
  id: string;
  label: string;
  /** What is used, already written for the reader: "8", "1.2 GB". */
  used: string;
  /** What is allowed, written for the reader: "300", "100 GB", "No limit". */
  allowed: string;
  /** How full it is, from 0 to 1, or null where there is no limit to fill. */
  share: number | null;
}

export interface UsageListProps {
  label: string;
  items: readonly UsageItem[];
  /** Shows the label in a bar above the rows, as a table's header does. */
  titled?: boolean;
  /** An action for the whole list, such as Edit, at the end of the bar. */
  action?: ReactNode;
}

const fill = (share: number) =>
  share >= 1 ? "bg-destructive" : share >= 0.8 ? "bg-warning" : "bg-primary";

/**
 * Limits as rows of what is used against what is allowed, with a bar that
 * turns amber past four fifths and red when full, so the one near its
 * limit stands out from the rest.
 */
export function UsageList({
  label,
  items,
  titled = false,
  action,
}: UsageListProps) {
  const list = (
    <ul
      aria-label={label}
      className={cn("divide-y", !titled && "rounded-lg border bg-card")}
    >
      {items.map((item) => (
        <li
          key={item.id}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[12rem_minmax(0,1fr)_9rem]"
        >
          <span className="text-sm leading-5 font-medium">{item.label}</span>
          <span
            className={cn(
              "order-last col-span-2 h-1.5 overflow-hidden rounded-full sm:order-none sm:col-span-1",
              item.share !== null && "bg-muted",
            )}
          >
            {item.share === null ? null : (
              <span
                aria-hidden
                className={cn("block h-full rounded-full", fill(item.share))}
                style={{
                  width: `${Math.round(Math.min(1, Math.max(0, item.share)) * 100)}%`,
                }}
              />
            )}
          </span>
          <span className="text-end text-sm leading-5 tabular-nums">
            {item.used}
            <span className="text-muted-foreground"> / {item.allowed}</span>
          </span>
        </li>
      ))}
    </ul>
  );
  if (!titled) return list;
  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b bg-muted/40 px-4 py-1">
        <h2 aria-hidden className="text-sm leading-5 font-semibold">
          {label}
        </h2>
        {action}
      </div>
      {list}
    </section>
  );
}
