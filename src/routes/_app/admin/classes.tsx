import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense } from "react";
import * as v from "valibot";

import { ClassRoster } from "~/components/admin/ClassRoster";
import { STAGE_LABEL } from "~/components/admin/labels";
import { SubjectIcon } from "~/components/app/labels";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  Value,
} from "~/components/app/primitives";
import { Badge } from "~/components/ui/badge";
import { buttonVariants } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import * as m from "~/i18n/messages";
import { allClassesQuery, classQuery } from "~/queries/school";
import { cn } from "~/utils/cn";
import { formatNumber } from "~/utils/datetime";

const searchSchema = v.object({
  classId: v.optional(v.string(), ""),
});

export const Route = createFileRoute("/_app/admin/classes")({
  validateSearch: (search) => v.parse(searchSchema, search),
  loaderDeps: ({ search }) => ({ classId: search.classId }),
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(allClassesQuery);
    if (deps.classId !== "") {
      await context.queryClient.ensureQueryData(classQuery(deps.classId));
    }
  },
  component: AdminClassesPage,
});

function AdminClassesPage() {
  const { classId } = Route.useSearch();
  const classes = useSuspenseQuery(allClassesQuery).data;
  const selected = classes.find((row) => row.id === classId);

  return (
    <>
      <PageHeader
        title={m.adminClassesTitle()}
        description={m.adminClassesSubtitle()}
      />

      {classes.length === 0 ? (
        <EmptyState title={m.adminClassesEmpty()} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {classes.map((row) => {
            const isSelected = row.id === classId;
            const subjects = row.subjects.flatMap((subject) =>
              subject === null ? [] : [subject],
            );
            return (
              <SectionCard
                key={row.id}
                title={row.name}
                actions={
                  <Badge variant="outline">{STAGE_LABEL[row.stage]()}</Badge>
                }
              >
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">
                      {m.studentGrade()}
                    </dt>
                    <dd>
                      <Value>{row.grade}</Value>
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">
                      {m.adminRoom()}
                    </dt>
                    <dd>
                      <Value>{row.room}</Value>
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">
                      {m.adminHomeroom()}
                    </dt>
                    <dd>
                      <Value>{row.homeroomTeacher?.name}</Value>
                    </dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-xs text-muted-foreground">
                      {m.adminEnrolled()}
                    </dt>
                    <dd className="tabular-nums">
                      {formatNumber(row.enrolledCount)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4">
                  <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {m.adminSubjectsTaught()}
                  </h3>
                  {subjects.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {m.adminNoSubjects()}
                    </p>
                  ) : (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {subjects.map((subject) => (
                        <li key={subject.slug}>
                          <Badge variant="secondary" className="gap-1">
                            <SubjectIcon icon={subject.icon} />
                            {subject.name}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <Link
                  to="/admin/classes"
                  search={{ classId: isSelected ? "" : row.id }}
                  className={cn(
                    buttonVariants({
                      variant: isSelected ? "secondary" : "outline",
                      size: "sm",
                    }),
                    "mt-4",
                  )}
                >
                  {isSelected ? m.adminHideRoster() : m.adminViewRoster()}
                  {/* Every card carries this control, so the class name keeps their
                      accessible names apart. */}
                  <span className="sr-only"> {row.name}</span>
                </Link>
              </SectionCard>
            );
          })}
        </div>
      )}

      {selected ? (
        <SectionCard
          className="mt-6"
          title={m.adminRosterTitle({ name: selected.name })}
          description={m.adminEnrolledCount({
            count: formatNumber(selected.enrolledCount),
          })}
        >
          <Suspense
            fallback={
              <div
                className="flex flex-col gap-2"
                aria-label={m.commonLoading()}
                aria-busy
              >
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            }
          >
            <ClassRoster classId={selected.id} />
          </Suspense>
        </SectionCard>
      ) : null}
    </>
  );
}
