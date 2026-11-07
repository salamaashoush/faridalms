import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../cn";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { useId } from "react";

import { useDesignSystem } from "./provider";

/** How urgent an item is: it decides the icon and its colour. */
export type AttentionTone = "danger" | "warning" | "info";

/** One thing to do: what is wrong or due, what it means, and its fix. */
export interface AttentionItem {
  id: string;
  tone: AttentionTone;
  title: string;
  detail?: ReactNode;
  /** The button or link that deals with it. */
  action?: ReactNode;
}

export interface AttentionListProps {
  title: string;
  items: readonly AttentionItem[];
  /**
   * Said under the title when nothing needs doing, where the list is the
   * page's first job (a home page); without it an empty list draws nothing.
   */
  empty?: string;
}

const ICONS: Record<AttentionTone, LucideIcon> = {
  danger: CircleAlert,
  warning: TriangleAlert,
  info: Info,
};

const ICON_TONE: Record<AttentionTone, string> = {
  danger: "text-destructive",
  warning: "text-warning-foreground dark:text-warning",
  info: "text-info",
};

const ORDER: Record<AttentionTone, number> = { danger: 0, warning: 1, info: 2 };

/**
 * What needs doing on a record, most urgent first, each with what it means
 * and the action that deals with it. It draws nothing when nothing needs
 * doing, so its presence is the signal.
 */
export function AttentionList({ title, items, empty }: AttentionListProps) {
  const { formatNumber } = useDesignSystem();
  const headingId = useId();
  if (items.length === 0 && !empty) return null;
  const sorted = items.toSorted((a, b) => ORDER[a.tone] - ORDER[b.tone]);
  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-lg border bg-card"
    >
      <h2
        id={headingId}
        className="flex h-10 items-center gap-2 border-b bg-muted/40 px-4 text-sm leading-5 font-semibold"
      >
        {title}
        {items.length ? (
          <span className="font-normal text-muted-foreground tabular-nums">
            {formatNumber(items.length)}
          </span>
        ) : null}
      </h2>
      {sorted.length === 0 ? (
        <p className="flex items-center gap-3 px-4 py-3 text-sm leading-5 text-muted-foreground">
          <CircleCheck aria-hidden className="size-4 shrink-0 text-success" />
          {empty}
        </p>
      ) : null}
      <ul className="divide-y empty:hidden">
        {sorted.map((item) => {
          const Icon = ICONS[item.tone];
          return (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
            >
              <Icon
                aria-hidden
                className={cn("size-4 shrink-0", ICON_TONE[item.tone])}
              />
              <div className="grid min-w-0 flex-1 basis-60 gap-0.5">
                <span className="text-sm leading-5 font-medium">
                  {item.title}
                </span>
                {item.detail ? (
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {item.detail}
                  </span>
                ) : null}
              </div>
              {item.action ? (
                <div className="flex shrink-0 items-center gap-2 max-sm:ms-7">
                  {item.action}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
