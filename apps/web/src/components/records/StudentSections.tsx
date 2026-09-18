import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookOpen, CalendarOff, ClipboardList } from "lucide-react";

import {
  AttendanceBadge,
  ScorePill,
  SubjectIcon,
} from "~/components/app/labels";
import {
  EmptyState,
  Field,
  SectionCard,
  StatTile,
  Value,
} from "~/components/app/primitives";
import { LearnerStateBadge } from "~/components/assignments/labels";
import {
  formatDate,
  percentOf,
  subjectLabel,
} from "~/components/family/format";
import { ScoreBar } from "~/components/family/ScoreBar";
import { WeekNav } from "~/components/family/WeekNav";
import { Progress } from "~/components/ui/progress";
import * as m from "~/i18n/messages";
import {
  assignmentsQuery,
  attendanceQuery,
  gradesQuery,
} from "~/queries/school";
import { formatNumber } from "~/utils/datetime";

export function StudentCoursework({
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
    <SectionCard
      title={m.navAssignments()}
      description={m.assignmentsWeek({ number: data.week.number })}
      actions={
        <WeekNav week={data.week} weeks={data.weeks} onSelect={onWeek} />
      }
    >
      {data.rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title={m.assignmentsEmpty()} />
      ) : (
        <ul className="divide-y">
          {data.rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <Link
                  to="/assignments/$assignmentId"
                  params={{ assignmentId: row.id }}
                  search={{ studentId }}
                  className="font-medium hover:text-primary hover:underline"
                >
                  {row.title}
                </Link>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <SubjectIcon icon={row.subject.icon} />
                    <Value>{subjectLabel(row.subject)}</Value>
                  </span>
                  <span aria-hidden>·</span>
                  {m.assignmentsDue({ date: formatDate(row.dueDate) })}
                </p>
              </div>
              <LearnerStateBadge
                state={row.learnerState}
                late={
                  row.window === "late" && row.learnerState === "not_started"
                }
              />
              <span className="w-20 text-end text-sm tabular-nums">
                <Value>
                  {row.submission?.score === null ||
                  row.submission?.score === undefined
                    ? null
                    : m.courseworkScoreValue({
                        score: row.submission.score,
                        max: row.maxScore,
                      })}
                </Value>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function StudentAttendance({ studentId }: { studentId: string }) {
  const { summary, rows } = useSuspenseQuery(
    attendanceQuery({ studentId }),
  ).data;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={m.attendanceRate()}
          value={
            <Value>
              {summary.rate === null
                ? null
                : m.familyPercentValue({ value: formatNumber(summary.rate) })}
            </Value>
          }
          tone={
            summary.rate === null
              ? "default"
              : summary.rate >= 90
                ? "positive"
                : summary.rate >= 75
                  ? "warning"
                  : "critical"
          }
        />
        <StatTile
          label={m.attendancePresent()}
          value={formatNumber(summary.present)}
        />
        <StatTile
          label={m.attendanceAbsent()}
          value={formatNumber(summary.absent)}
          tone={summary.absent > 0 ? "critical" : "default"}
        />
        <StatTile
          label={m.attendanceLate()}
          value={formatNumber(summary.late)}
          tone={summary.late > 0 ? "warning" : "default"}
        />
      </div>
      <SectionCard title={m.familyDailyRecord()}>
        {summary.rate === null ? null : (
          <Progress
            value={summary.rate}
            aria-label={m.attendanceRate()}
            className="mb-4"
          />
        )}
        {rows.length === 0 ? (
          <EmptyState title={m.familyAttendanceEmpty()} icon={CalendarOff} />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
              >
                <span className="w-32 shrink-0 text-sm tabular-nums">
                  {formatDate(row.date)}
                </span>
                <AttendanceBadge status={row.status} />
                {row.note ? (
                  <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                    <span className="sr-only">{m.attendanceNote()}</span>
                    {row.note}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

export function StudentGrades({ studentId }: { studentId: string }) {
  const { rows, average } = useSuspenseQuery(gradesQuery({ studentId })).data;
  return (
    <SectionCard
      title={m.gradesTitle()}
      description={
        average === null
          ? undefined
          : `${m.overviewAverageGrade()}: ${m.familyPercentValue({ value: formatNumber(average) })}`
      }
    >
      {rows.length === 0 ? (
        <EmptyState title={m.familyGradesEmpty()} icon={BookOpen} />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((row) => {
            const subjectName =
              subjectLabel(row.subject) ?? m.commonNotRecorded();
            return (
              <li key={row.id} className="py-5 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <SubjectIcon
                      icon={row.subject?.icon ?? ""}
                      className="shrink-0 text-primary"
                    />
                    <span className="truncate">{subjectName}</span>
                  </span>
                  <ScorePill score={row.score} maxScore={row.maxScore} />
                </div>
                <div className="mt-3">
                  <ScoreBar
                    subject={subjectName}
                    percent={percentOf(row.score, row.maxScore)}
                  />
                </div>
                <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-3">
                  <Field label={m.assignmentsTeacher()}>
                    {row.teacher?.name}
                  </Field>
                  <Field label={m.gradesTerm()}>{row.term?.name}</Field>
                  <Field label={m.gradesComment()}>{row.comment}</Field>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
