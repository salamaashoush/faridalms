import type { ContentDocument } from "@faridalms/domain/content";

import { effectiveScore, rubricTotal } from "@faridalms/domain/assignment";
import { emptyContent } from "@faridalms/domain/content-conversion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Send } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { getAttemptForReview } from "~/server/assignments";

import { Field, FieldDescription, FieldLabel } from "~/components/app/field";
import { ContentEditor } from "~/components/content/ContentEditor";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import * as m from "~/i18n/messages";
import { assessAttempt } from "~/server/assignments";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { formatInstant } from "./format";

type Review = Awaited<ReturnType<typeof getAttemptForReview>>;

/**
 * Score and feedback for one attempt. Saving keeps the assessment private;
 * releasing is what the learner and their family see.
 */
export function AssessmentForm({
  review,
  timeZone,
}: {
  review: Review;
  timeZone: string;
}) {
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const assess = useServerFn(assessAttempt);
  const rubric = review.assignment.rubric;
  const [rubricScores, setRubricScores] = useState(() =>
    rubric.map((criterion) => {
      const existing = review.assessment?.rubricScores.find(
        (row) => row.criterionId === criterion.id,
      );
      return {
        criterionId: criterion.id,
        points: existing?.points ?? 0,
        comment: existing?.comment ?? "",
      };
    }),
  );
  const [score, setScore] = useState<string>(
    review.assessment ? String(review.assessment.score) : "",
  );
  const [feedback, setFeedback] = useState<ContentDocument>(
    review.assessment?.feedback ?? emptyContent(),
  );
  const [feedbackValid, setFeedbackValid] = useState(true);
  const [failure, setFailure] = useState<string>();
  const onFeedback = useCallback(
    (value: ContentDocument) => setFeedback(value),
    [],
  );
  const onFeedbackValidity = useCallback(
    (valid: boolean) => setFeedbackValid(valid),
    [],
  );
  const total = rubric.length
    ? rubricTotal(rubric, rubricScores)
    : Number(score);
  const numeric = rubric.length ? total : Number(score);
  const valid =
    numeric !== null &&
    Number.isInteger(numeric) &&
    numeric >= 0 &&
    numeric <= review.assignment.maxScore &&
    feedbackValid;
  const mutation = useMutation({
    mutationFn: (release: boolean) =>
      assess({
        data: {
          attemptId: review.id,
          score: numeric ?? 0,
          rubricScores,
          feedback,
          release,
        },
      }),
    onSuccess: async (result, release) => {
      setFailure(undefined);
      toast.success(release ? m.assessmentReleased() : m.assessmentSaved());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["assignments"] }),
        queryClient.invalidateQueries({ queryKey: ["grading"] }),
        queryClient.invalidateQueries({ queryKey: ["overview", "teaching"] }),
      ]);
      void result;
    },
    onError: (error) => setFailure(getMessageFromError(error)),
  });
  const previewEffective =
    numeric === null
      ? null
      : effectiveScore(numeric, review.isLate, review.assignment);
  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) mutation.mutate(false);
      }}
    >
      <fieldset
        disabled={!hydrated || mutation.isPending}
        className="min-w-0 space-y-5"
      >
        {rubric.length ? (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">{m.rubricTitle()}</h4>
            <ul className="space-y-3">
              {rubric.map((criterion) => {
                const entry = rubricScores.find(
                  (row) => row.criterionId === criterion.id,
                );
                return (
                  <li
                    key={criterion.id}
                    className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_7rem_1fr]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{criterion.title}</p>
                      {criterion.description ? (
                        <p className="text-xs text-muted-foreground">
                          {criterion.description}
                        </p>
                      ) : null}
                    </div>
                    <Field>
                      <FieldLabel
                        htmlFor={`points-${criterion.id}`}
                        className="text-xs"
                      >
                        {m.teachOutOf({ max: criterion.maxPoints })}
                      </FieldLabel>
                      <Input
                        id={`points-${criterion.id}`}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={criterion.maxPoints}
                        aria-label={m.rubricPointsFor({
                          title: criterion.title,
                        })}
                        value={entry?.points ?? 0}
                        onChange={(event) =>
                          setRubricScores((rows) =>
                            rows.map((row) =>
                              row.criterionId === criterion.id
                                ? {
                                    ...row,
                                    points: Math.max(
                                      0,
                                      Math.trunc(
                                        event.target.valueAsNumber || 0,
                                      ),
                                    ),
                                  }
                                : row,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel
                        htmlFor={`comment-${criterion.id}`}
                        className="text-xs"
                      >
                        {m.rubricComment()}
                      </FieldLabel>
                      <Input
                        id={`comment-${criterion.id}`}
                        value={entry?.comment ?? ""}
                        maxLength={2000}
                        aria-label={m.rubricCommentFor({
                          title: criterion.title,
                        })}
                        onChange={(event) =>
                          setRubricScores((rows) =>
                            rows.map((row) =>
                              row.criterionId === criterion.id
                                ? { ...row, comment: event.target.value }
                                : row,
                            ),
                          )
                        }
                      />
                    </Field>
                  </li>
                );
              })}
            </ul>
            <p className="text-sm">
              {m.assessmentTotal({
                total: formatNumber(total ?? 0),
                max: formatNumber(review.assignment.maxScore),
              })}
            </p>
          </div>
        ) : (
          <Field>
            <FieldLabel htmlFor={`score-${review.id}`}>
              {m.assignmentsScore()}
            </FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                id={`score-${review.id}`}
                type="number"
                inputMode="numeric"
                min={0}
                max={review.assignment.maxScore}
                step={1}
                className="w-28"
                aria-invalid={score !== "" && !valid ? true : undefined}
                value={score}
                onChange={(event) => setScore(event.target.value)}
              />
              <span className="text-sm whitespace-nowrap text-muted-foreground">
                {m.teachOutOf({ max: review.assignment.maxScore })}
              </span>
            </div>
            {score !== "" && !valid ? (
              <FieldDescription className="text-destructive">
                {m.teachScoreRange({ max: review.assignment.maxScore })}
              </FieldDescription>
            ) : null}
          </Field>
        )}
        {review.isLate &&
        review.assignment.latePolicy === "accepted_with_deduction" &&
        previewEffective !== null ? (
          <p className="text-sm text-muted-foreground">
            {m.assessmentLateDeduction({
              percent: formatNumber(review.assignment.lateDeductionPercent),
              score: formatNumber(previewEffective),
            })}
          </p>
        ) : null}
        <ContentEditor
          id={`feedback-${review.id}`}
          label={m.teachFeedback()}
          value={feedback}
          onChange={onFeedback}
          onValidityChange={onFeedbackValidity}
          disabled={mutation.isPending}
        />
      </fieldset>
      {failure ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {failure}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant="outline"
          disabled={!hydrated || !valid || mutation.isPending}
        >
          <Check className="size-4" aria-hidden />
          {m.assessmentSave()}
        </Button>
        <Button
          type="button"
          disabled={!hydrated || !valid || mutation.isPending}
          onClick={() => mutation.mutate(true)}
        >
          <Send className="size-4" aria-hidden />
          {review.assessment?.releasedAt
            ? m.assessmentUpdateRelease()
            : m.assessmentRelease()}
        </Button>
        {review.assessment?.releasedAt ? (
          <span className="self-center text-xs text-muted-foreground">
            {m.assessmentReleasedOn({
              date: formatInstant(review.assessment.releasedAt, timeZone) ?? "",
            })}
          </span>
        ) : null}
      </div>
    </form>
  );
}
