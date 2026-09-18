import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/app/field";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import * as m from "~/i18n/messages";
import { submitGrade } from "~/server/school";

export function scoreError(raw: string, maxScore: number): string | undefined {
  const score = Number(raw);
  if (
    raw.trim() === "" ||
    !Number.isInteger(score) ||
    score < 0 ||
    score > maxScore
  ) {
    return m.teachScoreRange({ max: maxScore });
  }
  return undefined;
}

export function GradeForm({
  submissionId,
  student,
  maxScore,
}: {
  submissionId: string;
  student: string;
  maxScore: number;
}) {
  const queryClient = useQueryClient();
  const grade = useServerFn(submitGrade);

  const { mutate, isPending } = useMutation({
    mutationFn: grade,
    onSuccess: async () => {
      toast.success(m.teachGradeSaved());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["grading"] }),
        queryClient.invalidateQueries({ queryKey: ["overview", "teaching"] }),
        queryClient.invalidateQueries({ queryKey: ["assignments"] }),
      ]);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const form = useForm({
    defaultValues: { score: "", feedback: "" },
    onSubmit: ({ value }) => {
      if (scoreError(value.score, maxScore)) {
        return;
      }
      mutate({
        data: {
          submissionId,
          score: Number(value.score),
          feedback: value.feedback,
        },
      });
    },
  });

  const scoreId = `score-${submissionId}`;
  const feedbackId = `feedback-${submissionId}`;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FieldGroup className="gap-4">
        <form.Field
          name="score"
          validators={{
            onChange: ({ value }) => scoreError(value, maxScore),
            onSubmit: ({ value }) => scoreError(value, maxScore),
          }}
        >
          {(field) => {
            const message = scoreError(field.state.value, maxScore);
            const invalid = !field.state.meta.isValid && message !== undefined;
            return (
              <Field data-invalid={invalid}>
                <FieldLabel htmlFor={scoreId}>
                  {m.assignmentsScore()}
                </FieldLabel>
                <div className="flex items-center gap-2">
                  <Input
                    id={scoreId}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={maxScore}
                    step={1}
                    className="h-11 w-24 sm:h-9"
                    aria-label={m.teachScoreFor({ student, max: maxScore })}
                    aria-invalid={invalid}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      field.handleChange(event.target.value);
                    }}
                  />
                  <span className="text-sm whitespace-nowrap text-muted-foreground">
                    {m.teachOutOf({ max: maxScore })}
                  </span>
                </div>
                {invalid ? <FieldError>{message}</FieldError> : null}
              </Field>
            );
          }}
        </form.Field>

        <form.Field name="feedback">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={feedbackId}>{m.teachFeedback()}</FieldLabel>
              <Textarea
                id={feedbackId}
                rows={2}
                aria-label={m.teachFeedbackFor({ student })}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value);
                }}
              />
            </Field>
          )}
        </form.Field>

        <Button
          type="submit"
          size="sm"
          className="h-11 self-start sm:h-9"
          disabled={isPending}
        >
          {isPending ? m.teachSaving() : m.teachSaveGrade()}
        </Button>
      </FieldGroup>
    </form>
  );
}
