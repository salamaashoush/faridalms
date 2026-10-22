import type { ContentDocument } from "@faridalms/domain/content";

import { emptyContent } from "@faridalms/domain/content-conversion";
import { planTargets } from "@faridalms/domain/standards";
import { cn } from "@faridalms/ui/cn";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { UnsavedChangesGuard } from "~/components/app/UnsavedChangesGuard";
import { useCollaboration } from "~/components/content/collaboration";
import { ContentEditor } from "~/components/content/ContentEditor";
import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import {
  DetailsPanel,
  DetailsSection,
  DocumentPage,
} from "~/components/system/DocumentPage";
import { useAutosave } from "~/hooks/useAutosave";
import * as m from "~/i18n/messages";
import { moduleRecordQuery, planQuery } from "~/queries/learning";
import { savePlan } from "~/server/learning";

type Plan = Awaited<
  ReturnType<NonNullable<ReturnType<typeof planQuery>["queryFn"]>>
>;
type Assessed = Plan["assessed"][number];

function Statement({ code, statement }: { code: string; statement: string }) {
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
 * A plan's standards read against its module's questions: each standard the
 * plan names with the questions that assess it, the ones none does yet, and
 * the standards questions assess that the plan leaves out.
 */
export function PlanCoverage({
  content,
  assessed,
  framed = false,
}: {
  content: ContentDocument;
  assessed: readonly Assessed[];
  /** Ruled off as a section of a page, rather than inside the details panel. */
  framed?: boolean;
}) {
  const named = planTargets(content);
  const counted = new Map(assessed.map((row) => [row.id, row.questions]));
  const left = assessed.filter(
    (row) => !named.some((target) => target.id === row.id),
  );
  const list = "grid gap-2";
  const row = "grid gap-0.5";
  const sections = (
    <>
      <DetailsSection title={m.planNamed()}>
        {named.length === 0 ? (
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {m.planNoStandards()}
          </p>
        ) : (
          <ul className={list}>
            {named.map((target) => {
              const questions = counted.get(target.id) ?? 0;
              return (
                <li key={target.id} className={row}>
                  <Statement code={target.code} statement={target.statement} />
                  <span
                    className={cn(
                      "text-[13px] leading-[18px]",
                      questions
                        ? "text-muted-foreground"
                        : "text-warning-foreground dark:text-warning",
                    )}
                  >
                    {questions
                      ? m.planQuestions({ count: questions })
                      : m.planNotAssessed()}
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
                  {m.planQuestions({ count: standard.questions })}
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

/**
 * A module's unit plan, written in the planner its school follows. Its
 * teachers write it together once it exists; the first edits start it.
 */
export function PlanEditor({
  moduleId,
  onClose,
}: {
  moduleId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const module = useSuspenseQuery(moduleRecordQuery(moduleId)).data;
  const plan = useSuspenseQuery(planQuery(moduleId)).data;
  const media = useDocumentMedia({ type: "module", id: moduleId });
  const live = useCollaboration(
    plan.content ? { hostType: "module_plan", hostId: moduleId } : null,
  );
  const shared = live.state === "live";
  const [content, setContent] = useState(() => plan.content ?? emptyContent());
  const [replace, setReplace] = useState<{ to: ContentDocument; at: number }>();
  const [valid, setValid] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // A live plan is stored by its room as it is typed.
  const autosave = useAutosave({
    value: content,
    save: async (value) => {
      if (!valid) throw new Error("content.invalid");
      await savePlan({ data: { moduleId, content: value } });
    },
    enabled: !shared,
  });
  const change = useCallback((value: ContentDocument) => setContent(value), []);
  const apply = (to: ContentDocument) => {
    setContent(to);
    setReplace((current) => ({ to, at: (current?.at ?? 0) + 1 }));
  };
  const written = JSON.stringify(content) !== JSON.stringify(emptyContent());
  const named = planTargets(content).length;

  return (
    <>
      <DocumentPage
        heading={m.planTitle()}
        onBack={async () => {
          if (shared || (await autosave.flush())) {
            await queryClient.invalidateQueries({
              queryKey: ["learning", "plan", moduleId],
            });
            onClose();
          }
        }}
        saveState={shared ? "idle" : autosave.state}
        onRetry={autosave.retry}
        templates={{
          kind: "unit_plan",
          empty: !written,
          content,
          title: module.title,
          onApply: apply,
          planners: true,
        }}
        history={
          plan.content
            ? {
                hostType: "module_plan",
                hostId: moduleId,
                onRestore: apply,
              }
            : undefined
        }
        print={{ title: module.title, content, answers: true }}
        title={
          <div className="grid gap-1">
            <p className="text-[13px] leading-[18px] font-medium text-muted-foreground">
              {m.planTitle()}
            </p>
            <h1
              dir="auto"
              className="text-[30px] leading-[38px] font-semibold tracking-tight"
            >
              {module.title}
            </h1>
          </div>
        }
        summary={[m.planNamedCount({ count: named })]}
        details={{ open: detailsOpen, onOpenChange: setDetailsOpen }}
        aside={<PlanCoverage content={content} assessed={plan.assessed} />}
      >
        <ContentEditor
          id="plan-body"
          label={m.planTitle()}
          variant="document"
          value={content}
          onChange={change}
          onValidityChange={setValid}
          media={media}
          standards
          collaboration={shared ? live.collaboration : undefined}
          pending={live.state === "loading"}
          replace={replace}
        />
      </DocumentPage>
      <UnsavedChangesGuard isDirty={() => autosave.dirty} pending={false} />
    </>
  );
}
