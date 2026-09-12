import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2 } from "lucide-react";

import { SubjectIcon } from "~/components/app/labels";
import {
  EmptyState,
  Field,
  PageHeader,
  Value,
} from "~/components/app/primitives";
import {
  formatDate,
  studentName,
  subjectName,
} from "~/components/teach/format";
import { GradeForm } from "~/components/teach/GradeForm";
import { Card, CardContent } from "~/components/ui/card";
import * as m from "~/i18n/messages";
import { gradingQueueQuery } from "~/queries/school";

export const Route = createFileRoute("/_app/teach/grading")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(gradingQueueQuery);
  },
  component: GradingPage,
});

function GradingPage() {
  const queue = useSuspenseQuery(gradingQueueQuery).data;

  // A submission whose assignment came back empty cannot be marked out of
  // anything, so it is not a queue entry a teacher can act on.
  const rows = queue.flatMap((row) =>
    row.assignment ? [{ ...row, assignment: row.assignment }] : [],
  );

  return (
    <>
      <PageHeader
        title={m.teachGradingTitle()}
        description={m.teachGradingSubtitle()}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={m.teachAllGraded()}
          body={m.teachNoGrading()}
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {rows.map((row) => {
            const student = row.student ? studentName(row.student) : undefined;
            return (
              <li key={row.id}>
                <Card>
                  <CardContent className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold">
                        <Value>{student}</Value>
                      </h2>
                      <p className="mt-0.5 text-sm">{row.assignment.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {m.assignmentsDue({
                          date: formatDate(row.assignment.dueDate),
                        })}
                      </p>

                      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-4">
                        <Field label={m.assignmentsSubject()}>
                          <span className="flex items-center gap-1.5">
                            <SubjectIcon
                              icon={row.assignment.subject?.icon ?? ""}
                              className="size-3.5"
                            />
                            <Value>{subjectName(row.assignment.subject)}</Value>
                          </span>
                        </Field>
                        <Field label={m.studentClass()}>
                          {row.assignment.class?.name}
                        </Field>
                      </dl>
                    </div>

                    <GradeForm
                      submissionId={row.id}
                      student={student ?? m.commonNotRecorded()}
                      maxScore={row.assignment.maxScore}
                    />
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
