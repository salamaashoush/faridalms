import { CalendarOff } from "lucide-react";

import { SubjectIcon } from "~/components/app/labels";
import { EmptyState } from "~/components/app/primitives";
import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";

import { formatTime, subjectLabel } from "./format";

export interface TimetableSlot {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  room: string | null;
  subject: { name: string; nameAr?: string; icon: string } | null;
  // Absent on the teacher's own timetable, where the teacher is the viewer.
  teacher?: { name: string } | null;
}

// 0 = Sunday. The Egyptian school week runs Sunday to Thursday.
const SCHOOL_WEEKDAYS = [0, 1, 2, 3, 4] as const;
type SchoolWeekday = (typeof SCHOOL_WEEKDAYS)[number];

const WEEKDAY_LABEL: Record<SchoolWeekday, () => string> = {
  0: m.daySunday,
  1: m.dayMonday,
  2: m.dayTuesday,
  3: m.dayWednesday,
  4: m.dayThursday,
};

function periodKey(startTime: string, endTime: string): string {
  return `${startTime}|${endTime}`;
}

function SlotBody({ slot }: { slot: TimetableSlot }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <SubjectIcon
          icon={slot.subject?.icon ?? ""}
          className="shrink-0 text-primary"
        />
        <span className="min-w-0 truncate">
          {subjectLabel(slot.subject) ?? m.commonNotRecorded()}
        </span>
      </span>
      {slot.teacher ? (
        <span className="text-xs text-muted-foreground">
          {slot.teacher.name}
        </span>
      ) : null}
      {slot.room ? (
        <span className="text-xs text-muted-foreground">
          {m.timetableRoom()} {slot.room}
        </span>
      ) : null}
    </div>
  );
}

function TimeRange({
  startTime,
  endTime,
}: {
  startTime: string;
  endTime: string;
}) {
  return (
    <span className="flex flex-col leading-tight">
      <span className="text-sm tabular-nums">{formatTime(startTime)}</span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatTime(endTime)}
      </span>
    </span>
  );
}

export function TimetableGrid({
  slots,
  className,
}: {
  slots: TimetableSlot[];
  className: string | null;
}) {
  const weekSlots = slots.filter((slot) =>
    SCHOOL_WEEKDAYS.some((day) => day === slot.weekday),
  );

  if (weekSlots.length === 0) {
    return <EmptyState title={m.timetableNoLessons()} icon={CalendarOff} />;
  }

  const periods = [
    ...new Map(
      weekSlots.map((slot) => [
        periodKey(slot.startTime, slot.endTime),
        { startTime: slot.startTime, endTime: slot.endTime },
      ]),
    ).values(),
  ].toSorted((a, b) => a.startTime.localeCompare(b.startTime));

  const byCell = new Map<string, TimetableSlot>();
  for (const slot of weekSlots) {
    byCell.set(
      `${String(slot.weekday)}|${periodKey(slot.startTime, slot.endTime)}`,
      slot,
    );
  }

  const caption = className
    ? m.familyTimetableCaption({ className })
    : m.timetableTitle();

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-separate border-spacing-1 text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="w-24 px-2 py-2 text-start text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                {m.familyTime()}
              </th>
              {SCHOOL_WEEKDAYS.map((day) => (
                <th
                  key={day}
                  scope="col"
                  className="px-2 py-2 text-start text-xs font-medium tracking-wide text-muted-foreground uppercase"
                >
                  {WEEKDAY_LABEL[day]()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={periodKey(period.startTime, period.endTime)}>
                <th
                  scope="row"
                  className="rounded-lg bg-muted/40 px-3 py-2 text-start align-top font-normal"
                >
                  <TimeRange
                    startTime={period.startTime}
                    endTime={period.endTime}
                  />
                </th>
                {SCHOOL_WEEKDAYS.map((day) => {
                  const slot = byCell.get(
                    `${String(day)}|${periodKey(period.startTime, period.endTime)}`,
                  );
                  return (
                    <td
                      key={day}
                      className={cn(
                        "rounded-lg border border-border px-3 py-2 align-top",
                        slot ? "bg-card" : "border-dashed",
                      )}
                    >
                      {slot ? (
                        <SlotBody slot={slot} />
                      ) : (
                        <span className="sr-only">{m.familyNoLesson()}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-5 md:hidden">
        {SCHOOL_WEEKDAYS.map((day) => {
          const daySlots = weekSlots
            .filter((slot) => slot.weekday === day)
            .toSorted((a, b) => a.startTime.localeCompare(b.startTime));

          return (
            <section key={day} aria-label={WEEKDAY_LABEL[day]()}>
              <h3 className="mb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {WEEKDAY_LABEL[day]()}
              </h3>
              {daySlots.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
                  {m.familyNoLesson()}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {daySlots.map((slot) => (
                    <li
                      key={slot.id}
                      className="flex items-start gap-4 rounded-lg border border-border px-3 py-2.5"
                    >
                      <TimeRange
                        startTime={slot.startTime}
                        endTime={slot.endTime}
                      />
                      <div className="min-w-0 flex-1">
                        <SlotBody slot={slot} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
