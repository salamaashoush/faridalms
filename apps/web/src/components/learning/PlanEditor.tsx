import type { ContentDocument } from "@faridalms/domain/content";

import { emptyContent } from "@faridalms/domain/content-conversion";
import { UnsavedChangesGuard } from "@faridalms/ui/system/unsaved-changes-guard";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import type {
  BuiltInGroup,
  StartingPiece,
} from "~/components/content/Templates";

import { useCollaboration } from "~/components/content/collaboration";
import { ContentEditor } from "~/components/content/ContentEditor";
import { sayIn } from "~/components/content/starters";
import { useStartFrom } from "~/components/content/Templates";
import { DocumentPage } from "~/components/system/DocumentPage";
import { useAutosave } from "~/hooks/useAutosave";
import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { moduleRecordQuery, planQuery } from "~/queries/learning";
import { savePlan } from "~/server/learning";

import { PLANNERS, plannerContent } from "./planners";
import { planCoverage } from "./slots";

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
  /** A template the plan starts from, while it is still unwritten. */
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
  const coverage = useSlot(planCoverage)[0];

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
        summary={coverage ? [coverage.summary(content)] : undefined}
        details={{ open: detailsOpen, onOpenChange: setDetailsOpen }}
        aside={
          coverage ? (
            <coverage.Coverage content={content} covered={plan.covered} />
          ) : undefined
        }
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
