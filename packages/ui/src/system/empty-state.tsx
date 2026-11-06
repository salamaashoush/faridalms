import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "../button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../empty";
import { SearchX } from "lucide-react";

import { useSystemStrings } from "./provider";

export interface EmptyStateProps {
  icon?: LucideIcon;
  /** Action-led: what to do to have something here. */
  title: string;
  description?: string;
  /** The one primary button that fills it. */
  action?: ReactNode;
}

/** A list or area with nothing in it yet. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <Empty className="gap-5 border bg-card px-6 py-16">
      <EmptyHeader className="gap-1">
        {Icon ? (
          <EmptyMedia
            variant="icon"
            className="mb-3 rounded-full text-muted-foreground"
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
}

/** A search or filter that matched nothing, with the way back to everything. */
export function FilteredEmptyState({ onClear }: FilteredEmptyStateProps) {
  const strings = useSystemStrings();
  return (
    <EmptyState
      icon={SearchX}
      title={strings.noResultsTitle}
      description={strings.noResultsBody}
      action={
        onClear ? (
          <Button type="button" variant="outline" onClick={onClear}>
            {strings.clearFilters}
          </Button>
        ) : null
      }
    />
  );
}
