import { DEFAULT_STUDENT_SCOPED_QUERY } from "@faridalms/domain/school-schema";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";

import { ScorePill, SubjectIcon } from "~/components/app/labels";
import {
  EmptyState,
  Field,
  FieldGrid,
  PageHeader,
  Value,
} from "~/components/app/primitives";
import {
  formatPercent,
  percentOf,
  subjectIcon,
  subjectName,
} from "~/components/me/format";
import { Card, CardContent } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import * as m from "~/i18n/messages";
import { gradesQuery } from "~/queries/school";

export const Route = createFileRoute("/_app/me/grades")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      gradesQuery(DEFAULT_STUDENT_SCOPED_QUERY),
    );
  },
  component: MyGradesPage,
});

function MyGradesPage() {
  const { rows, average } = useSuspenseQuery(
    gradesQuery(DEFAULT_STUDENT_SCOPED_QUERY),
  ).data;

  return (
    <>
      <PageHeader title={m.gradesTitle()} description={m.meGradesSubtitle()} />

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-3 p-6">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {m.meOverallAverage()}
          </p>
          <p className="text-5xl font-semibold tracking-tight tabular-nums">
            <Value>{average === null ? null : formatPercent(average)}</Value>
          </p>
          <Progress value={average} aria-label={m.meOverallAverage()} />
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title={m.meGradesEmpty()}
          body={m.meGradesSubtitle()}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((row) => {
            const percent = percentOf(row.score, row.maxScore);
            return (
              <Card key={row.id}>
                <CardContent className="flex flex-col gap-4 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <SubjectIcon icon={subjectIcon(row.subject)} />
                      </span>
                      <h2 className="min-w-0 truncate text-sm font-semibold">
                        <Value>{subjectName(row.subject)}</Value>
                      </h2>
                    </div>
                    <ScorePill score={row.score} maxScore={row.maxScore} />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{m.gradesAverage()}</span>
                      <span className="tabular-nums">
                        {formatPercent(percent)}
                      </span>
                    </div>
                    <Progress
                      value={percent}
                      aria-label={subjectName(row.subject) ?? m.gradesSubject()}
                    />
                  </div>

                  <FieldGrid>
                    <Field label={m.assignmentsTeacher()}>
                      {row.teacher?.name}
                    </Field>
                    <Field label={m.gradesTerm()}>{row.term?.name}</Field>
                  </FieldGrid>

                  <div>
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {m.gradesComment()}
                    </p>
                    <p className="mt-1 text-sm">
                      <Value>{row.comment}</Value>
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
