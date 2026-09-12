import { SubjectIcon } from "~/components/app/labels";
import { Value } from "~/components/app/primitives";
import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";

import {
  formatTime,
  SCHOOL_WEEKDAYS,
  subjectIcon,
  subjectName,
  weekdayLabel,
  weekdayOf,
} from "./format";

export interface TimetableSlot {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  room: string | null;
  subject: { name: string; nameAr: string; icon: string } | null;
  teacherName: string | null;
}

/**
 * One grid that is a stacked list of days below `md` and five columns above it,
 * so the same markup serves both without duplicating every slot into the DOM.
 */
export function TimetableWeek({
  slots,
  today,
}: {
  slots: TimetableSlot[];
  today: string;
}) {
  const todayWeekday = weekdayOf(today);

  return (
    <div className="grid gap-4 md:grid-cols-5">
      {SCHOOL_WEEKDAYS.map((weekday) => {
        const daySlots = slots
          .filter((slot) => slot.weekday === weekday)
          .toSorted((a, b) => a.startTime.localeCompare(b.startTime));
        const isToday = weekday === todayWeekday;

        return (
          <section
            key={weekday}
            aria-label={weekdayLabel(weekday)}
            className={cn(
              "flex flex-col gap-2 rounded-xl border p-3",
              isToday
                ? "border-primary/40 bg-primary/5"
                : "border-border bg-background",
            )}
          >
            <h3 className="flex items-center justify-between gap-2 text-sm font-semibold">
              {weekdayLabel(weekday)}
              {isToday ? (
                <span className="rounded-full bg-primary px-2 py-0.5 text-[0.65rem] font-medium text-primary-foreground">
                  {m.commonToday()}
                </span>
              ) : null}
            </h3>

            {daySlots.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                {m.meNoLessons()}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {daySlots.map((slot) => (
                  <li
                    key={slot.id}
                    className="rounded-lg border border-border bg-background p-3 text-sm"
                  >
                    <p className="flex items-center gap-2 font-medium">
                      <SubjectIcon
                        icon={subjectIcon(slot.subject)}
                        className="shrink-0 text-primary"
                      />
                      <span className="min-w-0 truncate">
                        <Value>{subjectName(slot.subject)}</Value>
                      </span>
                    </p>
                    <p className="mt-1.5 text-xs text-muted-foreground tabular-nums">
                      {m.meTimeRange({
                        from: formatTime(slot.startTime),
                        to: formatTime(slot.endTime),
                      })}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium">{m.timetableRoom()}: </span>
                      <Value>{slot.room}</Value>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium">
                        {m.assignmentsTeacher()}:{" "}
                      </span>
                      <Value>{slot.teacherName}</Value>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
