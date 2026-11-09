import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "../button";
import { cn } from "../cn";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../empty";
import { CircleCheck, LockKeyhole, SearchX } from "lucide-react";
import { createContext, useContext } from "react";

import { useSystemStrings } from "./provider";

/**
 * Where an empty state stands. `page` stands in for a page's or a tab's
 * whole list; `section` sits inside a titled section, card or panel, whose
 * own heading already says what is missing.
 */
export type EmptyStatePlacement = "page" | "section";

/**
 * Why it is empty: nothing there yet, nothing left to do, or nothing the
 * viewer may see. The last two draw their own icon, so they read alike on
 * every page.
 */
export type EmptyStateKind = "empty" | "done" | "restricted";

const PlacementContext = createContext<EmptyStatePlacement>("page");

export interface EmptyStateScopeProps {
  children: ReactNode;
}

/**
 * Marks its content as inside a section, so an empty state there (one of
 * its own or a table's) draws as the section's quiet line rather than a
 * framed box inside a frame.
 */
export function EmptyStateScope({ children }: EmptyStateScopeProps) {
  return (
    <PlacementContext.Provider value="section">
      {children}
    </PlacementContext.Provider>
  );
}

export interface EmptyStateProps {
  /** The kind of thing that would be here; `done` and `restricted` bring their own. */
  icon?: LucideIcon;
  /** Action-led where the viewer can fill it, else what will be here. */
  title: string;
  description?: string;
  /** The one action that fills it, or the way to whoever can. */
  action?: ReactNode;
  /** Defaults to `section` inside an `EmptyStateScope`, else `page`. */
  placement?: EmptyStatePlacement;
  kind?: EmptyStateKind;
}

const KIND_ICON: Record<EmptyStateKind, LucideIcon | undefined> = {
  empty: undefined,
  done: CircleCheck,
  restricted: LockKeyhole,
};

/** A list or area with nothing in it, said the same way wherever it stands. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  placement,
  kind = "empty",
}: EmptyStateProps) {
  const scoped = useContext(PlacementContext);
  const Icon = KIND_ICON[kind] ?? icon;
  if ((placement ?? scoped) === "section") {
    // The section's heading names what is missing, so the thing's own icon
    // would only repeat it; only a state that is not "nothing yet" is marked.
    const Mark = KIND_ICON[kind];
    return (
      <div data-slot="empty-state" className="grid justify-items-start gap-3">
        <div className="flex items-start gap-2">
          {Mark ? (
            <Mark
              aria-hidden
              className={cn(
                "mt-0.5 size-4 shrink-0",
                kind === "done" ? "text-success" : "text-muted-foreground",
              )}
            />
          ) : null}
          <div className="grid gap-0.5">
            <p className="text-sm leading-5 text-muted-foreground">{title}</p>
            {description ? (
              <p className="text-[13px] leading-[18px] text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {action}
      </div>
    );
  }
  return (
    <Empty
      data-slot="empty-state"
      className="gap-5 border bg-card px-6 py-16"
    >
      <EmptyHeader className="gap-1">
        {Icon ? (
          <EmptyMedia
            variant="icon"
            className={cn(
              "mb-3 rounded-full",
              kind === "done"
                ? "bg-success/10 text-success"
                : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" aria-hidden />
          </EmptyMedia>
        ) : null}
        <EmptyTitle className="text-base leading-6 font-semibold tracking-normal">
          <h2>{title}</h2>
        </EmptyTitle>
        {description ? (
          <EmptyDescription className="text-sm leading-5">
            {description}
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

export interface FilteredEmptyStateProps {
  onClear?: () => void;
  /** Names what was searched for when the general wording would not. */
  title?: string;
  description?: string;
  placement?: EmptyStatePlacement;
}

/** A search or filter that matched nothing, with the way back to everything. */
export function FilteredEmptyState({
  onClear,
  title,
  description,
  placement,
}: FilteredEmptyStateProps) {
  const strings = useSystemStrings();
  const scoped = useContext(PlacementContext);
  const section = (placement ?? scoped) === "section";
  return (
    <EmptyState
      icon={SearchX}
      placement={placement}
      title={title ?? strings.noResultsTitle}
      description={
        description ?? (title || section ? undefined : strings.noResultsBody)
      }
      action={
        onClear ? (
          <Button
            type="button"
            variant="outline"
            size={section ? "sm" : "default"}
            onClick={onClear}
          >
            {strings.clearFilters}
          </Button>
        ) : null
      }
    />
  );
}
