import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarClock,
  CircleCheckBig,
  GraduationCap,
  Mail,
  TriangleAlert,
  UserCheck,
} from "lucide-react";

import { ButtonLink } from "~/components/app/ButtonLink";
import { SubjectIcon } from "~/components/app/labels";
import {
  EmptyState,
  Field,
  FieldGrid,
  PageHeader,
  SectionCard,
  StatTile,
  Value,
} from "~/components/app/primitives";
import { LearnerStateBadge } from "~/components/assignments/labels";
import {
  formatDate,
  formatPercent,
  formatTime,
  subjectIcon,
  subjectName,
  weekdayOf,
} from "~/components/me/format";
import * as m from "~/i18n/messages";
import { studentOverviewQuery } from "~/queries/school";
import { cn } from "~/utils/cn";
import { formatNumber } from "~/utils/datetime";

export const Route = createFileRoute("/_app/me/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(studentOverviewQuery);
  },
  component: StudentOverviewPage,
});

function StudentOverviewPage() {
  const data = useSuspenseQuery(studentOverviewQuery).data;
  const {
    today,
    student,
    attendance,
    average,
    overdue,
    unread,
    assignments,
    timetable,
  } = data;

  const todayWeekday = weekdayOf(today);
  const nextLesson = timetable
    .filter((slot) => slot.weekday === todayWeekday)
    .toSorted((a, b) => a.startTime.localeCompare(b.startTime))[0];

  const outstanding = assignments.filter((row) => {
    const state = row.submission?.state ?? "not_started";
    return state === "not_started" || state === "draft";
  });

  return (
    <>
      <PageHeader
        title={
          student
            ? m.overviewGreeting({ name: student.firstName })
            : m.meOverviewTitle()
        }
        description={m.meOverviewSubtitle()}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={m.overviewAttendanceRate()}
          value={
            <Value>
              {attendance.rate === null ? null : formatPercent(attendance.rate)}
            </Value>
          }
          hint={m.meDaysRecorded({ count: formatNumber(attendance.total) })}
          icon={UserCheck}
          tone={
            attendance.rate !== null && attendance.rate < 85
              ? "warning"
              : "positive"
          }
        />
        <StatTile
          label={m.overviewAverageGrade()}
          value={
            <Value>{average === null ? null : formatPercent(average)}</Value>
          }
          icon={GraduationCap}
        />
        <StatTile
          label={m.overviewOverdue()}
          value={formatNumber(overdue)}
          icon={TriangleAlert}
          tone={overdue > 0 ? "critical" : "positive"}
        />
        <StatTile
          label={m.overviewUnread()}
          value={formatNumber(unread)}
          icon={Mail}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <SectionCard
          title={m.meNextLesson()}
          actions={
            <ButtonLink variant="ghost" size="sm" to="/me/timetable">
              {m.navTimetable()}
            </ButtonLink>
          }
        >
          {nextLesson ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <SubjectIcon
                    icon={subjectIcon(nextLesson.subject)}
                    className="size-5"
                  />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">
                    <Value>{subjectName(nextLesson.subject)}</Value>
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {m.meTimeRange({
                      from: formatTime(nextLesson.startTime),
                      to: formatTime(nextLesson.endTime),
                    })}
                  </p>
                </div>
              </div>
              <FieldGrid>
                <Field label={m.timetableRoom()}>{nextLesson.room}</Field>
                <Field label={m.assignmentsTeacher()}>
                  {nextLesson.teacher?.name}
                </Field>
              </FieldGrid>
            </div>
          ) : (
            <EmptyState
              icon={CalendarClock}
              title={m.timetableNoLessons()}
              body={m.meNoLessonsToday()}
            />
          )}
        </SectionCard>

        <SectionCard
          title={m.meDueSoon()}
          description={m.meDueSoonSubtitle()}
          actions={
            <ButtonLink
              variant="ghost"
              size="sm"
              to="/me/assignments"
              search={{ studentId: "" }}
            >
              {m.commonViewAll()}
            </ButtonLink>
          }
        >
          {outstanding.length === 0 ? (
            <EmptyState
              icon={CircleCheckBig}
              title={m.overviewNoWork()}
              body={m.meAllCaughtUp()}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {outstanding.map((row) => {
                const isOverdue = row.dueDate < today;
                return (
                  <li
                    key={row.id}
                    className={cn(
                      "flex flex-wrap items-center gap-3 rounded-lg border border-s-4 p-3",
                      isOverdue
                        ? "border-destructive/30 border-s-destructive bg-destructive/5"
                        : "border-border border-s-primary/40",
                    )}
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <SubjectIcon icon={row.subject.icon} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        <Link
                          to="/assignments/$assignmentId"
                          params={{ assignmentId: row.id }}
                          search={{}}
                          className="hover:text-primary hover:underline"
                        >
                          {row.title}
                        </Link>
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {subjectName(row.subject)} ·{" "}
                        {m.assignmentsDue({ date: formatDate(row.dueDate) })}
                      </p>
                    </div>
                    <LearnerStateBadge state={row.learnerState} />
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
