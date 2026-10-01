import type { IsoWeekday } from "@faridalms/domain/timetable";

import { monthWeeks, onDay } from "@faridalms/domain/calendar";
import { addDays } from "@faridalms/domain/school";
import { isoWeekday } from "@faridalms/domain/timetable";
import { cn } from "@faridalms/ui/cn";
import { Link } from "@tanstack/react-router";
import { CalendarDays, MapPin } from "lucide-react";
import { useState } from "react";

import type { calendarRangeQuery } from "~/queries/calendar";

import { EmptyState } from "~/components/system/IndexPage";
import { StatusBadge } from "~/components/system/status";
import { dayName } from "~/components/timetable/WeekGrid";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { formatNumber, secondaryDate } from "~/utils/datetime";

import {
  CATEGORY_LABEL,
  CATEGORY_MARK,
  eventTitle,
  specialDayLabel,
  timeLabel,
  weekdayDate,
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

function EventChip({ event }: { event: CalendarEvent }) {
  return (
    <Link
      from="/calendar/"
      to="/calendar"
      search={(previous) => ({ ...previous, event: event.id })}
      title={eventTitle(event)}
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-xs leading-4 hover:bg-accent",
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
    </Link>
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
              <abbr title={dayName(isoWeekday(day))} className="no-underline">
                {dayName(isoWeekday(day), "short")}
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
                  className={cn(
                    "h-28 border-e border-b p-1 align-top last:border-e-0 [tr:last-child_&]:border-b-0",
                    (off || holiday) && "bg-muted/70",
                    !inMonth && "text-muted-foreground/70 [&_a]:opacity-70",
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
                  </div>
                  {holiday ? (
                    <p className="truncate px-1.5 text-xs leading-4 text-muted-foreground">
                      {specialDayLabel(holiday)}
                    </p>
                  ) : null}
                  {on.length > 0 ? (
                    <div className="mt-0.5 grid min-w-0 gap-px">
                      {on.slice(0, MAX_IN_CELL).map((event) => (
                        <EventChip key={event.id} event={event} />
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

function AgendaItem({ event }: { event: CalendarEvent }) {
  return (
    <li className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-2.5 max-sm:grid-cols-1 max-sm:gap-1">
      <span className="text-sm leading-5 text-muted-foreground tabular-nums">
        <bdi dir="ltr">{timeLabel(event)}</bdi>
      </span>
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            from="/calendar/"
            to="/calendar"
            search={(previous) => ({ ...previous, event: event.id })}
            className={cn(
              "min-w-0 text-sm leading-5 font-medium hover:text-primary hover:underline",
              event.cancelled && "text-muted-foreground line-through",
            )}
          >
            <bdi>{eventTitle(event)}</bdi>
          </Link>
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
}: {
  from: string;
  to: string;
  today: string;
  events: CalendarEvent[];
  days: SpecialDay[];
  className?: string;
}) {
  const secondary = useCurrentUser().school.secondaryCalendar;
  const dates = [
    ...new Set([
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
  if (dates.length === 0)
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
          secondary
            ? secondaryDate(day, secondary, { day: "numeric", month: "long" })
            : "",
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
        {dayName(isoWeekday(day), "short")}
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
          ? `${weekdayDate(day)}, ${m.calToday()}`
          : weekdayDate(day)}
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
              {dayName(isoWeekday(day), "short")}
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
                      ? `${weekdayDate(day)}, ${m.calHasEvents()}`
                      : weekdayDate(day)
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
          {weekdayDate(selected)}
          {secondary ? (
            <span className="text-[13px] font-normal text-muted-foreground">
              {secondaryDate(selected, secondary, {
                day: "numeric",
                month: "long",
              })}
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
