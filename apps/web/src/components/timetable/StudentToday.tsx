import {
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { useSuspenseQuery } from "@tanstack/react-query";

import * as m from "~/i18n/messages";
import { studentWeekQuery } from "~/queries/timetable";

import { periodName } from "./WeekGrid";
import { meetingTitle, roomLabel, teacherLabel } from "./Weeks";

export interface StudentTodayProps {
  studentId: string;
  today: string;
}

/**
 * A student's lessons today, in the order of the day, as the timetable has
 * them with the day's changes: who covers, where it moved, what is off.
 */
export function StudentToday({ studentId, today }: StudentTodayProps) {
  const { week } = useSuspenseQuery(studentWeekQuery(studentId)).data;
  const held = week.dates.find((row) => row.date === today)?.periods ?? [];
  const lessons = held.flatMap((times) => {
    const period = week.periods.find((row) => row.code === times.code);
    const meeting = week.meetings.find(
      (row) => row.on === today && row.periodId === times.id,
    );
    return period && meeting
      ? [{ period: { ...period, ...times }, meeting }]
      : [];
  });
  return (
    <RecordSection
      title={m.studentTodayTitle()}
      description={m.studentTodayHint()}
    >
      {lessons.length === 0 ? (
        <RecordEmpty>{m.studentTodayNone()}</RecordEmpty>
      ) : (
        <RecordList>
          {lessons.map(({ period, meeting }) => {
            const off = meeting.change?.cancelled ?? false;
            const lines = [teacherLabel(meeting), roomLabel(meeting)].filter(
              (line) => line !== null,
            );
            return (
              <li
                key={meeting.id}
                className="flex items-baseline gap-x-4 gap-y-0.5 py-3 max-sm:flex-col"
              >
                <span className="grid w-28 shrink-0 gap-0.5 text-[13px] leading-[18px] text-muted-foreground">
                  {periodName(period)}
                  {period.startTime && period.endTime ? (
                    <bdi dir="ltr" className="justify-self-start tabular-nums">
                      {m.ttTimeRange({
                        from: period.startTime,
                        to: period.endTime,
                      })}
                    </bdi>
                  ) : null}
                </span>
                <span className="grid min-w-0 gap-0.5">
                  <span
                    className={
                      off
                        ? "text-sm leading-5 font-medium text-muted-foreground line-through"
                        : "text-sm leading-5 font-medium"
                    }
                  >
                    {meetingTitle(meeting)}
                  </span>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {off ? m.ttCancelled() : lines.join(" · ")}
                  </span>
                </span>
              </li>
            );
          })}
        </RecordList>
      )}
    </RecordSection>
  );
}
