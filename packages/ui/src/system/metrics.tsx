import type { LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Link } from "@tanstack/react-router";

import type { Tone } from "./status";

import { cn } from "../cn";
import { dotTone } from "./status";

export interface MetricGridProps {
  /** Names the strip for screen readers, such as "Summary". */
  label: string;
  children: ReactNode;
}

/** A strip of metrics leading a home page or a board, up to five across. */
export function MetricGrid({ label, children }: MetricGridProps) {
  return (
    <section
      aria-label={label}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]"
    >
      {children}
    </section>
  );
}

/** A second line under a metric, with a tone when it reports a state. */
export interface MetricDetail {
  text: string;
  tone?: Tone;
}

export interface MetricProps {
  label: string;
  /** Already formatted for the reader: a count, an amount. */
  value: string;
  detail?: MetricDetail;
  /** How full it is, from 0 to 1, for a count against its limit. */
  meter?: number;
  /** The list the number counts, opened from the whole tile. */
  link?: LinkProps;
}

/**
 * One number and what it counts. A metric with a link opens the list behind
 * it; the label stays the link's name so a screen reader hears what it opens.
 */
export function Metric({ label, value, detail, meter, link }: MetricProps) {
  const body = (
    <>
      <span className="text-[13px] leading-[18px] text-muted-foreground">
        {label}
      </span>
      <span className="text-2xl leading-8 font-semibold tracking-tight tabular-nums">
        {value}
      </span>
      {meter === undefined ? null : (
        <span
          aria-hidden
          className="my-1 h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <span
            className="block h-full rounded-full bg-primary"
            style={{ width: `${Math.round(Math.min(1, Math.max(0, meter)) * 100)}%` }}
          />
        </span>
      )}
      {detail ? (
        <span className="flex items-baseline gap-2 text-[13px] leading-[18px] text-muted-foreground">
          {detail.tone ? (
            <span
              aria-hidden
              className={cn(
                "size-2 shrink-0 translate-y-[-1px] rounded-full",
                dotTone[detail.tone],
              )}
            />
          ) : null}
          {detail.text}
        </span>
      ) : null}
    </>
  );
  const frame = "grid min-w-0 content-start gap-1 rounded-lg border bg-card p-4";
  return link ? (
    <Link
      {...link}
      className={cn(
        frame,
        "outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={frame}>{body}</div>
  );
}
