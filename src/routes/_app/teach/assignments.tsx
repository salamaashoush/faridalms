import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";
import * as v from "valibot";

import { ASSIGNMENT_TYPE_LABEL, SubjectIcon } from "~/components/app/labels";
import { EmptyState, PageHeader, Value } from "~/components/app/primitives";
import { ClassPicker } from "~/components/teach/ClassPicker";
import {
  formatDate,
  handedInCount,
  subjectName,
} from "~/components/teach/format";
import { HandedIn } from "~/components/teach/HandedIn";
import { WeekNav } from "~/components/teach/WeekNav";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import * as m from "~/i18n/messages";
import { classAssignmentsQuery, myClassesQuery } from "~/queries/school";
import { classScopedQuerySchema } from "~/schema/school";

export const Route = createFileRoute("/_app/teach/assignments")({
  validateSearch: (search) => v.parse(classScopedQuerySchema, search),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(classAssignmentsQuery(deps)),
      context.queryClient.ensureQueryData(myClassesQuery),
    ]);
  },
  component: TeachingAssignmentsPage,
});

function TeachingAssignmentsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { week, weeks, rows } = useSuspenseQuery(
    classAssignmentsQuery(search),
  ).data;
  const classes = useSuspenseQuery(myClassesQuery).data;

  const enrolled = new Map(classes.map((row) => [row.id, row.enrolledCount]));

  return (
    <>
      <PageHeader
        title={m.assignmentsTitle()}
        description={m.teachAssignmentsSubtitle()}
      />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <ClassPicker
          id="assignments-class"
          label={m.teachFilterClass()}
          value={search.classId}
          classes={classes}
          withAllOption
          onChange={(classId) => {
            void navigate({
              search: (previous) => ({ ...previous, classId }),
            });
          }}
        />
        <WeekNav
          week={week}
          weeks={weeks}
          onSelect={(number) => {
            void navigate({
              search: (previous) => ({ ...previous, week: number }),
            });
          }}
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={ClipboardList} title={m.assignmentsEmpty()} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {rows.map((row) => {
            const total =
              (row.class ? enrolled.get(row.class.id) : undefined) ??
              row.submissions.length;
            return (
              <Card key={row.id}>
                <CardContent className="flex flex-col gap-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <SubjectIcon
                          icon={row.subject?.icon ?? ""}
                          className="size-3.5"
                        />
                        <Value>{subjectName(row.subject)}</Value>
                        <span aria-hidden>·</span>
                        <Value>{row.class?.name}</Value>
                      </p>
                      <h2 className="mt-1 text-base font-semibold text-balance">
                        {row.title}
                      </h2>
                    </div>
                    <Badge variant="outline">
                      {ASSIGNMENT_TYPE_LABEL[row.type]()}
                    </Badge>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    {m.assignmentsDue({ date: formatDate(row.dueDate) })}
                  </p>

                  <HandedIn
                    done={handedInCount(row.submissions)}
                    total={total}
                    className="max-w-none"
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
