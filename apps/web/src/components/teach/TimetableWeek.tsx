import { SubjectIcon } from "~/components/app/labels";
import { Value } from "~/components/app/primitives";
import * as m from "~/i18n/messages";

import {
  formatTime,
  SCHOOL_WEEKDAYS,
  subjectName,
  weekdayLabel,
} from "./format";

export interface TeachingSlot {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  room: string | null;
  subject: { name: string; nameAr?: string; icon: string } | null;
  class?: { name: string } | null;
}

export function TimetableWeek({ slots }: { slots: TeachingSlot[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {SCHOOL_WEEKDAYS.map((weekday) => {
        const lessons = slots.filter((slot) => slot.weekday === weekday);
        const headingId = `weekday-${String(weekday)}`;

        return (
          <section
            key={weekday}
            aria-labelledby={headingId}
            className="rounded-xl border border-border bg-card p-3"
          >
            <h2
              id={headingId}
              className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
            >
              {weekdayLabel(weekday)}
            </h2>

            {lessons.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {m.timetableNoLessons()}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {lessons.map((slot) => (
                  <li
                    key={slot.id}
                    className="rounded-lg bg-muted/60 px-3 py-2.5"
                  >
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      <SubjectIcon icon={slot.subject?.icon ?? ""} />
                      <Value>{subjectName(slot.subject)}</Value>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {m.teachTimeRange({
                        from: formatTime(slot.startTime),
                        to: formatTime(slot.endTime),
                      })}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {m.studentClass()}
                      {": "}
                      <Value>{slot.class?.name}</Value>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.timetableRoom()}
                      {": "}
                      <Value>{slot.room}</Value>
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
