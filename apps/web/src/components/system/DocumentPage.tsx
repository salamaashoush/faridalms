import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { ArrowLeft, LoaderCircle, TriangleAlert } from "lucide-react";

import type { SaveState } from "~/hooks/useAutosave";

import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";

import type { ActionItem } from "./ActionMenu";
import type { Tone } from "./status";

import { ActionMenu } from "./ActionMenu";
import { PageActions } from "./PageActions";
import { StatusBadge } from "./status";

const NO_ACTIONS: ActionItem[] = [];

export interface PrimaryAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  pending?: boolean;
  disabled?: boolean;
}

function SaveIndicator({
  state,
  onRetry,
}: {
  state: SaveState;
  onRetry?: () => void;
}) {
  if (state === "saving")
    return (
      <span className="text-[13px] text-muted-foreground" aria-live="polite">
        {m.docSaving()}
      </span>
    );
  if (state === "saved")
    return (
      <span className="text-[13px] text-muted-foreground" aria-live="polite">
        {m.docSaved()}
      </span>
    );
  if (state === "error")
    return (
      <span
        className="inline-flex items-center gap-1.5 text-[13px] text-destructive"
        role="alert"
      >
        <TriangleAlert className="size-3.5" aria-hidden />
        {m.docSaveFailed()}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="font-medium underline underline-offset-2"
          >
            {m.docRetry()}
          </button>
        ) : null}
      </span>
    );
  return null;
}

/**
 * The frame for anything written in the editor and then published:
 * announcements, newsletters, coursework, lessons, posts. Drafts save
 * themselves; once published, edits wait for Update because families see
 * them at once.
 */
export function DocumentPage({
  heading,
  onBack,
  status,
  saveState = "idle",
  onRetry,
  unpublished,
  primary,
  preview,
  menu = NO_ACTIONS,
  title,
  aside,
  children,
}: {
  heading: string;
  onBack: () => void;
  status?: { label: string; tone: Tone };
  saveState?: SaveState;
  onRetry?: () => void;
  unpublished?: {
    onDiscard: () => void;
    onUpdate: () => void;
    pending?: boolean;
  };
  primary?: PrimaryAction;
  preview?: { label: string; onClick: () => void };
  menu?: ActionItem[];
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <PageActions
        leading={
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={m.docBack()}
                  onClick={onBack}
                />
              }
            >
              <ArrowLeft className="rtl:-scale-x-100" aria-hidden />
            </TooltipTrigger>
            <TooltipContent>{m.docBack()}</TooltipContent>
          </Tooltip>
        }
      >
        {status ? (
          <StatusBadge tone={status.tone} className="hidden sm:inline-flex">
            {status.label}
          </StatusBadge>
        ) : null}
        {unpublished ? (
          <>
            <span className="hidden text-[13px] text-muted-foreground sm:inline">
              {m.docUnsaved()}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={unpublished.pending}
              onClick={unpublished.onDiscard}
            >
              {m.docDiscard()}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={unpublished.pending}
              onClick={unpublished.onUpdate}
            >
              {unpublished.pending ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : null}
              {m.docUpdate()}
            </Button>
          </>
        ) : (
          <>
            <SaveIndicator state={saveState} onRetry={onRetry} />
            {preview ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={preview.onClick}
              >
                {preview.label}
              </Button>
            ) : null}
            {primary ? (
              <Button
                type="button"
                size="sm"
                disabled={primary.disabled || primary.pending}
                onClick={primary.onClick}
              >
                {primary.pending ? (
                  <LoaderCircle className="animate-spin" aria-hidden />
                ) : primary.icon ? (
                  <primary.icon aria-hidden />
                ) : null}
                {primary.label}
              </Button>
            ) : null}
          </>
        )}
        <ActionMenu label={m.docMoreActions()} actions={menu} />
      </PageActions>
      <h1 className="sr-only">{heading}</h1>
      <div
        className={cn(
          "mx-auto grid w-full max-w-[1080px] gap-x-12 gap-y-6",
          aside
            ? "[grid-template-areas:'title'_'aside'_'body'] lg:grid-cols-[minmax(0,1fr)_280px] lg:[grid-template-areas:'title_title'_'body_aside']"
            : "max-w-[720px] [grid-template-areas:'title'_'body']",
        )}
      >
        <div className="max-w-[720px] min-w-0 [grid-area:title]">{title}</div>
        {aside ? (
          <aside className="min-w-0 [grid-area:aside] lg:sticky lg:top-16 lg:self-start">
            {aside}
          </aside>
        ) : null}
        <div className="min-w-0 pb-24 [grid-area:body]">{children}</div>
      </div>
    </>
  );
}

export function DocumentTitle({
  value,
  onChange,
  label,
  placeholder,
  onEnter,
  maxLength = 255,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder: string;
  onEnter?: () => void;
  maxLength?: number;
  id?: string;
}) {
  const type =
    "col-start-1 row-start-1 text-[30px] leading-[38px] font-semibold tracking-tight";
  return (
    <div className="grid">
      <textarea
        id={id}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        maxLength={maxLength}
        rows={1}
        dir={value ? "auto" : undefined}
        onChange={(event) => onChange(event.target.value.replaceAll("\n", " "))}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onEnter?.();
          }
        }}
        className={cn(
          type,
          "block w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-muted-foreground/50",
        )}
      />
      <span
        aria-hidden
        className={cn(type, "invisible break-words whitespace-pre-wrap")}
      >
        {`${value || placeholder} `}
      </span>
    </div>
  );
}

export function DetailsPanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-5 rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}
