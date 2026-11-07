import type { ContentDocument } from "@faridalms/domain/content";

import { emptyContent } from "@faridalms/domain/content-conversion";
import { planTargets } from "@faridalms/domain/standards";
import { cn } from "@faridalms/ui/cn";
import { UnsavedChangesGuard } from "@faridalms/ui/system/unsaved-changes-guard";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useCallback, useState } from "react";

import type {
  BuiltInGroup,
  StartingPiece,
} from "~/components/content/Templates";

import { useCollaboration } from "~/components/content/collaboration";
import { ContentEditor } from "~/components/content/ContentEditor";
import { useStartFrom } from "~/components/content/Templates";
import {
  DetailsPanel,
  DetailsSection,
  DocumentPage,
} from "~/components/system/DocumentPage";
import { useAutosave } from "~/hooks/useAutosave";
import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { moduleRecordQuery, planQuery } from "~/queries/learning";
import { savePlan } from "~/server/learning";
import { describeStandards } from "~/server/standards";

import { PLANNERS, plannerContent } from "./planners";
import { sayIn } from "./starters";

type Plan = Awaited<
  ReturnType<NonNullable<ReturnType<typeof planQuery>["queryFn"]>>
>;
type Covered = Plan["covered"][number];

/** How the lessons cover a standard: the questions assessing it, and the lessons setting it out. */
function coverOf(row: Pick<Covered, "questions" | "lessons">) {
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

export interface PlanCoverageProps {
  content: ContentDocument;
  covered: readonly Covered[];
  /** Ruled off as a section of a page, rather than inside the details panel. */
  framed?: boolean;
}

/**
 * A plan's standards read against its module's lessons: each standard the
 * plan names with the questions that assess it and the lessons that set it
 * out, the ones no question assesses yet, and the standards the lessons
 * cover that the plan leaves out.
 */
export function PlanCoverage({
  content,
  covered,
  framed = false,
}: PlanCoverageProps) {
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
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {m.planNoStandards()}
          </p>
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

/** The built-in planners, in the language the teacher works in. */
function plannerGroup(): BuiltInGroup {
  const say = sayIn(getLocale() === "ar" ? "ar" : "en");
  return {
    label: m.plannerGroup(),
    items: PLANNERS.map((planner) => ({
      key: planner.key,
      title: planner.title(),
      hint: planner.hint(),
      content: () => plannerContent(planner, say),
    })),
  };
}

export interface PlanEditorProps {
  moduleId: string;
  /** A library piece the plan starts from, while it is still unwritten. */
  template?: StartingPiece;
  onClose: () => void;
}

/**
 * A module's unit plan, written in the planner its school follows. Its
 * teachers write it together once it exists; the first edits start it.
 */
export function PlanEditor({ moduleId, template, onClose }: PlanEditorProps) {
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
  const apply = useCallback((to: ContentDocument) => {
    setContent(to);
    setReplace((current) => ({ to, at: (current?.at ?? 0) + 1 }));
  }, []);
  useStartFrom(
    plan.content ? undefined : template,
    useCallback((piece: StartingPiece) => apply(piece.content), [apply]),
  );
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
          builtIn: plannerGroup(),
        }}
        comments={
          plan.content
            ? { hostType: "module_plan", hostId: moduleId, editor: "plan-body" }
            : undefined
        }
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
        aside={<PlanCoverage content={content} covered={plan.covered} />}
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
