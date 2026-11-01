import { Button } from "@faridalms/ui/button";
import { useSuspenseQuery } from "@tanstack/react-query";

import { formatRate } from "~/components/attendance/format";
import { KIND_ICON, noticeText } from "~/components/notifications/format";
import {
  Fact,
  Facts,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "~/components/system/RecordPage";
import { periodName } from "~/components/timetable/WeekGrid";
import {
  meetingTitle,
  roomLabel,
  teacherLabel,
  todayOf,
} from "~/components/timetable/Weeks";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { studentAttendanceQuery } from "~/queries/attendance";
import { studentNoticesQuery } from "~/queries/students";
import { studentWeekQuery } from "~/queries/timetable";
import { formatInstant, formatList, formatNumber } from "~/utils/datetime";

/**
 * A student's lessons today, in the order of the day, as the timetable has
 * them with the day's changes: who covers, where it moved, what is off.
 */
export function StudentToday({
  studentId,
  today,
}: {
  studentId: string;
  today: string;
}) {
  const { week } = useSuspenseQuery(studentWeekQuery(studentId)).data;
  if (!week) return null;
  const day = todayOf(today);
  const lessons = week.periods.flatMap((period) => {
    const meeting = week.meetings.find(
      (row) => row.weekday === day && row.periodId === period.id,
    );
    return meeting ? [{ period, meeting }] : [];
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

/** How a student's year of registers stands so far, with the way to every mark. */
export function StudentAttendanceSummary({
  studentId,
  onOpen,
}: {
  studentId: string;
  onOpen: () => void;
}) {
  const { summary } = useSuspenseQuery(studentAttendanceQuery(studentId)).data;
  return (
    <RecordSection
      title={m.attendanceTitle()}
      description={m.attThisYear()}
      action={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="max-md:h-10"
          onClick={onOpen}
        >
          {m.studentAttendanceOpen()}
        </Button>
      }
    >
      {summary.sessions === 0 ? (
        <RecordEmpty>{m.attNothingYet()}</RecordEmpty>
      ) : (
        <Facts short>
          <Fact label={m.attendanceRate()}>
            {summary.rate === null ? null : formatRate(summary.rate)}
          </Fact>
          <Fact label={m.attAbsent()}>{formatNumber(summary.absent)}</Fact>
          <Fact label={m.attExcused()}>{formatNumber(summary.excused)}</Fact>
          <Fact label={m.attLate()}>{formatNumber(summary.late)}</Fact>
        </Facts>
      )}
    </RecordSection>
  );
}

/**
 * What the school last told the student's guardians, and which of them has
 * read each notice, so the office knows what a family already knows before
 * it rings them.
 */
export function StudentNotices({ studentId }: { studentId: string }) {
  const notices = useSuspenseQuery(studentNoticesQuery(studentId)).data;
  return (
    <RecordSection
      title={m.studentNoticesTitle()}
      description={m.studentNoticesHint()}
    >
      {notices.length === 0 ? (
        <RecordEmpty>{m.studentNoticesNone()}</RecordEmpty>
      ) : (
        <RecordList>
          {notices.map((notice) => {
            const Icon = KIND_ICON[notice.kind];
            const text = noticeText({
              id: `${notice.kind}:${notice.subjectId}`,
              kind: notice.kind,
              subjectId: notice.subjectId,
              params: notice.params,
              actorNameEn: null,
              actorNameAr: null,
            });
            const named = (read: boolean) =>
              notice.recipients
                .filter((recipient) => recipient.read === read)
                .map((recipient) =>
                  inLocale(recipient.nameEn, recipient.nameAr),
                );
            const read = named(true);
            const unread = named(false);
            return (
              <li
                key={`${notice.kind}:${notice.subjectId}`}
                className="flex items-start gap-3 py-3"
              >
                <Icon
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
                <span className="grid min-w-0 gap-0.5">
                  <span className="text-sm leading-5 font-medium">
                    {text.title}
                  </span>
                  {text.body ? (
                    <span
                      dir="auto"
                      className="truncate text-sm leading-5 text-muted-foreground"
                    >
                      {text.body}
                    </span>
                  ) : null}
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {[
                      formatInstant(notice.createdAt, "medium"),
                      read.length > 0
                        ? m.studentNoticeReadBy({ names: formatList(read) })
                        : null,
                      unread.length > 0
                        ? m.studentNoticeUnreadBy({
                            names: formatList(unread),
                          })
                        : null,
                    ]
                      .filter((part) => part !== null)
                      .join(" · ")}
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
