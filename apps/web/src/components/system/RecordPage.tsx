import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@faridalms/ui/avatar";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@faridalms/ui/tabs";
import { Pencil } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Value } from "~/components/app/primitives";
import * as m from "~/i18n/messages";

import type { ActionItem } from "./ActionMenu";
import type { PrimaryAction } from "./DocumentPage";
import type { Tone } from "./status";

import { ActionMenu } from "./ActionMenu";
import { PageActions } from "./PageActions";
import { StatusBadge, toneSurface } from "./status";

const NO_ACTIONS: ActionItem[] = [];
const NO_ALERTS: RecordAlert[] = [];
const NO_FACTS: HeaderFact[] = [];

export interface HeaderFact {
  label: string;
  value: ReactNode;
}

export interface RecordAlert {
  label: string;
  tone: "info" | "warning" | "danger";
  icon: LucideIcon;
}

/** A link standing alone in a list or a fact, given a 40px tap area on phones. */
export const phoneLink =
  "max-md:inline-flex max-md:min-h-10 max-md:items-center";

/**
 * Who the record is about, in one row: photo, name, status and a few facts,
 * then anything a reader must not miss. Facts carry their label for screen
 * readers only, because the value (a reference, a class) explains itself on
 * screen. On phones the actions move into the top bar's menu, as on every
 * other page.
 */
export function RecordHeader({
  title,
  photoUrl,
  initials,
  facts = NO_FACTS,
  status,
  alerts = NO_ALERTS,
  action,
  menu = NO_ACTIONS,
  tools,
  variant = "record",
}: {
  /** A document's title reads at the size it was written in. */
  variant?: "record" | "document";
  /** Small view controls before the menu, such as a document's width. */
  tools?: ReactNode;
  title: string;
  photoUrl?: string | null;
  initials?: string;
  facts?: HeaderFact[];
  status?: { label: string; tone: Tone };
  alerts?: RecordAlert[];
  action?: PrimaryAction;
  menu?: ActionItem[];
}) {
  const phoneActions: ActionItem[] = action
    ? [
        { label: action.label, icon: action.icon, onSelect: action.onClick },
        ...menu,
      ]
    : menu;
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      {phoneActions.length ? (
        <PageActions>
          <div data-keeps-global-tools className="md:hidden">
            <ActionMenu
              label={m.docMoreActions()}
              actions={phoneActions}
              className="max-md:size-10"
            />
          </div>
        </PageActions>
      ) : null}
      <div className="flex min-w-0 flex-1 basis-80 items-start gap-4">
        {initials !== undefined || photoUrl ? (
          <Avatar className="size-14 shrink-0 max-sm:size-12">
            {photoUrl ? <AvatarImage src={photoUrl} alt="" /> : null}
            <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
        ) : null}
        <div className="grid min-w-0 gap-1">
          <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1">
            <h1
              dir="auto"
              className={cn(
                "min-w-0 font-semibold tracking-tight break-words",
                variant === "document"
                  ? "text-[30px] leading-[38px]"
                  : "text-2xl leading-8",
              )}
            >
              {title}
            </h1>
            {status ? (
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            ) : null}
          </div>
          {facts.length ? (
            // Every fact is led by its separator, and the list is pulled back
            // by one separator's width and clipped, so the separator of a
            // fact that starts a line falls outside and none ends a line.
            <div className="-mx-1 overflow-x-clip px-1">
              <dl className="-ms-4 flex flex-wrap items-center gap-y-1 text-sm leading-5 text-muted-foreground">
                {facts.map((fact) => (
                  <div key={fact.label}>
                    <dt className="sr-only">{fact.label}</dt>
                    <dd className="relative ps-4">
                      <span
                        aria-hidden
                        className="absolute start-0 w-4 text-center"
                      >
                        ·
                      </span>
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {alerts.length ? (
            <ul className="flex flex-wrap gap-2 pt-2">
              {alerts.map((alert) => (
                <li
                  key={alert.label}
                  className={cn(
                    "inline-flex h-6 items-center gap-1.5 rounded-md border border-current/25 px-2 text-xs font-medium whitespace-nowrap",
                    toneSurface[alert.tone],
                  )}
                >
                  <alert.icon className="size-3.5 shrink-0" aria-hidden />
                  {alert.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      {action || menu.length || tools ? (
        <div className="flex shrink-0 items-center gap-2 max-md:hidden">
          {tools}
          <ActionMenu
            label={m.docMoreActions()}
            actions={menu}
            size="icon"
            className="max-md:size-10"
          />
          {action ? (
            <Button
              type="button"
              className="max-md:h-10"
              disabled={action.disabled || action.pending}
              onClick={action.onClick}
            >
              {action.icon ? <action.icon aria-hidden /> : null}
              {action.label}
            </Button>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

export interface RecordTab<T extends string> {
  value: T;
  label: string;
}

/**
 * Sections of a record as tabs whose value lives in the URL, so a reload, a
 * shared link or Back returns to the same place. On a phone the row scrolls
 * sideways rather than squeezing the labels, and the chosen tab is kept in
 * view.
 */
export function RecordTabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
  children,
}: {
  label: string;
  tabs: RecordTab<T>[];
  value: T;
  onChange: (value: T) => void;
  children: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const index = tabs.findIndex((tab) => tab.value === value);
  const [hidden, setHidden] = useState({ start: false, end: false });
  useEffect(() => {
    const tab =
      scroller.current?.querySelectorAll<HTMLElement>('[role="tab"]')[index];
    tab?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [index]);
  // A tab cut by the screen edge reads as the last one, so the edges fade
  // while there are tabs past them.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return undefined;
    const update = () => {
      const travelled = Math.abs(element.scrollLeft);
      const room = element.scrollWidth - element.clientWidth;
      const start = travelled > 1;
      const end = room - travelled > 1;
      setHidden((previous) =>
        previous.start === start && previous.end === end
          ? previous
          : { start, end },
      );
    };
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        const match = tabs.find((tab) => tab.value === next);
        if (match) onChange(match.value);
      }}
      className="gap-6"
    >
      <div
        ref={scroller}
        data-fade-start={hidden.start || undefined}
        data-fade-end={hidden.end || undefined}
        className="-mx-4 scroll-px-4 [scrollbar-width:none] overflow-x-auto border-b [mask-image:linear-gradient(to_var(--fade-to),transparent,#000_var(--fade-start),#000_calc(100%_-_var(--fade-end)),transparent)] ps-4 [--fade-end:0px] [--fade-start:0px] [--fade-to:right] data-fade-end:[--fade-end:2.5rem] data-fade-start:[--fade-start:2.5rem] sm:mx-0 sm:scroll-px-0 sm:ps-0 rtl:[--fade-to:left] [&::-webkit-scrollbar]:hidden"
      >
        {/* The end gap is padding on the list rather than on the scroller,
            where it is not part of what scrolls. */}
        <TabsList
          variant="line"
          aria-label={label}
          className="h-10 w-max gap-5 rounded-none p-0 group-data-horizontal/tabs:h-10 max-sm:pe-4"
        >
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.value}
              value={tab.value}
              className="h-full flex-none rounded-none px-0.5 text-sm text-muted-foreground after:bg-primary group-data-horizontal/tabs:after:bottom-0 hover:text-foreground focus-visible:ring-inset max-md:h-11 data-active:text-foreground"
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {tabs.map((tab) => (
        <TabsContent
          key={tab.value}
          value={tab.value}
          className="min-w-0 rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {tab.value === value ? children : null}
        </TabsContent>
      ))}
    </Tabs>
  );
}

/**
 * The body under the tabs: the record itself in two thirds, supporting facts
 * in the last third, one column on narrower screens. The main column keeps its
 * width when a tab has nothing supporting, so tabs do not jump as they change.
 */
export function RecordColumns({
  main,
  aside,
}: {
  main: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="grid min-w-0 content-start gap-6 lg:col-span-2">
        {main}
      </div>
      {aside ? (
        <div className="grid min-w-0 content-start gap-6">{aside}</div>
      ) : null}
    </div>
  );
}

/**
 * A read-only part of a record. Editing happens in a sheet opened from the
 * section's Edit button, never inline.
 */
export function RecordSection({
  title,
  description,
  edit,
  action,
  variant = "card",
  children,
}: {
  title: string;
  description?: ReactNode;
  edit?: { label: string; onClick: () => void };
  action?: ReactNode;
  /** Under a document read as a page, a part is ruled off rather than framed. */
  variant?: "card" | "page";
  children: ReactNode;
}) {
  const headingId = useId();
  const page = variant === "page";
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "@container min-w-0",
        page
          ? "border-t pt-6"
          : "rounded-lg border bg-card text-card-foreground",
      )}
    >
      <div
        className={cn(
          "flex items-start justify-between gap-x-3",
          page ? "" : "px-5 pt-4",
        )}
      >
        <div className="min-w-0 flex-1 py-1.5">
          <h2 id={headingId} className="text-base leading-6 font-semibold">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-[13px] leading-[18px] text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action || edit ? (
          <div className="-me-2 flex shrink-0 items-center gap-1">
            {action}
            {edit ? (
              <Button
                type="button"
                variant="ghost"
                className="max-md:h-10"
                aria-label={edit.label}
                onClick={edit.onClick}
              >
                <Pencil aria-hidden />
                {m.recordEdit()}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className={page ? "pt-3" : "px-5 pt-3 pb-5"}>{children}</div>
    </section>
  );
}

/**
 * Label-and-value pairs that reflow with the section's own width, so the same
 * section reads well in the main column and in the narrow supporting one.
 * Short values such as counts can sit two to a row even there.
 */
export function Facts({
  short = false,
  children,
}: {
  short?: boolean;
  children: ReactNode;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4",
        short
          ? "grid-cols-2 @md:grid-cols-3"
          : "@md:grid-cols-2 @3xl:grid-cols-3",
      )}
    >
      {children}
    </dl>
  );
}

/**
 * One label and value. A missing value reads "Not recorded", so an empty
 * field is never mistaken for a page that failed to load. Text is isolated
 * with its own direction, since what people type ("12 Nile View") must not
 * be reordered by an Arabic page.
 */
export function Fact({
  label,
  children,
  wide = false,
  notApplicable = false,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
  notApplicable?: boolean;
}) {
  return (
    <div className={cn("min-w-0", wide && "@md:col-span-full")}>
      <dt className="text-[13px] leading-[18px] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm leading-5 break-words">
        <Value notApplicable={notApplicable}>
          {typeof children === "string" && children.trim() ? (
            <span dir="auto">{children}</span>
          ) : (
            children
          )}
        </Value>
      </dd>
    </div>
  );
}

export function RecordList({ children }: { children: ReactNode }) {
  return <ul className="-my-3 divide-y">{children}</ul>;
}

export function RecordEmpty({ children }: { children: ReactNode }) {
  return <p className="text-sm leading-5 text-muted-foreground">{children}</p>;
}
