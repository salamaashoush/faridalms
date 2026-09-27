import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CalendarDays,
  ClipboardCheck,
  GraduationCap,
  Mail,
  School,
} from "lucide-react";

import { ButtonLink } from "~/components/app/ButtonLink";
import { SubjectIcon } from "~/components/app/labels";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatTile,
  Value,
} from "~/components/app/primitives";
import {
  formatDate,
  formatTime,
  handedInCount,
  studentName,
  subjectName,
  weekdayOf,
} from "~/components/teach/format";
import { HandedIn } from "~/components/teach/HandedIn";
import { Badge } from "~/components/ui/badge";
import * as m from "~/i18n/messages";
import { teachingOverviewQuery } from "~/queries/school";
import { formatNumber } from "~/utils/datetime";

export const Route = createFileRoute("/_app/teach/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(teachingOverviewQuery);
  },
  component: TeachingOverviewPage,
});

function TeachingOverviewPage() {
  const {
    today,
    week,
    classes,
    queue,
    assignments,
    unread,
    upcoming,
    timetable,
  } = useSuspenseQuery(teachingOverviewQuery).data;

  const students = classes.reduce((total, row) => total + row.enrolledCount, 0);
  const enrolled = new Map(classes.map((row) => [row.id, row.enrolledCount]));
  const todayLessons = timetable.filter(
    (slot) => slot.weekday === weekdayOf(today),
  );

  return (
    <>
      <PageHeader
        title={m.teachOverviewTitle()}
        description={m.teachOverviewSubtitle()}
        actions={
          <ButtonLink variant="outline" to="/teach/attendance" search={{}}>
            <CalendarDays aria-hidden />
            {m.attendanceRecord()}
          </ButtonLink>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={m.teachStatClasses()}
          value={formatNumber(classes.length)}
          icon={School}
        />
        <StatTile
          label={m.teachStatStudents()}
          value={formatNumber(students)}
          icon={GraduationCap}
        />
        <StatTile
          label={m.teachGradingQueue()}
          value={formatNumber(queue.length)}
          icon={ClipboardCheck}
          tone={queue.length > 0 ? "warning" : "positive"}
        />
        <StatTile
          label={m.overviewUnread()}
          value={formatNumber(unread)}
          icon={Mail}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <SectionCard
          title={m.teachGradingQueue()}
          description={m.teachGradingSubtitle()}
          actions={
            <ButtonLink variant="outline" size="sm" to="/teach/grading">
              {m.commonViewAll()}
            </ButtonLink>
          }
        >
          {queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {m.teachNoGrading()}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {queue.slice(0, 5).map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {row.student ? (
                        <Link
                          to="/students/$studentId"
                          params={{ studentId: row.student.id }}
                          search={{}}
                          className="hover:text-primary hover:underline"
                        >
                          {studentName(row.student)}
                        </Link>
                      ) : (
                        <Value>{null}</Value>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {row.assignment ? (
                        <Link
                          to="/assignments/$assignmentId"
                          params={{ assignmentId: row.assignment.id }}
                          search={{ tab: "work" }}
                          className="hover:text-primary hover:underline"
                        >
                          {row.assignment.title}
                        </Link>
                      ) : (
                        <Value>{null}</Value>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <SubjectIcon
                        icon={row.assignment?.subject?.icon ?? ""}
                        className="size-3.5"
                      />
                      <Value>{subjectName(row.assignment?.subject)}</Value>
                    </span>
                    <span>
                      <Value>{row.assignment?.class?.name}</Value>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title={m.teachThisWeek()}
          description={m.assignmentsWeek({ number: week.number })}
          actions={
            <ButtonLink
              variant="outline"
              size="sm"
              to="/teach/assignments"
              search={{}}
            >
              {m.commonViewAll()}
            </ButtonLink>
          }
        >
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {m.assignmentsEmpty()}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {assignments.slice(0, 5).map((row) => (
                <li
                  key={row.id}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-sm font-medium">{row.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.assignmentsDue({ date: formatDate(row.dueDate) })}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <SubjectIcon
                        icon={row.subject?.icon ?? ""}
                        className="size-3.5"
                      />
                      <Value>{subjectName(row.subject)}</Value>
                    </span>
                    <span>
                      <Value>{row.class?.name}</Value>
                    </span>
                  </div>
                  {row.canAssess && (
                    <HandedIn
                      done={handedInCount(row.submissions)}
                      total={
                        (row.class ? enrolled.get(row.class.id) : undefined) ??
                        row.submissions.length
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <SectionCard
          title={m.teachTodayLessons()}
          description={formatDate(today)}
        >
          {todayLessons.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {m.timetableNoLessons()}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {todayLessons.map((slot) => (
                <li
                  key={slot.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-2">
                    <SubjectIcon
                      icon={slot.subject?.icon ?? ""}
                      className="size-4"
                    />
                    <span className="text-sm font-medium">
                      <Value>{subjectName(slot.subject)}</Value>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      <Value>{slot.class?.name}</Value>
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {m.teachTimeRange({
                      from: formatTime(slot.startTime),
                      to: formatTime(slot.endTime),
                    })}
                    {" · "}
                    {m.timetableRoom()}
                    {": "}
                    <Value>{slot.room}</Value>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title={m.overviewUpcoming()}>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {m.teachNoUpcoming()}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map((event) => (
                <li
                  key={event.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(event.startsOn)}
                    </p>
                  </div>
                  {event.provisional ? (
                    <Badge variant="outline">{m.commonProvisional()}</Badge>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {classes.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={School} title={m.teachNoClasses()} />
        </div>
      ) : null}
    </>
  );
}
