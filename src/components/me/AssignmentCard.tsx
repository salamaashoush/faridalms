import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import type { AssignmentRow } from "~/db/repositories/academics";

import {
  ASSIGNMENT_TYPE_LABEL,
  ScorePill,
  SubjectIcon,
  SubmissionBadge,
} from "~/components/app/labels";
import { Field, FieldGrid, Value } from "~/components/app/primitives";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import * as m from "~/i18n/messages";
import { submitAssignment } from "~/server/school";

import { formatDate, subjectName } from "./format";

export function AssignmentCard({
  row,
  today,
}: {
  row: AssignmentRow;
  today: string;
}) {
  const queryClient = useQueryClient();
  const submit = useServerFn(submitAssignment);

  const mutation = useMutation({
    mutationFn: () => submit({ data: { assignmentId: row.id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assignments"] });
      toast.success(m.assignmentsSubmitted(), {
        description: m.meSubmitToast(),
      });
    },
  });

  const state = row.submission?.state ?? "not_started";
  const handedIn = state === "submitted" || state === "returned";
  const score = row.submission?.score ?? null;

  return (
    <Card>
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

        {handedIn ? null : (
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? m.meSubmitting() : m.assignmentsSubmit()}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
