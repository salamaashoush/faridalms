import type { LinkProps } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";

import { cn } from "@faridalms/ui/cn";
import {
  phoneLink,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { Link } from "@tanstack/react-router";

import { UserText } from "~/components/system/UserText";

export const itemLink = cn(
  "justify-self-start text-sm leading-5 font-medium hover:text-primary hover:underline",
  phoneLink,
);

/** One side of a staff member's day: its cards, in the order they matter. */
export interface DayCards {
  today: string;
  main: ReactNode[];
  aside: ReactNode[];
}

export interface HomeCardProps {
  title: string;
  description?: ReactNode;
  action?: { label: string; link: LinkProps };
  children: ReactNode;
}

/**
 * One card of a home page: what it is about, a short list, and the one thing
 * to do about it. A card with nothing in it is not shown at all.
 */
export function HomeCard({
  title,
  description,
  action,
  children,
}: HomeCardProps) {
  return (
    <RecordSection
      title={title}
      description={description}
      action={
        action ? (
          <Link
            {...action.link}
            className={cn(
              "inline-flex min-h-8 items-center rounded-md px-2 text-sm font-medium text-primary underline-offset-4 hover:underline",
              phoneLink,
            )}
          >
            {action.label}
          </Link>
        ) : undefined
      }
    >
      {children}
    </RecordSection>
  );
}

export interface HomeListProps {
  children: ReactNode;
}

export function HomeList({ children }: HomeListProps) {
  return <RecordList>{children}</RecordList>;
}

export interface HomeItemProps {
  title: ReactNode;
  /** Short facts; one that is an element, such as a link, carries its own key. */
  facts?: (string | ReactElement | null | undefined)[];
  summary?: string;
  status?: ReactNode;
}

export function HomeItem({ title, facts, summary, status }: HomeItemProps) {
  const shown = (facts ?? []).filter((fact): fact is string | ReactElement =>
    Boolean(fact),
  );
  // The title's first line and the status share one row box, as tall as
  // the title's link is on a phone, so the two line up.
  const row = "flex min-h-5 items-center max-md:min-h-10";
  return (
    <li className="flex items-start justify-between gap-x-4 py-3">
      <div className="grid min-w-0 gap-0.5">
        <div className={row}>{title}</div>
        {shown.length ? (
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {shown.map((fact, index) => (
              <span key={typeof fact === "string" ? fact : String(fact.key)}>
                {index ? " · " : null}
                <span className="whitespace-nowrap">{fact}</span>
              </span>
            ))}
          </span>
        ) : null}
        {summary ? (
          <UserText
            text={summary}
            lines={2}
            className="text-[13px] leading-[18px] text-muted-foreground"
          />
        ) : null}
      </div>
      {status ? <div className={cn(row, "shrink-0")}>{status}</div> : null}
    </li>
  );
}
