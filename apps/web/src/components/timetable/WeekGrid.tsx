import type { ReactNode } from "react";

import { addDays } from "@faridalms/domain/school";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { meaningOf } from "~/components/years/YearPlanner";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { numberLocale } from "~/utils/digits";

export interface GridPeriod {
  id: string;
  nameEn: string | null;
  nameAr: string | null;
  startTime: string | null;
  endTime: string | null;
}

export interface GridMeeting {
  id: string;
  weekday: number;
  periodId: string;
}

/** A day of a dated week, with what the school calendar marks it as. */
export interface GridDate {
  day: number;
  date: string;
  meaning: string | null;
  closed: boolean;
  noteEn: string | null;
  noteAr: string | null;
}

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat(numberLocale(), {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));

/** Why a day differs from an ordinary school day, or nothing when it doesn't. */
function dayNote(date: GridDate | undefined): string | null {
  if (!date) return null;
  const note = inLocale(date.noteEn, date.noteAr);
  if (date.meaning === "outside_year") return m.ttOutsideYearDay();
  if (!date.meaning || date.meaning === "instructional_day")
    return date.closed ? m.ttNoSchool() : null;
  return note || meaningOf(date.meaning).label();
}

/** An ISO weekday named in the reader's language; 1 January 2024 was a Monday. */
export function dayName(day: number, width: "long" | "short" = "long") {
  return new Intl.DateTimeFormat(numberLocale(), {
    weekday: width,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2024, 0, day)));
}

export function periodName(period: GridPeriod) {
  return inLocale(period.nameEn, period.nameAr);
}

function PeriodLabel({ period }: { period: GridPeriod }) {
  return (
    <span className="grid gap-0.5">
      <span className="text-sm leading-5 font-medium">
        {periodName(period)}
      </span>
      {period.startTime && period.endTime ? (
        <span className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
          <bdi dir="ltr">
            {m.ttTimeRange({ from: period.startTime, to: period.endTime })}
          </bdi>
        </span>
      ) : null}
    </span>
  );
}

/**
 * Periods down, days across, mirrored in Arabic by the page's direction. On
 * phones one day shows at a time, picked from the days of the week. A dated
 * week names each day's date, and a day the school is shut shows why
 * instead of its lessons.
 */
export function WeekGrid<T extends GridMeeting>({
  caption,
  days,
  dates,
  periods,
  meetings,
  today,
  cell,
}: {
  caption: string;
  days: readonly number[];
  dates?: readonly GridDate[];
  periods: readonly GridPeriod[];
  meetings: readonly T[];
  today?: number;
  cell: (input: {
    meeting: T | null;
    day: number;
    period: GridPeriod;
  }) => ReactNode;
}) {
  const [picked, setPicked] = useState(
    today !== undefined && days.includes(today) ? today : (days[0] ?? 1),
  );
  const at = (day: number, period: GridPeriod) =>
    meetings.find((row) => row.weekday === day && row.periodId === period.id) ??
    null;
  const dateOf = (day: number) => dates?.find((row) => row.day === day);
  const pickedDate = dateOf(picked);
  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full min-w-max table-fixed border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-muted/40 text-[13px] text-muted-foreground">
            <tr>
              <th
                scope="col"
                className="w-36 border-b px-3 py-2 text-start font-medium"
              >
                <span className="sr-only">{m.ttPeriod()}</span>
              </th>
              {days.map((day) => {
                const date = dateOf(day);
                const note = date && !date.closed ? dayNote(date) : null;
                return (
                  <th
                    key={day}
                    scope="col"
                    className={cn(
                      "border-s border-b px-3 py-2 text-start align-top font-medium",
                      day === today && "text-foreground",
                    )}
                  >
                    <span className="block">
                      {dayName(day)}
                      {date ? (
                        <span className="font-normal tabular-nums">
                          {" "}
                          {shortDate(date.date)}
                        </span>
                      ) : null}
                      {day === today ? (
                        <span className="sr-only"> {m.ttToday()}</span>
                      ) : null}
                    </span>
                    {note ? (
                      <span
                        className={cn(
                          "mt-1 inline-block rounded px-1.5 text-xs leading-5 font-normal",
                          date?.meaning
                            ? meaningOf(date.meaning).tint
                            : "bg-muted",
                        )}
                      >
                        {note}
                      </span>
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {periods.map((period, row) => (
              <tr key={period.id} className="border-b last:border-b-0">
                <th
                  scope="row"
                  className="px-3 py-2 text-start align-top font-normal"
                >
                  <PeriodLabel period={period} />
                </th>
                {days.map((day) => {
                  const date = dateOf(day);
                  if (date?.closed)
                    return row === 0 ? (
                      <td
                        key={day}
                        rowSpan={periods.length}
                        className="border-s bg-muted/40 p-3 text-center align-middle text-[13px] text-muted-foreground"
                      >
                        {dayNote(date)}
                      </td>
                    ) : null;
                  return (
                    <td
                      key={day}
                      className={cn(
                        "h-16 border-s p-1 align-top",
                        day === today && "bg-muted/30",
                      )}
                    >
                      {cell({ meeting: at(day, period), day, period })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 md:hidden">
        <fieldset className="flex gap-1 overflow-x-auto">
          <legend className="sr-only">{m.ttDays()}</legend>
          {days.map((day) => {
            const date = dateOf(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={day === picked}
                onClick={() => setPicked(day)}
                className={cn(
                  "grid h-12 shrink-0 content-center rounded-md border px-3 text-sm leading-5 font-medium",
                  day === picked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground",
                  date?.closed && day !== picked && "border-dashed",
                )}
              >
                {dayName(day, "short")}
                {date ? (
                  <span className="text-xs font-normal tabular-nums">
                    {shortDate(date.date)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </fieldset>
        {pickedDate?.closed ? (
          <p className="rounded-lg border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
            {dayNote(pickedDate)}
          </p>
        ) : (
          <>
            {pickedDate && dayNote(pickedDate) ? (
              <p
                className={cn(
                  "w-fit rounded px-2 text-[13px] leading-6",
                  pickedDate.meaning
                    ? meaningOf(pickedDate.meaning).tint
                    : "bg-muted",
                )}
              >
                {dayNote(pickedDate)}
              </p>
            ) : null}
            <ul className="divide-y rounded-lg border bg-card">
              {periods.map((period) => (
                <li
                  key={period.id}
                  className="grid grid-cols-[7rem_1fr] gap-3 p-2"
                >
                  <div className="px-1 py-1">
                    <PeriodLabel period={period} />
                  </div>
                  <div className="min-w-0">
                    {cell({ meeting: at(picked, period), day: picked, period })}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}

/**
 * A meeting as a week reads it: what, then who and where, a line each, and
 * what is different about it that day.
 */
export function MeetingCard({
  title,
  lines,
  flagged = false,
  change = null,
  cancelled = false,
  note = null,
}: {
  title: ReactNode;
  lines: (string | null)[];
  flagged?: boolean;
  change?: string | null;
  cancelled?: boolean;
  /** Left for whoever teaches it that day. */
  note?: string | null;
}) {
  return (
    <div
      className={cn(
        "grid h-full min-w-0 content-start gap-0.5 rounded-md px-2 py-1.5",
        flagged
          ? "bg-warning/15"
          : change && !cancelled
            ? "bg-primary/10 ring-1 ring-primary/30 ring-inset"
            : "bg-muted/60",
        cancelled && "opacity-70",
      )}
    >
      <span
        className={cn(
          "truncate text-sm leading-5 font-medium",
          cancelled && "line-through decoration-muted-foreground",
        )}
      >
        {title}
      </span>
      {change ? (
        <span
          className={cn(
            "line-clamp-2 text-[13px] leading-[18px] font-medium",
            cancelled ? "text-muted-foreground" : "text-primary",
          )}
        >
          {change}
        </span>
      ) : null}
      {note ? (
        <span
          dir="auto"
          title={note}
          className="line-clamp-2 text-[13px] leading-[18px] text-muted-foreground italic"
        >
          {note}
        </span>
      ) : null}
      {lines.filter(Boolean).map((line) => (
        <span
          key={line}
          className="truncate text-[13px] leading-[18px] text-muted-foreground"
        >
          {line}
        </span>
      ))}
      {flagged ? (
        <span className="text-[13px] leading-[18px] text-warning-foreground dark:text-warning">
          {m.ttClash()}
        </span>
      ) : null}
    </div>
  );
}

export function FreeCell() {
  return (
    <span className="flex h-full items-center px-2 text-[13px] text-muted-foreground">
      {m.ttFree()}
    </span>
  );
}

const weekRange = (from: string, to: string) =>
  new Intl.DateTimeFormat(numberLocale(), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).formatRange(new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`));

/**
 * Steps a dated week back and forth inside the school year, and back to the
 * week holding today. Arrows follow the reading direction.
 */
export function WeekStep({
  dates,
  today,
  year,
  pending = false,
  onWeek,
}: {
  dates: readonly GridDate[];
  today: string;
  year: { startsOn: string; lastDay: string };
  pending?: boolean;
  onWeek: (on: string) => void;
}) {
  const first = dates[0]?.date;
  const last = dates.at(-1)?.date;
  if (!first || !last) return null;
  const previous = addDays(first, -7);
  const next = addDays(first, 7);
  const holdsToday = first <= today && today < next;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 transition-opacity",
        pending && "opacity-60",
      )}
    >
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="max-md:size-10"
          aria-label={m.commonPreviousWeek()}
          disabled={addDays(last, -7) < year.startsOn}
          onClick={() => onWeek(previous)}
        >
          <ChevronLeft className="rtl:rotate-180" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="max-md:size-10"
          aria-label={m.commonNextWeek()}
          disabled={next > year.lastDay}
          onClick={() => onWeek(next)}
        >
          <ChevronRight className="rtl:rotate-180" aria-hidden />
        </Button>
      </div>
      <p aria-live="polite" className="text-sm leading-5 font-medium">
        {weekRange(first, last)}
      </p>
      {holdsToday || today < year.startsOn || today > year.lastDay ? null : (
        <Button
          type="button"
          variant="ghost"
          className="max-md:h-10"
          onClick={() => onWeek(today)}
        >
          {m.ttThisWeek()}
        </Button>
      )}
    </div>
  );
}
