import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, ClipboardList } from "lucide-react";
import * as v from "valibot";

import {
  ASSIGNMENT_TYPE_LABEL,
  ScorePill,
  SubjectIcon,
  SubmissionBadge,
} from "~/components/app/labels";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  Value,
} from "~/components/app/primitives";
import { formatDate, subjectLabel } from "~/components/family/format";
import { StudentScopeBar } from "~/components/family/StudentScopeBar";
import { WeekNav } from "~/components/family/WeekNav";
import { Badge } from "~/components/ui/badge";
import * as m from "~/i18n/messages";
import {
  assignmentsQuery,
  familyOverviewQuery,
  visibleStudentsQuery,
} from "~/queries/school";
import { assignmentsQuerySchema } from "~/schema/school";

export const Route = createFileRoute("/_app/family/assignments")({
  validateSearch: (search) => v.parse(assignmentsQuerySchema, search),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(assignmentsQuery(deps)),
      context.queryClient.ensureQueryData(visibleStudentsQuery),
      context.queryClient.ensureQueryData(familyOverviewQuery),
    ]);
  },
  component: FamilyAssignmentsPage,
});

function FamilyAssignmentsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { week, weeks, rows } = useSuspenseQuery(assignmentsQuery(search)).data;
  // "Overdue" is relative to the server's today, never the browser's: the
  // seeded fixtures sit on a fixed date and a wall clock would mark the whole
  // year late.
  const { today } = useSuspenseQuery(familyOverviewQuery).data;

  return (
    <>
      <PageHeader
        title={m.assignmentsTitle()}
        description={m.familyAssignmentsSubtitle()}
      />

      <StudentScopeBar
        studentId={search.studentId}
        onChange={(studentId) => {
          void navigate({ search: (prev) => ({ ...prev, studentId }) });
        }}
      >
        <WeekNav
          week={week}
          weeks={weeks}
          onSelect={(number) => {
            void navigate({ search: (prev) => ({ ...prev, week: number }) });
          }}
        />
      </StudentScopeBar>

      <SectionCard
        title={m.assignmentsTitle()}
        description={m.assignmentsWeekRange({
          from: formatDate(week.startsOn),
          to: formatDate(week.endsOn),
        })}
      >
        {rows.length === 0 ? (
          <EmptyState title={m.assignmentsEmpty()} icon={ClipboardList} />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <SubjectIcon icon={row.subject.icon} />
                  </span>

                  <div className="min-w-0">
                    <p className="text-sm font-medium">{row.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {subjectLabel(row.subject)}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
                      <Badge variant="outline">
                        {ASSIGNMENT_TYPE_LABEL[row.type]()}
                      </Badge>

                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarClock className="size-3.5" aria-hidden />
                        {row.dueDate ? (
                          m.assignmentsDue({ date: formatDate(row.dueDate) })
                        ) : (
                          <>
                            <span>{m.familyDueDate()}</span>
                            <Value>{null}</Value>
                          </>
                        )}
                      </span>

                      {row.teacher ? (
                        <span className="text-xs text-muted-foreground">
                          {row.teacher}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <SubmissionBadge
                    state={row.submission?.state ?? null}
                    dueDate={row.dueDate}
                    today={today}
                  />
                  {row.submission?.state === "returned" &&
                  row.submission.score !== null ? (
                    <>
                      <span className="sr-only">{m.assignmentsScore()}</span>
                      <ScorePill
                        score={row.submission.score}
                        maxScore={row.maxScore}
                      />
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
