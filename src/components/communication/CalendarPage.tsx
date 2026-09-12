import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
} from "lucide-react";

import type { CalendarQuery } from "~/schema/school";

import {
  EVENT_CATEGORY_CLASS,
  EVENT_CATEGORY_LABEL,
} from "~/components/app/labels";
import {
  EmptyState,
  PageHeader,
  SectionCard,
} from "~/components/app/primitives";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { calendarQuery } from "~/queries/school";
import { EVENT_CATEGORIES } from "~/schema/school";
import { cn } from "~/utils/cn";
import { formatDate, formatMonthLabel, formatNumber } from "~/utils/datetime";
import { isWithin, monthGrid, shiftMonth } from "~/utils/school";

type EventCategory = (typeof EVENT_CATEGORIES)[number];

interface CalendarEvent {
  id: string;
  title: string;
  category: EventCategory;
  startsOn: string;
  endsOn: string;
  provisional: boolean;
}

const WEEKDAY_LABEL = [
  m.daySunday,
  m.dayMonday,
  m.dayTuesday,
  m.dayWednesday,
  m.dayThursday,
  m.dayFriday,
  m.daySaturday,
];

/** 1970-01-04 was a Sunday, so the offset indexes Sunday through Saturday. */
function weekdayShort(index: number): string {
  return new Intl.DateTimeFormat(getLocale(), {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(1970, 0, 4 + index)));
}

function eventRange(event: CalendarEvent): string {
  return event.startsOn === event.endsOn
    ? formatDate(event.startsOn)
    : m.commCalendarDateRange({
        from: formatDate(event.startsOn),
        to: formatDate(event.endsOn),
      });
}

export function CalendarPage({ search }: { search: CalendarQuery }) {
  const navigate = useNavigate();
  const { month, today, monthEvents, allEvents } = useSuspenseQuery(
    calendarQuery({ month: search.month, categories: search.categories }),
  ).data;

  const setSearch = (patch: Partial<CalendarQuery>) => {
    void navigate({ to: ".", search: { ...search, ...patch } });
  };

  const selected = search.categories;
  const visible = monthEvents.filter(
    (event) => selected.length === 0 || selected.includes(event.category),
  );
  const weeks = monthGrid(month);
  const monthLabel = formatMonthLabel(month);

  return (
    <>
      <PageHeader
        title={m.calendarTitle()}
        description={m.commCalendarSubtitle()}
      />

      <SectionCard
        title={monthLabel}
        actions={
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={m.commonPreviousMonth()}
              onClick={() => setSearch({ month: shiftMonth(month, -1) })}
            >
              <ChevronLeft className="rtl:rotate-180" aria-hidden />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSearch({ month: "" })}
            >
              {m.commonToday()}
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={m.commonNextMonth()}
              onClick={() => setSearch({ month: shiftMonth(month, 1) })}
            >
              <ChevronRight className="rtl:rotate-180" aria-hidden />
            </Button>
          </div>
        }
      >
        <table className="w-full table-fixed border-collapse">
          <caption className="sr-only">
            {m.commCalendarMonthCaption({ month: monthLabel })}
          </caption>
          <thead>
            <tr>
              {WEEKDAY_LABEL.map((label, index) => (
                <th
                  key={label()}
                  scope="col"
                  className="pb-2 text-xs font-medium text-muted-foreground"
                >
                  <span className="sr-only">{label()}</span>
                  <span aria-hidden>{weekdayShort(index)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week.find((day) => day !== null) ?? month}>
                {week.map((day, index) => {
                  if (day === null) {
                    return (
                      <td
                        // Padding cells carry no date, so their position in the
                        // week is the only stable key available.
                        key={`${month}-pad-${String(index)}`}
                        aria-hidden
                        className="h-20 border border-border bg-muted/30 sm:h-24"
                      />
                    );
                  }

                  const isToday = day === today;
                  const dayEvents = visible.filter((event) =>
                    isWithin(day, event.startsOn, event.endsOn),
                  );

                  return (
                    <td
                      key={day}
                      aria-current={isToday ? "date" : undefined}
                      className={cn(
                        "h-20 border border-border p-1 align-top sm:h-24",
                        isToday && "bg-primary/5",
                      )}
                    >
                      <span className="sr-only">
                        {isToday
                          ? m.commCalendarTodayCell({ date: formatDate(day) })
                          : formatDate(day)}
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                          isToday
                            ? "bg-primary font-semibold text-primary-foreground"
                            : "text-muted-foreground",
                        )}
                      >
                        {formatNumber(Number(day.slice(8)))}
                      </span>
                      {dayEvents.length > 0 ? (
                        <ul className="mt-1 flex flex-col gap-0.5">
                          {dayEvents.map((event) => (
                            <li key={event.id}>
                              <span
                                title={event.title}
                                className={cn(
                                  "flex items-center gap-1 overflow-hidden rounded border px-1 py-0.5 text-[0.65rem] leading-tight",
                                  EVENT_CATEGORY_CLASS[event.category],
                                )}
                              >
                                {event.provisional ? (
                                  <>
                                    <CircleDashed
                                      className="size-2.5 shrink-0"
                                      aria-hidden
                                    />
                                    <span className="sr-only">
                                      {m.commonProvisional()}
                                    </span>
                                  </>
                                ) : null}
                                <span className="min-w-0 truncate">
                                  {event.title}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {m.commCalendarLegend()}
          </h3>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {EVENT_CATEGORIES.map((category) => (
              <li key={category} className="flex items-center gap-2 text-xs">
                <span
                  aria-hidden
                  className={cn(
                    "size-3 rounded-sm border",
                    EVENT_CATEGORY_CLASS[category],
                  )}
                />
                {EVENT_CATEGORY_LABEL[category]()}
              </li>
            ))}
            <li className="flex items-center gap-2 text-xs">
              <CircleDashed
                className="size-3 text-muted-foreground"
                aria-hidden
              />
              {m.commonProvisional()}
            </li>
          </ul>
        </div>
      </SectionCard>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {m.calendarAgenda()}
        </h2>
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">{m.commCalendarCategories()}</legend>
          {EVENT_CATEGORIES.map((category) => {
            const active = selected.includes(category);
            return (
              <button
                key={category}
                type="button"
                aria-pressed={active}
                onClick={() =>
                  setSearch({
                    categories: active
                      ? selected.filter((value) => value !== category)
                      : [...selected, category],
                  })
                }
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {active ? <Check className="size-3" aria-hidden /> : null}
                {EVENT_CATEGORY_LABEL[category]()}
              </button>
            );
          })}
          {selected.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearch({ categories: [] })}
            >
              {m.commonClear()}
            </Button>
          ) : null}
        </fieldset>
      </div>

      <Agenda allEvents={allEvents} />
    </>
  );
}

/** `allEvents` is the whole school year, already narrowed by the server filter. */
function Agenda({ allEvents }: { allEvents: CalendarEvent[] }) {
  if (allEvents.length === 0) {
    return (
      <div className="mt-4">
        <EmptyState icon={CalendarDays} body={m.commCalendarAgendaEmpty()} />
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-3">
      {EVENT_CATEGORIES.map((category) => {
        const events = allEvents.filter((event) => event.category === category);
        return (
          <SectionCard
            key={category}
            title={EVENT_CATEGORY_LABEL[category]()}
            description={m.commCalendarEventCount({
              count: formatNumber(events.length),
            })}
          >
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {m.commCalendarAgendaEmpty()}
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {events.map((event) => (
                  <li
                    key={event.id}
                    className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span
                        aria-hidden
                        className={cn(
                          "size-2.5 shrink-0 rounded-full border",
                          EVENT_CATEGORY_CLASS[category],
                        )}
                      />
                      <span className="text-sm font-medium">{event.title}</span>
                      {event.provisional ? (
                        <Badge variant="outline">{m.commonProvisional()}</Badge>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {eventRange(event)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}
