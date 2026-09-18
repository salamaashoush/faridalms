import type { getLearnerAssignment } from "~/server/assignments";

import { SectionCard } from "~/components/app/primitives";
import { ContentView } from "~/components/content/ContentView";
import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

import { AttemptView } from "./AttemptView";
import { formatInstant } from "./format";

type Learner = Awaited<ReturnType<typeof getLearnerAssignment>>;

/** Every hand-in, newest first, with released feedback beside the attempt it refers to. */
export function AttemptHistory({ assignment }: { assignment: Learner }) {
  const attempts = [...assignment.submission.attempts].toReversed();
  if (attempts.length === 0) return null;
  return (
    <div className="space-y-6">
      {attempts.map((attempt) => (
        <SectionCard
          key={attempt.id}
          title={m.attemptNumbered({ number: formatNumber(attempt.number) })}
          description={`${formatInstant(attempt.submittedAt, assignment.timeZone) ?? ""}${attempt.isLate ? ` · ${m.assignmentWindowLate()}` : ""}`}
        >
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <AttemptView
              content={attempt.content}
              plainText={attempt.plainText}
              files={attempt.files}
            />
            <div className="rounded-lg border bg-muted/30 p-4">
              <h4 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {m.assessmentTitle()}
              </h4>
              {attempt.assessment ? (
                <div className="mt-3 space-y-3">
                  <p className="text-2xl font-semibold tabular-nums">
                    {m.courseworkScoreValue({
                      score: attempt.assessment.effectiveScore,
                      max: assignment.maxScore,
                    })}
                  </p>
                  {attempt.assessment.effectiveScore !==
                  attempt.assessment.score ? (
                    <p className="text-xs text-muted-foreground">
                      {m.assessmentBeforeDeduction({
                        score: formatNumber(attempt.assessment.score),
                        percent: formatNumber(assignment.lateDeductionPercent),
                      })}
                    </p>
                  ) : null}
                  {assignment.rubric.length ? (
                    <ul className="divide-y text-sm">
                      {assignment.rubric.map((criterion) => {
                        const entry = attempt.assessment?.rubricScores.find(
                          (row) => row.criterionId === criterion.id,
                        );
                        return (
                          <li key={criterion.id} className="py-2">
                            <div className="flex justify-between gap-3">
                              <span>{criterion.title}</span>
                              <span className="tabular-nums">
                                {formatNumber(entry?.points ?? 0)}/
                                {formatNumber(criterion.maxPoints)}
                              </span>
                            </div>
                            {entry?.comment ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {entry.comment}
                              </p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                  {attempt.assessment.feedback ? (
                    <ContentView document={attempt.assessment.feedback} />
                  ) : attempt.assessment.feedbackText ? (
                    <p className="text-sm whitespace-pre-wrap">
                      {attempt.assessment.feedbackText}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {m.assessmentNoFeedback()}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {m.assessmentReleasedOn({
                      date:
                        formatInstant(
                          attempt.assessment.releasedAt,
                          assignment.timeZone,
                        ) ?? "",
                    })}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  {m.assessmentPending()}
                </p>
              )}
            </div>
          </div>
        </SectionCard>
      ))}
    </div>
  );
}
