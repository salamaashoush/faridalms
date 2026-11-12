import type { ContentDocument } from "@faridalms/domain/content";

import { planTargets } from "@faridalms/domain/standards";
import { cn } from "@faridalms/ui/cn";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { useQuery } from "@tanstack/react-query";

import type { PlanCover, PlanCoverageProps } from "~/components/learning/slots";

import { DetailsPanel, DetailsSection } from "~/components/system/DocumentPage";
import * as m from "~/i18n/messages";
import { describeStandards } from "~/server/standards";

/** How the lessons cover a standard: the questions assessing it, and the lessons setting it out. */
function coverOf(row: Pick<PlanCover, "questions" | "lessons">) {
  return [
    row.questions ? m.planQuestions({ count: row.questions }) : null,
    row.lessons ? m.planLessons({ count: row.lessons }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

interface StatementProps {
  code: string;
  statement: string;
}

function Statement({ code, statement }: StatementProps) {
  return (
    <span className="min-w-0 text-sm leading-5" dir="auto">
      {code ? (
        <>
          <span className="font-mono text-[13px] font-medium text-muted-foreground">
            {code}
          </span>{" "}
        </>
      ) : null}
      {statement}
    </span>
  );
}

/**
 * A plan's standards read against its module's lessons: each standard the
 * plan names with the questions that assess it and the lessons that set it
 * out, the ones no question assesses yet, and the standards the lessons
 * cover that the plan leaves out.
 */
function PlanCoverage({ content, covered, framed = false }: PlanCoverageProps) {
  const named = planTargets(content);
  const ids = named.map((target) => target.id).toSorted();
  // Ideas that frame a unit, such as key concepts, are named, not assessed.
  const framing = useQuery({
    queryKey: ["standards", "describe", ids],
    queryFn: () => describeStandards({ data: { ids } }),
    enabled: ids.length > 0,
    staleTime: 60_000,
    select: (rows) =>
      new Set(rows.filter((row) => !row.assessed).map((row) => row.id)),
  });
  const counted = new Map(covered.map((row) => [row.id, row]));
  const left = covered.filter(
    (row) => !named.some((target) => target.id === row.id),
  );
  const list = "grid gap-2";
  const row = "grid gap-0.5";
  const sections = (
    <>
      <DetailsSection title={m.planNamed()}>
        {named.length === 0 ? (
          <EmptyState placement="section" title={m.planNoStandards()} />
        ) : (
          <ul className={list}>
            {named.map((target) => {
              const cover = counted.get(target.id);
              const questions = cover?.questions ?? 0;
              const frames = framing.data?.has(target.id) ?? false;
              // Until its framework is known, nothing is called unassessed.
              const settled = framing.data !== undefined;
              return (
                <li key={target.id} className={row}>
                  <Statement code={target.code} statement={target.statement} />
                  <span
                    className={cn(
                      "text-[13px] leading-[18px]",
                      questions || frames || !settled
                        ? "text-muted-foreground"
                        : "text-warning-foreground dark:text-warning",
                    )}
                  >
                    {frames
                      ? m.planFrames()
                      : questions || !settled
                        ? coverOf({ questions, lessons: cover?.lessons ?? 0 })
                        : [
                            m.planNotAssessed(),
                            coverOf({
                              questions: 0,
                              lessons: cover?.lessons ?? 0,
                            }),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </DetailsSection>
      {left.length > 0 ? (
        <DetailsSection title={m.planUnplanned()}>
          <ul className={list}>
            {left.map((standard) => (
              <li key={standard.id} className={row}>
                <Statement
                  code={standard.code}
                  statement={standard.statement}
                />
                <span className="text-[13px] leading-[18px] text-muted-foreground">
                  {coverOf(standard)}
                </span>
              </li>
            ))}
          </ul>
        </DetailsSection>
      ) : null}
    </>
  );
  return framed ? (
    <section className="grid gap-5 rounded-lg border bg-card p-4">
      {sections}
    </section>
  ) : (
    <DetailsPanel title={m.planCoverage()}>{sections}</DetailsPanel>
  );
}

/** What a plan names, counted for its summary line. */
export const planSummary = (content: ContentDocument) =>
  m.planNamedCount({ count: planTargets(content).length });

export const PLAN_COVERAGE = { Coverage: PlanCoverage, summary: planSummary };
