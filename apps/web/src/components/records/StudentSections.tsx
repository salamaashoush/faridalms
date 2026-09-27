import type { AttendanceSummary } from "@faridalms/database/repositories/academics";
import type { ReactNode } from "react";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { TimetableSlot } from "~/components/family/TimetableGrid";
import type { Tone } from "~/components/system/status";

import { ATTENDANCE_LABEL, SubjectIcon } from "~/components/app/labels";
import { Value } from "~/components/app/primitives";
import { LEARNER_STATE_LABEL } from "~/components/assignments/labels";
import {
  formatDate,
  formatTime,
  subjectLabel,
} from "~/components/family/format";
import { weekBounds } from "~/components/family/WeekNav";
import { weekdayOf } from "~/components/me/format";
import {
  Fact,
  Facts,
  phoneLink,
  RecordColumns,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "~/components/system/RecordPage";
import { StatusText } from "~/components/system/status";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import {
  assignmentsQuery,
  attendanceQuery,
  gradesQuery,
  timetableQuery,
} from "~/queries/school";
import { formatNumber } from "~/utils/datetime";

const ATTENDANCE_TONE: Record<keyof typeof ATTENDANCE_LABEL, Tone> = {
  present: "success",
  late: "warning",
  absent: "danger",
  excused: "neutral",
};

function AttendanceFacts({ summary }: { summary: AttendanceSummary }) {
  return (
    <Facts short>
      <Fact label={m.attendanceRate()}>
        {summary.rate === null
          ? null
          : m.familyPercentValue({ value: formatNumber(summary.rate) })}
      </Fact>
      <Fact label={m.familyDaysRecorded()}>{formatNumber(summary.total)}</Fact>
      <Fact label={m.attendancePresent()}>{formatNumber(summary.present)}</Fact>
      <Fact label={m.attendanceAbsent()}>{formatNumber(summary.absent)}</Fact>
      <Fact label={m.attendanceLate()}>{formatNumber(summary.late)}</Fact>
      <Fact label={m.attendanceExcused()}>{formatNumber(summary.excused)}</Fact>
    </Facts>
  );
}

export function AttendanceOverview({
  studentId,
  action,
}: {
  studentId: string;
  action: ReactNode;
}) {
  const { summary } = useSuspenseQuery(attendanceQuery({ studentId })).data;
  return (
    <RecordSection title={m.attendanceTitle()} action={action}>
      <AttendanceFacts summary={summary} />
    </RecordSection>
  );
}

export function StudentAttendance({ studentId }: { studentId: string }) {
  const { summary, rows } = useSuspenseQuery(
    attendanceQuery({ studentId }),
  ).data;
  return (
    <RecordColumns
      main={
        <RecordSection title={m.familyDailyRecord()}>
          {rows.length === 0 ? (
            <RecordEmpty>{m.familyAttendanceEmpty()}</RecordEmpty>
          ) : (
            <RecordList>
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3"
                >
                  <span className="w-32 shrink-0 text-sm leading-5 tabular-nums">
                    {formatDate(row.date)}
                  </span>
                  <StatusText tone={ATTENDANCE_TONE[row.status]}>
                    {ATTENDANCE_LABEL[row.status]()}
                  </StatusText>
                  {row.note ? (
                    <span className="min-w-0 basis-full text-[13px] leading-[18px] text-muted-foreground sm:flex-1 sm:basis-auto">
                      <span className="sr-only">{m.attendanceNote()}: </span>
                      <span dir="auto">{row.note}</span>
                    </span>
                  ) : null}
                </li>
              ))}
            </RecordList>
          )}
        </RecordSection>
      }
      aside={
        <RecordSection title={m.studentAttendanceSummary()}>
          <AttendanceFacts summary={summary} />
        </RecordSection>
      }
    />
  );
}

function WeekSwitch({
  week,
  weeks,
  onSelect,
}: {
  week: { number: number };
  weeks: { number: number }[];
  onSelect: (week: number) => void;
}) {
  const { first, last } = weekBounds(week, weeks);
  return (
    <nav aria-label={m.familyWeekNav()} className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="max-md:size-10"
        aria-label={m.commonPreviousWeek()}
        disabled={week.number <= first}
        onClick={() => onSelect(week.number - 1)}
      >
        <ChevronLeft className="rtl:rotate-180" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="max-md:size-10"
        aria-label={m.commonNextWeek()}
        disabled={week.number >= last}
        onClick={() => onSelect(week.number + 1)}
      >
        <ChevronRight className="rtl:rotate-180" aria-hidden />
      </Button>
    </nav>
  );
}

export function AssignmentsSection({
  studentId,
  week,
  onWeek,
}: {
  studentId: string;
  week: number | undefined;
  onWeek: (week: number) => void;
}) {
  const { data } = useSuspenseQuery(assignmentsQuery({ studentId, week }));
  return (
    <RecordSection
      title={m.navAssignments()}
      description={`${m.assignmentsWeek({ number: formatNumber(data.week.number) })} · ${m.assignmentsWeekRange(
        {
          from: formatDate(data.week.startsOn),
          to: formatDate(data.week.endsOn),
        },
      )}`}
      action={
        <WeekSwitch week={data.week} weeks={data.weeks} onSelect={onWeek} />
      }
    >
      {data.rows.length === 0 ? (
        <RecordEmpty>{m.assignmentsEmpty()}</RecordEmpty>
      ) : (
        <RecordList>
          {data.rows.map((row) => {
            const overdue =
              row.window === "late" && row.learnerState === "not_started";
            const tone: Tone =
              row.learnerState === "missing"
                ? "danger"
                : overdue
                  ? "warning"
                  : row.learnerState === "returned" ||
                      row.learnerState === "submitted"
                    ? "success"
                    : row.learnerState === "draft"
                      ? "info"
                      : "neutral";
            const score = row.submission?.score;
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3"
              >
                <div className="min-w-0 flex-1 basis-full sm:basis-56">
                  <Link
                    to="/assignments/$assignmentId"
                    params={{ assignmentId: row.id }}
                    search={{ studentId }}
                    dir="auto"
                    className={`text-sm leading-5 font-medium hover:text-primary hover:underline ${phoneLink}`}
                  >
                    {row.title}
                  </Link>
                  <p className="mt-0.5 text-[13px] leading-[18px] text-muted-foreground">
                    <Value>{subjectLabel(row.subject)}</Value>
                    <span aria-hidden> · </span>
                    {m.assignmentsDue({ date: formatDate(row.dueDate) })}
                  </p>
                </div>
                <StatusText tone={tone}>
                  {overdue
                    ? m.assignmentWindowLate()
                    : LEARNER_STATE_LABEL[row.learnerState]()}
                </StatusText>
                <span className="ms-auto text-end text-sm leading-5 tabular-nums sm:ms-0 sm:w-20">
                  <span className="sr-only">{m.assignmentsScore()}: </span>
                  <Value notApplicable={row.learnerState !== "returned"}>
                    {score === null || score === undefined
                      ? null
                      : m.courseworkScoreValue({
                          score: formatNumber(score),
                          max: formatNumber(row.maxScore),
                        })}
                  </Value>
                </span>
              </li>
            );
          })}
        </RecordList>
      )}
    </RecordSection>
  );
}

export function ResultsSection({
  studentId,
  limit,
  action,
}: {
  studentId: string;
  limit?: number;
  action?: ReactNode;
}) {
  const { rows, average } = useSuspenseQuery(gradesQuery({ studentId })).data;
  const shown = limit === undefined ? rows : rows.slice(0, limit);
  return (
    <RecordSection
      title={m.studentResults()}
      description={
        average === null
          ? undefined
          : m.studentResultsAverage({
              value: m.familyPercentValue({ value: formatNumber(average) }),
            })
      }
      action={action}
    >
      {rows.length === 0 ? (
        <RecordEmpty>{m.familyGradesEmpty()}</RecordEmpty>
      ) : (
        <RecordList>
          {shown.map((row) => {
            const context = [row.term?.name, row.teacher?.name].filter(
              (part): part is string => Boolean(part),
            );
            return (
              <li key={row.id} className="grid grid-cols-1 gap-0.5 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span
                    title={subjectLabel(row.subject) ?? undefined}
                    className="min-w-0 truncate text-sm leading-5 font-medium"
                  >
                    <Value>{subjectLabel(row.subject)}</Value>
                  </span>
                  <span className="shrink-0 text-sm leading-5 tabular-nums">
                    <span className="sr-only">{m.assignmentsScore()}: </span>
                    {m.courseworkScoreValue({
                      score: formatNumber(row.score),
                      max: formatNumber(row.maxScore),
                    })}
                  </span>
                </div>
                {context.length ? (
                  <p className="text-[13px] leading-[18px] text-muted-foreground">
                    <span dir="auto">{context.join(" · ")}</span>
                  </p>
                ) : null}
                {row.comment ? (
                  <p className="text-[13px] leading-[18px] text-muted-foreground">
                    <span className="sr-only">{m.gradesComment()}: </span>
                    <span dir="auto">{row.comment}</span>
                  </p>
                ) : null}
              </li>
            );
          })}
        </RecordList>
      )}
    </RecordSection>
  );
}

function TodayLessons({
  slots,
  today,
}: {
  slots: TimetableSlot[];
  today: string;
}) {
  const lessons = slots.filter((slot) => slot.weekday === weekdayOf(today));
  return (
    <RecordSection
      title={m.teachTodayLessons()}
      description={formatDate(today)}
    >
      {lessons.length === 0 ? (
        <RecordEmpty>{m.timetableNoLessons()}</RecordEmpty>
      ) : (
        <RecordList>
          {lessons.map((slot) => (
            <li key={slot.id} className="grid grid-cols-1 gap-0.5 py-3">
              <span className="flex min-w-0 items-center gap-1.5 text-sm leading-5 font-medium">
                <SubjectIcon
                  icon={slot.subject?.icon ?? ""}
                  className="shrink-0 text-muted-foreground"
                />
                <span className="truncate">
                  <Value>{subjectLabel(slot.subject)}</Value>
                </span>
              </span>
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                <span className="tabular-nums">
                  {m.teachTimeRange({
                    from: formatTime(slot.startTime),
                    to: formatTime(slot.endTime),
                  })}
                </span>
                {slot.teacher?.name ? (
                  <>
                    <span aria-hidden> · </span>
                    <span dir="auto">{slot.teacher.name}</span>
                  </>
                ) : null}
                {slot.room ? (
                  <>
                    <span aria-hidden> · </span>
                    {m.timetableRoom()} <span dir="auto">{slot.room}</span>
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </RecordList>
      )}
    </RecordSection>
  );
}

/** The student's lessons today, read from their own timetable. */
export function TodayForStudent({
  studentId,
  today,
}: {
  studentId: string;
  today: string;
}) {
  const { slots } = useSuspenseQuery(timetableQuery({ studentId })).data;
  return <TodayLessons slots={slots} today={today} />;
}

export function TodayWithoutClass() {
  return (
    <RecordSection title={m.teachTodayLessons()}>
      <RecordEmpty>{m.studentTodayNoClass()}</RecordEmpty>
    </RecordSection>
  );
}
