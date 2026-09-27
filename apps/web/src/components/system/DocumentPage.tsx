import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  ArrowLeft,
  ChevronDown,
  LoaderCircle,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import {
  createContext,
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type { SaveState } from "~/hooks/useAutosave";

import { Button } from "~/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";
import { cn } from "~/utils/cn";

import type { ActionItem } from "./ActionMenu";
import type { Tone } from "./status";

import { ActionMenu } from "./ActionMenu";
import { PageActions } from "./PageActions";
import { StatusBadge } from "./status";

const NO_ACTIONS: ActionItem[] = [];

/** Where the details panel is drawn: beside the document, or in a sheet. */
const DetailsPlacement = createContext<"side" | "sheet">("side");

function useMedia(query: string) {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

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
  summary = [],
  details,
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
  /** The item's key settings in a few words, shown on phones in place of the panel. */
  summary?: string[];
  /** Opens the details on phones, where the panel is not beside the text. */
  details?: { open: boolean; onOpenChange: (open: boolean) => void };
  children: ReactNode;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = details?.open ?? ownOpen;
  const setOpen = details?.onOpenChange ?? setOwnOpen;
  const wide = useMedia("(min-width: 64rem)");
  const phone = !useMedia("(min-width: 48rem)");
  const inSheet = aside !== undefined && open && !wide;
  const end = getTextDirection(getLocale()) === "rtl" ? "left" : "right";
  // Focusing the first field would raise the phone keyboard before anything
  // is chosen, so the sheet starts at its title.
  const sheetTitle = useRef<HTMLHeadingElement>(null);
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
            ? "[grid-template-areas:'title'_'summary'_'body'] lg:grid-cols-[minmax(0,1fr)_280px] lg:[grid-template-areas:'title_title'_'body_aside']"
            : "max-w-[720px] [grid-template-areas:'title'_'body']",
        )}
      >
        <div className="max-w-[720px] min-w-0 [grid-area:title]">{title}</div>
        {aside ? (
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
            className="flex min-h-11 w-full min-w-0 items-center gap-3 rounded-lg border bg-card px-3 text-start text-sm [grid-area:summary] hover:bg-muted/50 lg:hidden"
          >
            <SlidersHorizontal
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <span className="shrink-0 font-medium">{m.docDetails()}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">
              {summary.filter(Boolean).join(" · ")}
            </span>
            <ChevronDown
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          </button>
        ) : null}
        {aside && !inSheet ? (
          <aside className="min-w-0 [grid-area:aside] max-lg:hidden lg:sticky lg:top-16 lg:self-start">
            {aside}
          </aside>
        ) : null}
        <div className="min-w-0 pb-24 [grid-area:body]">{children}</div>
      </div>
      {aside ? (
        <Sheet open={inSheet} onOpenChange={setOpen}>
          <SheetContent
            side={phone ? "bottom" : end}
            initialFocus={sheetTitle}
            className="gap-0 p-0 data-[side=bottom]:max-h-[88dvh] data-[side=bottom]:rounded-t-xl data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-[400px] data-[side=right]:sm:max-w-[400px]"
          >
            <SheetHeader className="border-b px-5 py-3.5 pe-14">
              <SheetTitle
                ref={sheetTitle}
                tabIndex={-1}
                className="text-base leading-6 font-semibold outline-none"
              >
                {m.docDetails()}
              </SheetTitle>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <DetailsPlacement value="sheet">{aside}</DetailsPlacement>
            </div>
            <SheetFooter className="border-t px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button
                type="button"
                className="h-10 w-full"
                onClick={() => setOpen(false)}
              >
                {m.docDone()}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      ) : null}
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
  // In the phone sheet the sheet's own title names it and frames it already.
  if (useContext(DetailsPlacement) === "sheet")
    return <div className="grid gap-5">{children}</div>;
  return (
    <section className="grid gap-5 rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** One group of settings inside the details panel, ruled off from the one above. */
export function DetailsSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 border-t pt-5 first-of-type:border-t-0 first-of-type:pt-0">
      <div className="grid gap-1">
        <h3 className="text-xs leading-4 font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </h3>
        {hint ? (
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}
