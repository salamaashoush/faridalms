import type { ReactNode } from "react";

import { cn } from "@faridalms/ui/cn";
import { useState } from "react";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";

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

/** An ISO weekday named in the reader's language; 1 January 2024 was a Monday. */
export function dayName(day: number, width: "long" | "short" = "long") {
  return new Intl.DateTimeFormat(getLocale(), {
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
 * phones one day shows at a time, picked from the days of the week.
 */
export function WeekGrid<T extends GridMeeting>({
  caption,
  days,
  periods,
  meetings,
  today,
  cell,
}: {
  caption: string;
  days: readonly number[];
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
              {days.map((day) => (
                <th
                  key={day}
                  scope="col"
                  className={cn(
                    "border-s border-b px-3 py-2 text-start font-medium",
                    day === today && "text-foreground",
                  )}
                >
                  {dayName(day)}
                  {day === today ? (
                    <span className="sr-only"> {m.ttToday()}</span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period.id} className="border-b last:border-b-0">
                <th
                  scope="row"
                  className="px-3 py-2 text-start align-top font-normal"
                >
                  <PeriodLabel period={period} />
                </th>
                {days.map((day) => (
                  <td
                    key={day}
                    className={cn(
                      "h-16 border-s p-1 align-top",
                      day === today && "bg-muted/30",
                    )}
                  >
                    {cell({ meeting: at(day, period), day, period })}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 md:hidden">
        <fieldset className="flex gap-1 overflow-x-auto">
          <legend className="sr-only">{m.ttDays()}</legend>
          {days.map((day) => (
            <button
              key={day}
              type="button"
              aria-pressed={day === picked}
              onClick={() => setPicked(day)}
              className={cn(
                "h-10 shrink-0 rounded-md border px-3 text-sm font-medium",
                day === picked
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground",
              )}
            >
              {dayName(day, "short")}
            </button>
          ))}
        </fieldset>
        <ul className="divide-y rounded-lg border bg-card">
          {periods.map((period) => (
            <li key={period.id} className="grid grid-cols-[7rem_1fr] gap-3 p-2">
              <div className="px-1 py-1">
                <PeriodLabel period={period} />
              </div>
              <div className="min-w-0">
                {cell({ meeting: at(picked, period), day: picked, period })}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

/** A meeting as a week reads it: what, then who and where, a line each. */
export function MeetingCard({
  title,
  lines,
  flagged = false,
}: {
  title: ReactNode;
  lines: (string | null)[];
  flagged?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid h-full min-w-0 content-start gap-0.5 rounded-md px-2 py-1.5",
        flagged ? "bg-warning/15" : "bg-muted/60",
      )}
    >
      <span className="truncate text-sm leading-5 font-medium">{title}</span>
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
