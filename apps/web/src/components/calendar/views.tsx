import type { IsoWeekday } from "@faridalms/domain/timetable";
import type {
  ComponentProps,
  DragEvent,
  KeyboardEvent,
  ReactNode,
} from "react";

import { monthWeeks, onDay, weekOf } from "@faridalms/domain/calendar";
import { addDays, daysBetween } from "@faridalms/domain/school";
import { isoWeekday } from "@faridalms/domain/timetable";
import { cn } from "@faridalms/ui/cn";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { StatusBadge } from "@faridalms/ui/system/status";
import { Link } from "@tanstack/react-router";
import { CalendarDays, MapPin, Plus } from "lucide-react";
import { useState } from "react";

import type { calendarRangeQuery } from "~/queries/calendar";

import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";
import {
  formatWeekday,
  formatDate,
  formatNumber,
  secondaryDate,
} from "~/utils/datetime";

import type { Change } from "./Reschedule";

import {
  CATEGORY_LABEL,
  CATEGORY_MARK,
  eventTitle,
  specialDayLabel,
  timeLabel,
} from "./format";

type Range = Awaited<
  ReturnType<NonNullable<ReturnType<typeof calendarRangeQuery>["queryFn"]>>
>;
export type CalendarEvent = Range["events"][number];
export type SpecialDay = Range["days"][number];

const MAX_IN_CELL = 3;

export function CategoryIcon({
  category,
  className,
}: {
  category: CalendarEvent["category"];
  className?: string;
}) {
  const { icon: Icon, colour } = CATEGORY_MARK[category];
  return (
    <Icon
      className={cn("shrink-0", colour, className)}
      aria-hidden
      strokeWidth={2.25}
    />
  );
}

/** What the grid lets a viewer do beyond reading: add on a day, move and resize what they may edit. */
export interface GridActions {
  canAdd: boolean;
  movable: (event: CalendarEvent) => boolean;
  reschedule: (event: CalendarEvent, change: Change) => void;
}

interface Dragging {
  event: CalendarEvent;
  /** The day the event was picked up from, as one spanning days shows on each. */
  from: string;
  mode: "move" | "resize";
}

/**
 * Pointer dragging between the days of a grid. The event rides in React
 * state; the data transfer only carries its id, which Firefox needs before
 * it starts a drag at all.
 */
function useDrag(actions: GridActions | undefined) {
  const [dragging, setDragging] = useState<Dragging | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const start = (next: Dragging) => (event: DragEvent) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", next.event.id);
    setDragging(next);
  };
  const end = () => {
    setDragging(null);
    setOver(null);
  };
  const target = (day: string) =>
    actions && dragging
      ? {
          onDragOver: (event: DragEvent) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            if (over !== day) setOver(day);
          },
          onDrop: (event: DragEvent) => {
            event.preventDefault();
            const offset = daysBetween(dragging.from, day) - 1;
            end();
            if (offset !== 0)
              actions.reschedule(
                dragging.event,
                dragging.mode === "move"
                  ? { move: offset }
                  : { extend: offset },
              );
          },
        }
      : {};
  return { dragging, over, start, end, target };
}

/**
 * Alt with an arrow moves a focused event a day along the week, or a week up
 * or down; with Shift too it moves the event's last day instead. Left and
 * right follow the page's direction, as the grid does.
 */
function keyChange(event: KeyboardEvent): Change | null {
  if (!event.altKey || event.ctrlKey || event.metaKey) return null;
  const rtl = getTextDirection(getLocale()) === "rtl";
  const step =
    event.key === "ArrowRight"
      ? rtl
        ? -1
        : 1
      : event.key === "ArrowLeft"
        ? rtl
          ? 1
          : -1
        : event.key === "ArrowDown"
          ? 7
          : event.key === "ArrowUp"
            ? -7
            : 0;
  if (step === 0) return null;
  return event.shiftKey ? { extend: step } : { move: step };
}

/**
 * Where an event opens: the calendar's own sheet, or for a tour, assessment
 * or interview, the application it was booked for.
 */
function EventLink({
  event,
  ...rest
}: { event: CalendarEvent } & Omit<
  ComponentProps<"a">,
  "href" | "onDragStart" | "onDragEnd" | "onKeyDown"
> &
  Pick<
    ComponentProps<typeof Link>,
    "onDragStart" | "onDragEnd" | "onKeyDown"
  >) {
  return event.admission ? (
    <Link
      {...rest}
      to="/admissions/applications/$applicationId"
      params={{ applicationId: event.admission.applicationId }}
    />
  ) : (
    <Link
      {...rest}
      from="/calendar/"
      to="/calendar"
      search={(previous) => ({ ...previous, event: event.id })}
    />
  );
}

function EventChip({
  event,
  day,
  actions,
  drag,
}: {
  event: CalendarEvent;
  day: string;
  actions?: GridActions;
  drag?: ReturnType<typeof useDrag>;
}) {
  const movable = Boolean(actions?.movable(event) && drag);
  const last = day === event.endsOn;
  return (
    <div
      className={cn(
        "group/chip relative flex min-w-0 items-stretch rounded",
        drag?.dragging?.event.id === event.id && "opacity-50",
      )}
    >
      <EventLink
        event={event}
        title={eventTitle(event)}
        draggable={movable}
        onDragStart={
          movable && drag
            ? drag.start({ event, from: day, mode: "move" })
            : undefined
        }
        onDragEnd={drag?.end}
        onKeyDown={(key) => {
          if (!movable || !actions) return;
          const change = keyChange(key);
          if (!change) return;
          key.preventDefault();
          actions.reschedule(event, change);
        }}
        aria-describedby={movable ? "calendar-move-hint" : undefined}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 py-0.5 text-xs leading-4 hover:bg-accent",
          movable && "cursor-grab active:cursor-grabbing",
          event.cancelled && "text-muted-foreground line-through",
          event.state === "draft" &&
            "border border-dashed border-muted-foreground/50 text-muted-foreground",
        )}
      >
        {event.state === "draft" ? (
          <span className="sr-only">{m.calDraft()}</span>
        ) : null}
        <CategoryIcon
          category={event.category}
          className={cn("size-3", event.cancelled && "text-muted-foreground")}
        />
        {event.startTime ? (
          <span className="shrink-0 text-muted-foreground tabular-nums">
            <bdi dir="ltr">{event.startTime}</bdi>
          </span>
        ) : null}
        <bdi className="truncate">{eventTitle(event)}</bdi>
      </EventLink>
      {movable && last && drag ? (
        <span
          draggable
          aria-hidden
          title={m.calResizeHandle()}
          data-resize={event.id}
          onDragStart={drag.start({ event, from: day, mode: "resize" })}
          onDragEnd={drag.end}
          className="absolute inset-y-0 end-0 w-2 cursor-ew-resize rounded-e opacity-0 group-hover/chip:bg-primary/30 group-hover/chip:opacity-100"
        />
      ) : null}
    </div>
  );
}

/**
 * A link to start a new event on a day, shown to those who may write one. In
 * a grid it appears on hover; in the phone's list of days it is the only
 * way to add one, so it always shows, at a finger's size.
 */
function AddOnDay({ day, listed = false }: { day: string; listed?: boolean }) {
  return (
    <Link
      to="/event-editor"
      search={{ day }}
      aria-label={m.calNewOn({ date: formatDate(day, "weekday") })}
      className={cn(
        "grid place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground",
        listed
          ? "-ms-3 size-10"
          : "size-6 opacity-0 group-hover/day:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100",
      )}
    >
      <Plus className="size-3.5" aria-hidden />
    </Link>
  );
}

/** How to move and resize events without a pointer, for those who may. */
export function MoveHint({ children }: { children?: ReactNode }) {
  return (
    <p
      id="calendar-move-hint"
      className="text-[13px] leading-[18px] text-muted-foreground max-md:hidden"
    >
      {children ?? m.calMoveHint()}
    </p>
  );
}

/**
 * Weeks down, days across in the school's week order, mirrored in Arabic by
 * the page's direction. Staff read a month at a glance; phones get the agenda.
 */
export function MonthGrid({
  month,
  weekStart,
  weekend,
  today,
  events,
  days,
  actions,
}: {
  month: string;
  weekStart: IsoWeekday;
  weekend: readonly number[];
  today: string;
  events: CalendarEvent[];
  days: SpecialDay[];
  actions?: GridActions;
}) {
  const secondary = useCurrentUser().school.secondaryCalendar;
  const drag = useDrag(actions);
  const weeks = monthWeeks(month, weekStart);
  const special = new Map(days.map((row) => [row.day, row]));
  const header = weeks[0] ?? [];
  return (
    <table className="w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-lg border bg-card">
      <caption className="sr-only">{m.calMonthCaption()}</caption>
      <thead>
        <tr>
          {header.map((day) => (
            <th
              key={day}
              scope="col"
              className="border-b px-2 py-2 text-start text-xs leading-4 font-medium text-muted-foreground"
            >
              <abbr
                title={formatWeekday(isoWeekday(day))}
                className="no-underline"
              >
                {formatWeekday(isoWeekday(day), "short")}
              </abbr>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]}>
            {week.map((day) => {
              const inMonth = day.startsWith(month);
              const holiday = special.get(day);
              const on = events.filter((event) => onDay(event, day));
              const off = weekend.includes(isoWeekday(day));
              return (
                <td
                  key={day}
                  {...drag.target(day)}
                  data-day={day}
                  className={cn(
                    "group/day h-28 border-e border-b p-1 align-top last:border-e-0 [tr:last-child_&]:border-b-0",
                    (off || holiday) && "bg-muted/70",
                    !inMonth && "text-muted-foreground/70 [&_a]:opacity-70",
                    drag.over === day &&
                      "bg-primary/5 ring-2 ring-primary ring-inset",
                  )}
                >
                  <div className="flex items-center justify-between gap-1 px-1 pt-0.5">
                    <span
                      className={cn(
                        "grid size-6 place-items-center rounded-full text-xs leading-4 tabular-nums",
                        day === today &&
                          "bg-primary font-semibold text-primary-foreground",
                      )}
                      aria-current={day === today ? "date" : undefined}
                    >
                      {formatNumber(Number(day.slice(8)))}
                    </span>
                    {secondary && inMonth ? (
                      <span className="truncate text-[11px] leading-4 text-muted-foreground">
                        {secondaryDate(day, secondary)}
                      </span>
                    ) : null}
                    {actions?.canAdd ? <AddOnDay day={day} /> : null}
                  </div>
                  {holiday ? (
                    <p className="truncate px-1.5 text-xs leading-4 text-muted-foreground">
                      {specialDayLabel(holiday)}
                    </p>
                  ) : null}
                  {on.length > 0 ? (
                    <div className="mt-0.5 grid min-w-0 gap-px">
                      {on.slice(0, MAX_IN_CELL).map((event) => (
                        <EventChip
                          key={event.id}
                          event={event}
                          day={day}
                          actions={actions}
                          drag={drag}
                        />
                      ))}
                      {on.length > MAX_IN_CELL ? (
                        <Link
                          to="/calendar"
                          search={{
                            month: day.slice(0, 7),
                            view: "agenda" as const,
                          }}
                          hash={`day-${day}`}
                          className="px-1.5 text-xs leading-4 text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {m.calMore({
                            count: on.length - MAX_IN_CELL,
                            value: formatNumber(on.length - MAX_IN_CELL),
                          })}
                        </Link>
                      ) : null}
                    </div>
                  ) : null}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * One week of days side by side, each listing everything on it, for
 * planning a week at a time with room to drag events between its days.
 */
export function WeekGrid({
  day: anchor,
  weekStart,
  weekend,
  today,
  events,
  days,
  actions,
}: {
  day: string;
  weekStart: IsoWeekday;
  weekend: readonly number[];
  today: string;
  events: CalendarEvent[];
  days: SpecialDay[];
  actions?: GridActions;
}) {
  const secondary = useCurrentUser().school.secondaryCalendar;
  const drag = useDrag(actions);
  const week = weekOf(anchor, weekStart);
  const special = new Map(days.map((row) => [row.day, row]));
  return (
    <table className="w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-lg border bg-card">
      <caption className="sr-only">{m.calWeekCaption()}</caption>
      <thead>
        <tr>
          {week.map((day) => (
            <th
              key={day}
              scope="col"
              className="border-e border-b px-2 py-2 text-start align-top font-normal last:border-e-0"
            >
              <span className="flex items-center justify-between gap-1">
                <span className="grid gap-0.5">
                  <abbr
                    title={formatWeekday(isoWeekday(day))}
                    className="text-xs leading-4 font-medium text-muted-foreground no-underline"
                  >
                    {formatWeekday(isoWeekday(day), "short")}
                  </abbr>
                  <span
                    className={cn(
                      "grid size-7 place-items-center rounded-full text-sm leading-5 font-semibold tabular-nums",
                      day === today && "bg-primary text-primary-foreground",
                    )}
                    aria-current={day === today ? "date" : undefined}
                  >
                    {formatNumber(Number(day.slice(8)))}
                  </span>
                </span>
              </span>
              {secondary ? (
                <span className="block truncate text-[11px] leading-4 text-muted-foreground">
                  {secondaryDate(day, secondary)}
                </span>
              ) : null}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {week.map((day) => {
            const holiday = special.get(day);
            const on = events.filter((event) => onDay(event, day));
            const off = weekend.includes(isoWeekday(day));
            return (
              <td
                key={day}
                {...drag.target(day)}
                data-day={day}
                aria-label={formatDate(day, "weekday")}
                className={cn(
                  "group/day h-72 border-e p-1 align-top last:border-e-0",
                  (off || holiday) && "bg-muted/70",
                  drag.over === day &&
                    "bg-primary/5 ring-2 ring-primary ring-inset",
                )}
              >
                <div className="flex min-h-6 items-start justify-between gap-1">
                  {holiday ? (
                    <p className="min-w-0 px-1.5 pt-1 text-xs leading-4 text-muted-foreground">
                      {specialDayLabel(holiday)}
                    </p>
                  ) : (
                    <span />
                  )}
                  {actions?.canAdd ? <AddOnDay day={day} /> : null}
                </div>
                {on.length > 0 ? (
                  <div className="mt-0.5 grid min-w-0 gap-px">
                    {on.map((event) => (
                      <EventChip
                        key={event.id}
                        event={event}
                        day={day}
                        actions={actions}
                        drag={drag}
                      />
                    ))}
                  </div>
                ) : null}
              </td>
            );
          })}
        </tr>
      </tbody>
    </table>
  );
}

function AgendaItem({ event }: { event: CalendarEvent }) {
  return (
    <li className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-2.5 max-sm:grid-cols-1 max-sm:gap-1">
      <span className="text-sm leading-5 text-muted-foreground tabular-nums">
        <bdi dir="ltr">{timeLabel(event)}</bdi>
      </span>
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <EventLink
            event={event}
            className={cn(
              "min-w-0 text-sm leading-5 font-medium hover:text-primary hover:underline",
              event.cancelled && "text-muted-foreground line-through",
            )}
          >
            <bdi>{eventTitle(event)}</bdi>
          </EventLink>
          {event.state === "draft" ? (
            <StatusBadge tone="neutral">{m.calDraft()}</StatusBadge>
          ) : null}
          {event.cancelled ? (
            <StatusBadge tone="danger">{m.calCancelled()}</StatusBadge>
          ) : null}
          {event.provisional ? (
            <StatusBadge tone="warning">{m.calProvisional()}</StatusBadge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-[18px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CategoryIcon category={event.category} className="size-3.5" />
            {CATEGORY_LABEL[event.category]()}
          </span>
          {event.location ? (
            <span className="flex min-w-0 items-center gap-1">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <bdi className="truncate">{event.location}</bdi>
            </span>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/** Day by day, only the days with something on them. */
export function Agenda({
  from,
  to,
  today,
  events,
  days,
  className,
  everyDay = false,
  canAdd = false,
}: {
  from: string;
  to: string;
  today: string;
  events: CalendarEvent[];
  days: SpecialDay[];
  className?: string;
  /** A week on a phone lists every day, so a quiet day still shows its date. */
  everyDay?: boolean;
  canAdd?: boolean;
}) {
  const secondary = useCurrentUser().school.secondaryCalendar;
  const span: string[] = [];
  if (everyDay)
    for (let day = from; day <= to; day = addDays(day, 1)) span.push(day);
  const dates = [
    ...new Set([
      ...span,
      ...days.map((row) => row.day),
      ...events.flatMap((event) => {
        const list: string[] = [];
        for (
          let day = event.startsOn < from ? from : event.startsOn;
          day <= event.endsOn && day <= to;
          day = addDays(day, 1)
        )
          list.push(day);
        return list;
      }),
    ]),
  ]
    .filter((day) => day >= from && day <= to)
    .toSorted();
  if (dates.length === 0 && !everyDay)
    return (
      <div className={className}>
        <EmptyState
          icon={CalendarDays}
          title={m.calNothing()}
          description={m.calNothingBody()}
        />
      </div>
    );
  const special = new Map(days.map((row) => [row.day, row]));
  return (
    <ol
      className={cn("divide-y border-y", className)}
      aria-label={m.calAgenda()}
    >
      {dates.map((day) => {
        const holiday = special.get(day);
        const on = events.filter((event) => onDay(event, day));
        const notes = [
          secondary ? secondaryDate(day, secondary, "dayMonth") : "",
          holiday ? specialDayLabel(holiday) : "",
        ].filter(Boolean);
        return (
          <li
            key={day}
            id={`day-${day}`}
            className="grid scroll-mt-20 grid-cols-[3.25rem_minmax(0,1fr)] gap-3 py-2"
          >
            <DayMark day={day} today={today} />
            <div className="grid min-w-0 content-start">
              {notes.length ? (
                <p className="pt-2.5 text-[13px] leading-[18px] text-muted-foreground">
                  {notes.join(" · ")}
                </p>
              ) : null}
              {on.length > 0 ? (
                <ul className="divide-y">
                  {on.map((event) => (
                    <AgendaItem key={event.id} event={event} />
                  ))}
                </ul>
              ) : everyDay ? (
                <p className="pt-2.5 text-sm leading-5 text-muted-foreground">
                  {m.calNothingOnDay()}
                </p>
              ) : null}
              {everyDay && canAdd ? (
                <div className="pt-1">
                  <AddOnDay day={day} listed />
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** A day as a calendar app marks it: the weekday over its number, today filled. */
function DayMark({ day, today }: { day: string; today: string }) {
  return (
    <h2 className="grid content-start justify-items-center gap-0.5 pt-1.5 text-center">
      <span
        aria-hidden
        className="text-xs leading-4 font-medium text-muted-foreground uppercase"
      >
        {formatWeekday(isoWeekday(day), "short")}
      </span>
      <span
        aria-hidden
        className={cn(
          "grid size-9 place-items-center rounded-full text-lg leading-6 font-semibold tabular-nums",
          day === today && "bg-primary text-primary-foreground",
        )}
      >
        {formatNumber(Number(day.slice(8)))}
      </span>
      <span className="sr-only">
        {day === today
          ? `${formatDate(day, "weekday")}, ${m.calToday()}`
          : formatDate(day, "weekday")}
      </span>
    </h2>
  );
}

const MAX_DOTS = 3;

/**
 * A month on a phone: the days with a dot for each kind of event on them,
 * and the chosen day's events beneath, the way phone calendars show a month.
 */
export function MonthCompact({
  month,
  weekStart,
  weekend,
  today,
  events,
  days,
}: {
  month: string;
  weekStart: IsoWeekday;
  weekend: readonly number[];
  today: string;
  events: CalendarEvent[];
  days: SpecialDay[];
}) {
  const secondary = useCurrentUser().school.secondaryCalendar;
  const weeks = monthWeeks(month, weekStart);
  const special = new Map(days.map((row) => [row.day, row]));
  const start = today.startsWith(month) ? today : `${month}-01`;
  const [selected, setSelected] = useState(start);
  const [shown, setShown] = useState(month);
  if (shown !== month) {
    setShown(month);
    setSelected(start);
  }
  const chosen = events.filter((event) => onDay(event, selected));
  const holiday = special.get(selected);
  return (
    <div className="grid gap-4">
      <fieldset className="min-w-0">
        <legend className="sr-only">{m.calMonthCaption()}</legend>
        <div className="grid grid-cols-7 pb-1" aria-hidden>
          {(weeks[0] ?? []).map((day) => (
            <span
              key={day}
              className="text-center text-xs leading-4 font-medium text-muted-foreground"
            >
              {formatWeekday(isoWeekday(day), "short")}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]} className="grid grid-cols-7">
            {week.map((day) => {
              const inMonth = day.startsWith(month);
              const kinds = [
                ...new Set(
                  events
                    .filter((event) => onDay(event, day))
                    .map((event) => event.category),
                ),
              ];
              const quiet =
                weekend.includes(isoWeekday(day)) || special.has(day);
              return (
                <button
                  key={day}
                  type="button"
                  disabled={!inMonth}
                  aria-pressed={day === selected}
                  aria-label={
                    kinds.length
                      ? `${formatDate(day, "weekday")}, ${m.calHasEvents()}`
                      : formatDate(day, "weekday")
                  }
                  onClick={() => setSelected(day)}
                  className="group grid h-14 content-start justify-items-center gap-1 pt-1 disabled:opacity-30"
                >
                  <span
                    className={cn(
                      "grid size-8 place-items-center rounded-full text-sm leading-5 tabular-nums group-aria-pressed:ring-2 group-aria-pressed:ring-primary",
                      quiet && "text-muted-foreground",
                      day === today &&
                        "bg-primary font-semibold text-primary-foreground",
                    )}
                  >
                    {formatNumber(Number(day.slice(8)))}
                  </span>
                  <span className="flex h-1.5 gap-0.5" aria-hidden>
                    {kinds.slice(0, MAX_DOTS).map((kind) => (
                      <span
                        key={kind}
                        className={cn(
                          "size-1.5 rounded-full bg-current",
                          CATEGORY_MARK[kind].colour,
                        )}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </fieldset>
      <section aria-live="polite" className="grid gap-1 border-t pt-3">
        <h2 className="flex flex-wrap items-baseline gap-x-2 text-sm leading-5 font-semibold">
          {formatDate(selected, "weekday")}
          {secondary ? (
            <span className="text-[13px] font-normal text-muted-foreground">
              {secondaryDate(selected, secondary, "dayMonth")}
            </span>
          ) : null}
        </h2>
        {holiday ? (
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {specialDayLabel(holiday)}
          </p>
        ) : null}
        {chosen.length ? (
          <ul className="divide-y">
            {chosen.map((event) => (
              <AgendaItem key={event.id} event={event} />
            ))}
          </ul>
        ) : (
          <p className="py-2 text-sm leading-5 text-muted-foreground">
            {m.calNothingOnDay()}
          </p>
        )}
      </section>
    </div>
  );
}
