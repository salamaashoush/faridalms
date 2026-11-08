import type { ReactNode } from "react";

import { addDays } from "@faridalms/domain/school";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { meaningOf } from "~/components/years/YearPlanner";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { formatDate, formatDayRange, formatWeekday } from "~/utils/datetime";

import type { CycleShape } from "./cycle";

import { cycleDayLabel } from "./cycle";

export interface GridPeriod {
  id: string;
  /** Names one period across its versions, so a dated week finds it each day. */
  code?: string;
  nameEn: string | null;
  nameAr: string | null;
  startTime: string | null;
  endTime: string | null;
  /** The days of the grid it runs on; every day when not given. */
  weekdays?: readonly number[];
}

export interface GridMeeting {
  id: string;
  weekday: number;
  periodId: string;
  /** The date a dated week holds it on. */
  on?: string;
}

/** A period as one date holds it, at that date's times. */
export interface DatePeriod {
  id: string;
  code: string;
  startTime: string;
  endTime: string;
}

/** A day of a dated week, with what the school calendar marks it as. */
export interface GridDate {
  day: number;
  date: string;
  meaning: string | null;
  closed: boolean;
  noteEn: string | null;
  noteAr: string | null;
  /** The day of its timetable's cycle, and the cycle, when lessons are held. */
  cycleDay?: number | null;
  cycle?: CycleShape | null;
  /** The bell schedule it runs on instead of its periods' own times. */
  schedule?: { nameEn: string | null; nameAr: string | null } | null;
  /** The lesson periods it holds; without them every period runs as planned. */
  periods?: readonly DatePeriod[];
}

/** Why a day differs from an ordinary school day, or nothing when it doesn't. */
function dayNote(date: GridDate | undefined): string | null {
  if (!date) return null;
  const note = inLocale(date.noteEn, date.noteAr);
  if (date.meaning === "outside_year") return m.ttOutsideYearDay();
  if (!date.meaning || date.meaning === "instructional_day")
    return date.closed ? m.ttNoSchool() : null;
  return note || meaningOf(date.meaning).label();
}

export function periodName(period: GridPeriod) {
  return inLocale(period.nameEn, period.nameAr);
}

/**
 * The period a cell holds: on a dated day, the version and times that day
 * keeps for the row's period, or null when the day does not hold it.
 */
function heldPeriod(
  period: GridPeriod,
  day: number,
  date: GridDate | undefined,
): GridPeriod | null {
  if (date?.periods) {
    const held = date.periods.find((row) => row.code === period.code);
    return held
      ? {
          ...period,
          id: held.id,
          startTime: held.startTime,
          endTime: held.endTime,
        }
      : null;
  }
  return !period.weekdays || period.weekdays.includes(day) ? period : null;
}

/** What a dated day shows under its name: its day of the cycle and its bell schedule. */
function dayDetail(date: GridDate | undefined): string | null {
  if (!date || date.closed) return null;
  const parts = [
    date.cycle?.kind === "days" && date.cycleDay
      ? cycleDayLabel(date.cycle, date.cycleDay)
      : null,
    date.schedule ? inLocale(date.schedule.nameEn, date.schedule.nameAr) : null,
  ].filter((part) => part !== null);
  return parts.length ? parts.join(" · ") : null;
}

function NoPeriod() {
  return (
    <span className="grid h-full min-h-10 place-items-center text-muted-foreground">
      <span aria-hidden>—</span>
      <span className="sr-only">{m.periodsNotOnDay()}</span>
    </span>
  );
}

interface OtherTimesProps {
  row: GridPeriod;
  held: GridPeriod;
}

/** A cell's own times, shown only when the day keeps the period at other times. */
function OtherTimes({ row, held }: OtherTimesProps) {
  if (
    !held.startTime ||
    !held.endTime ||
    (held.startTime === row.startTime && held.endTime === row.endTime)
  )
    return null;
  return (
    <span className="block px-2 pb-0.5 text-xs leading-4 font-medium text-primary tabular-nums">
      <bdi dir="ltr">
        {m.ttTimeRange({ from: held.startTime, to: held.endTime })}
      </bdi>
    </span>
  );
}

interface PeriodLabelProps {
  period: GridPeriod;
}

function PeriodLabel({ period }: PeriodLabelProps) {
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

export interface WeekGridProps<T extends GridMeeting> {
  caption: string;
  days: readonly number[];
  /** How a column is named; an undated grid of a cycle names its days. */
  dayLabel?: (day: number, width?: "long" | "short") => string;
  dates?: readonly GridDate[];
  periods: readonly GridPeriod[];
  meetings: readonly T[];
  today?: number;
  cell: (input: {
    meeting: T | null;
    day: number;
    period: GridPeriod;
  }) => ReactNode;
}

/**
 * Periods down, days across, mirrored in Arabic by the page's direction. On
 * phones one day shows at a time, picked from the days of the week. A dated
 * week names each day's date, its day of the cycle and bell schedule, gives
 * a lesson its own times on a day that keeps other ones, and shows why a
 * day the school is shut has none.
 */
export function WeekGrid<T extends GridMeeting>({
  caption,
  days,
  dayLabel = formatWeekday,
  dates,
  periods,
  meetings,
  today,
  cell,
}: WeekGridProps<T>) {
  const [picked, setPicked] = useState(
    today !== undefined && days.includes(today) ? today : (days[0] ?? 1),
  );
  const dateOf = (day: number) => dates?.find((row) => row.day === day);
  const at = (day: number, held: GridPeriod) => {
    const date = dateOf(day);
    return (
      meetings.find((row) =>
        date && row.on !== undefined
          ? row.on === date.date && row.periodId === held.id
          : row.weekday === day && row.periodId === held.id,
      ) ?? null
    );
  };
  const slot = (day: number, period: GridPeriod) => {
    const held = heldPeriod(period, day, dateOf(day));
    if (!held) return <NoPeriod />;
    return (
      <>
        <OtherTimes row={period} held={held} />
        {cell({ meeting: at(day, held), day, period: held })}
      </>
    );
  };
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
                const detail = dayDetail(date);
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
                      {date ? formatWeekday(day) : dayLabel(day)}
                      {date ? (
                        <span className="font-normal tabular-nums">
                          {" "}
                          {formatDate(date.date, "short")}
                        </span>
                      ) : null}
                      {day === today ? (
                        <span className="sr-only"> {m.ttToday()}</span>
                      ) : null}
                    </span>
                    {detail ? (
                      <span className="block text-xs leading-5 font-normal">
                        {detail}
                      </span>
                    ) : null}
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
                      {slot(day, period)}
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
                {date ? formatWeekday(day, "short") : dayLabel(day, "short")}
                {date ? (
                  <span className="text-xs font-normal tabular-nums">
                    {formatDate(date.date, "short")}
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
            {dayDetail(pickedDate) ? (
              <p className="text-[13px] leading-6 text-muted-foreground">
                {dayDetail(pickedDate)}
              </p>
            ) : null}
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
                  <div className="min-w-0">{slot(picked, period)}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </>
  );
}

export interface MeetingCardProps {
  title: ReactNode;
  teacher?: ReactNode;
  room?: ReactNode;
  flagged?: boolean;
  change?: string | null;
  cancelled?: boolean;
  /** Left for whoever teaches it that day. */
  note?: string | null;
}

/**
 * A meeting as a week reads it: what, then who and where, a line each, and
 * what is different about it that day.
 */
export function MeetingCard({
  title,
  teacher = null,
  room = null,
  flagged = false,
  change = null,
  cancelled = false,
  note = null,
}: MeetingCardProps) {
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
      {teacher ? (
        <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
          {teacher}
        </span>
      ) : null}
      {room ? (
        <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
          {room}
        </span>
      ) : null}
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

export interface WeekStepProps {
  dates: readonly GridDate[];
  today: string;
  year: { startsOn: string; lastDay: string };
  pending?: boolean;
  onWeek: (on: string) => void;
}

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
}: WeekStepProps) {
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
        {formatDayRange(first, last)}
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
