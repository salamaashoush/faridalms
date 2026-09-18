import type { AssignmentRow } from "@faridalms/database/repositories/academics";

import {
  ASSIGNMENT_TYPE_LABEL,
  ScorePill,
  SubjectIcon,
  SubmissionBadge,
} from "~/components/app/labels";
import { Field, FieldGrid, Value } from "~/components/app/primitives";
import { Card, CardContent } from "~/components/ui/card";
import { usePermission } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";

import { formatDate, subjectName } from "./format";
import { SubmitWork } from "./SubmitWork";

export function AssignmentCard({
  row,
  today,
}: {
  row: AssignmentRow;
  today: string;
}) {
  const canSubmit = usePermission("own-work:submit");
  const state = row.submission?.state ?? "not_started";
  const handedIn = state === "submitted" || state === "returned";
  const score = row.submission?.score ?? null;

  return (
    <Card className="gap-0 border-0 py-0 shadow-none">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <SubjectIcon icon={row.subject.icon} />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-balance">
                {row.title}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {subjectName(row.subject)}
              </p>
            </div>
          </div>
          <SubmissionBadge
            state={row.submission?.state ?? null}
            dueDate={row.dueDate}
            today={today}
          />
        </div>

        <p className="text-sm text-muted-foreground">
          <Value>{row.description}</Value>
        </p>

        <FieldGrid>
          <Field label={m.assignmentsType()}>
            {ASSIGNMENT_TYPE_LABEL[row.type]()}
          </Field>
          <Field label={m.meDueDate()}>{formatDate(row.dueDate)}</Field>
          <Field label={m.assignmentsTeacher()}>{row.teacher}</Field>
        </FieldGrid>

        {score === null ? null : (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {m.assignmentsScore()}
              </span>
              <ScorePill score={score} maxScore={row.maxScore} />
            </div>
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {m.meFeedback()}
              </p>
              <p className="mt-1 text-sm">
                <Value>{row.submission?.feedback}</Value>
              </p>
            </div>
          </div>
        )}

        {row.submission?.content ? (
          <div className="rounded-xl bg-muted/50 p-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              {m.courseworkStudentWork()}
            </p>
            <p className="text-sm whitespace-pre-wrap">
              {row.submission.content}
            </p>
          </div>
        ) : null}
        {handedIn || !canSubmit ? null : (
          <div className="flex justify-end">
            <SubmitWork assignmentId={row.id} title={row.title} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
