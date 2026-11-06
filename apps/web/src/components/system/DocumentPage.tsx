import type { ContentDocument } from "@faridalms/domain/content";
import type { DocumentTemplateKind } from "@faridalms/domain/templates";
import type { EditorMedia } from "@faridalms/editor";
import type {
  ActionItem,
  PrimaryAction,
} from "@faridalms/ui/system/action-menu";
import type { Tone } from "@faridalms/ui/system/status";
import type { ReactNode } from "react";

import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@faridalms/ui/sheet";
import { ActionMenu } from "@faridalms/ui/system/action-menu";
import { PageActions } from "@faridalms/ui/system/page-actions";
import { StatusBadge } from "@faridalms/ui/system/status";
import { Tooltip, TooltipContent, TooltipTrigger } from "@faridalms/ui/tooltip";
import {
  ArrowLeft,
  ChevronDown,
  History,
  LayoutTemplate,
  Link,
  LoaderCircle,
  SlidersHorizontal,
  TriangleAlert,
} from "lucide-react";
import { createContext, useContext, useRef, useState } from "react";
import { toast } from "sonner";

import type {
  BuiltInGroup,
  BuiltInPiece,
} from "~/components/content/Templates";
import type { Printable } from "~/components/print/usePrint";
import type { SaveState } from "~/hooks/useAutosave";

import { DocumentHistory } from "~/components/content/DocumentHistory";
import {
  SaveTemplateDialog,
  TemplatePicker,
} from "~/components/content/Templates";
import { usePrint } from "~/components/print/usePrint";
import { useMedia } from "~/hooks/useMedia";
import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";

const NO_ACTIONS: ActionItem[] = [];

/** Where the details panel is drawn: beside the document, or in a sheet. */
const DetailsPlacement = createContext<"side" | "sheet">("side");

export function SaveIndicator({
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

/** Why a draft with changes cannot be stored yet, in place of the save state. */
export function NotSaved({ reason }: { reason: string }) {
  return (
    <span
      className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground"
      aria-live="polite"
    >
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate max-sm:sr-only">{reason}</span>
    </span>
  );
}

/**
 * Changes readers would see at once, held back until Update: what waits,
 * and the ways to drop or apply it.
 */
export function HeldChanges({
  waiting,
  onDiscard,
  onUpdate,
  pending,
  updateLabel,
  quiet = false,
}: {
  waiting?: string;
  onDiscard?: () => void;
  onUpdate: () => void;
  pending?: boolean;
  updateLabel?: string;
  /** Beside a surface's own primary action, Update is not the primary one. */
  quiet?: boolean;
}) {
  return (
    <>
      <span className="hidden text-[13px] text-muted-foreground sm:inline">
        {waiting ?? m.docUnsaved()}
      </span>
      {onDiscard ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={onDiscard}
        >
          {m.docDiscard()}
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant={quiet ? "outline" : "default"}
        disabled={pending}
        onClick={onUpdate}
      >
        {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : null}
        {updateLabel ?? m.docUpdate()}
      </Button>
    </>
  );
}

/**
 * The frame for anything written in the editor and then published:
 * announcements, news, coursework, lessons. Drafts save
 * themselves; once published, edits wait for Update because families see
 * them at once.
 */
export function DocumentPage({
  heading,
  onBack,
  status,
  saveState = "idle",
  onRetry,
  notSaved,
  unpublished,
  primary,
  preview,
  menu = NO_ACTIONS,
  link,
  history,
  templates,
  print,
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
  /** Why a draft with changes cannot be stored yet, in place of the save state. */
  notSaved?: string;
  unpublished?: {
    /** Absent when there is nothing earlier to go back to. */
    onDiscard?: () => void;
    onUpdate: () => void;
    pending?: boolean;
    /**
     * Where edits are stored as they are made and only wait to be shown,
     * what waits, said in place of "unsaved", beside the save state.
     */
    waiting?: string;
    updateLabel?: string;
  };
  primary?: PrimaryAction;
  preview?: { label: string; onClick: () => void };
  menu?: ActionItem[];
  /** Where readers open the document, copied from the menu once it is stored. */
  link?: string;
  /** The document's earlier versions, offered from the menu, and how to bring one back. */
  history?: {
    hostType: string;
    hostId: string;
    onRestore: (content: ContentDocument) => void;
  };
  /** The document as it prints, from the menu; answers only for its teachers. */
  print?: Printable;
  /** Templates of this kind: offered on an empty document, and kept from the menu. */
  templates?: {
    kind: DocumentTemplateKind;
    empty: boolean;
    content: ContentDocument;
    title: string;
    onApply: (content: ContentDocument, shape?: BuiltInPiece) => void;
    /** Offers the ready-made young activities, storing their pictures through this. */
    starters?: EditorMedia;
    /** Shapes the product offers for this kind, ahead of the school's own. */
    builtIn?: BuiltInGroup;
  };
  title: ReactNode;
  aside?: ReactNode;
  /** The item's key settings in a few words, shown on phones in place of the panel. */
  summary?: string[];
  /** Opens the details on phones, where the panel is not beside the text. */
  details?: { open: boolean; onOpenChange: (open: boolean) => void };
  children: ReactNode;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const printing = usePrint(print ?? null);
  const [keeping, setKeeping] = useState(false);
  const actions: ActionItem[] = [
    ...(link
      ? [
          {
            label: m.fileCopyLink(),
            icon: Link,
            onSelect: () =>
              navigator.clipboard
                .writeText(new URL(link, window.location.origin).href)
                .then(
                  () => toast.success(m.fileLinkCopied()),
                  () => toast.error(m.docCopyFailed()),
                ),
          },
        ]
      : []),
    ...(history
      ? [
          {
            label: m.docHistory(),
            icon: History,
            onSelect: () => setHistoryOpen(true),
          },
        ]
      : []),
    ...(printing.action ? [printing.action] : []),
    ...(templates && !templates.empty
      ? [
          {
            label: m.tplSaveTitle(),
            icon: LayoutTemplate,
            onSelect: () => setKeeping(true),
          },
        ]
      : []),
    ...menu,
  ];
  const open = details?.open ?? ownOpen;
  const setOpen = details?.onOpenChange ?? setOwnOpen;
  const wideScreen = useMedia("(min-width: 64rem)");
  const phone = !useMedia("(min-width: 48rem)");
  const inSheet = aside !== undefined && open && !wideScreen;
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
            {unpublished.waiting ? (
              <SaveIndicator state={saveState} onRetry={onRetry} />
            ) : null}
            <HeldChanges {...unpublished} />
          </>
        ) : (
          <>
            {notSaved ? (
              <NotSaved reason={notSaved} />
            ) : (
              <SaveIndicator state={saveState} onRetry={onRetry} />
            )}
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
        <ActionMenu label={m.docMoreActions()} actions={actions} />
      </PageActions>
      <h1 className="sr-only">{heading}</h1>
      <div
        className={cn(
          "mx-auto grid w-full max-w-[1080px] grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-6",
          aside
            ? "[grid-template-areas:'title'_'summary'_'body'] lg:grid-cols-[minmax(0,1fr)_280px] lg:[grid-template-areas:'title_title'_'body_aside']"
            : "max-w-[720px] [grid-template-areas:'title'_'body']",
        )}
      >
        <div className="grid max-w-[720px] min-w-0 gap-3 [grid-area:title]">
          {title}
          {templates?.empty ? (
            <TemplatePicker
              kind={templates.kind}
              onApply={templates.onApply}
              starters={templates.starters}
              builtIn={templates.builtIn}
            />
          ) : null}
        </div>
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
      {templates && keeping ? (
        <SaveTemplateDialog
          open={keeping}
          onOpenChange={setKeeping}
          piece={{ kind: templates.kind, content: templates.content }}
          suggestedTitle={templates.title}
        />
      ) : null}
      {printing.sheet}
      {history ? (
        <DocumentHistory
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          hostType={history.hostType}
          hostId={history.hostId}
          onRestore={(restored) => {
            if (restored.kind === "document")
              history.onRestore(restored.content);
          }}
        />
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
    <section className="grid grid-cols-[minmax(0,1fr)] gap-4 border-t pt-5 first-of-type:border-t-0 first-of-type:pt-0">
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
