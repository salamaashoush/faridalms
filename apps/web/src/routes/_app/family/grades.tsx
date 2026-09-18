import { studentScopedQuerySchema } from "@faridalms/domain/school-schema";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, Percent } from "lucide-react";

import { ScorePill, SubjectIcon } from "~/components/app/labels";
import {
  EmptyState,
  Field,
  PageHeader,
  SectionCard,
  StatTile,
  Value,
} from "~/components/app/primitives";
import { percentOf, subjectLabel } from "~/components/family/format";
import { ScoreBar } from "~/components/family/ScoreBar";
import { StudentScopeBar } from "~/components/family/StudentScopeBar";
import * as m from "~/i18n/messages";
import { gradesQuery, visibleStudentsQuery } from "~/queries/school";
import { formatNumber } from "~/utils/datetime";

export const Route = createFileRoute("/_app/family/grades")({
  validateSearch: studentScopedQuerySchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(gradesQuery(deps)),
      context.queryClient.ensureQueryData(visibleStudentsQuery),
    ]);
  },
  component: FamilyGradesPage,
});

function FamilyGradesPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { rows, average } = useSuspenseQuery(gradesQuery(search)).data;

  return (
    <>
      <PageHeader
        title={m.gradesTitle()}
        description={m.familyGradesSubtitle()}
      />

      <StudentScopeBar
        studentId={search.studentId}
        onChange={(studentId) => {
          void navigate({ search: (prev) => ({ ...prev, studentId }) });
        }}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <StatTile
          label={m.gradesAverage()}
          value={
            average === null ? (
              <Value>{null}</Value>
            ) : (
              m.familyPercentValue({ value: formatNumber(average) })
            )
          }
          icon={Percent}
          tone={
            average === null
              ? "default"
              : average >= 85
                ? "positive"
                : average >= 60
                  ? "default"
                  : "critical"
          }
        />
      </div>

      <SectionCard title={m.gradesTitle()}>
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
    </>
  );
}
