import type { LessonBlock, LessonCompletion } from "@faridalms/domain/learning";

import {
  isAuto,
  isCheck,
  LESSON_COMPLETIONS,
} from "@faridalms/domain/learning";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { lessonEditorQuery } from "~/queries/learning";

import { SelectField, TextField } from "~/components/system/field";
import { FormSection, RecordForm } from "~/components/system/RecordForm";
import * as m from "~/i18n/messages";
import { moduleRecordQuery } from "~/queries/learning";
import { saveLesson } from "~/server/learning";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { blockIssue } from "./BlockFields";
import { BlockList, newBlock, tidy } from "./BlockList";
import { COMPLETION_LABEL } from "./format";

type Existing = Awaited<
  ReturnType<NonNullable<ReturnType<typeof lessonEditorQuery>["queryFn"]>>
>;

interface Draft {
  title: string;
  completion: LessonCompletion;
  passScore: string;
  blocks: LessonBlock[];
}

/** A lesson's title, what finishes it, and its blocks of text, media and questions. */
export function LessonEditor({
  existing,
  moduleId,
  onClose,
}: {
  existing: Existing | null;
  moduleId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const module = useSuspenseQuery(moduleRecordQuery(moduleId)).data;
  const open = module.state === "published";
  const [initial] = useState<Draft>(() => ({
    title: existing?.title ?? "",
    completion: existing?.completion ?? "view",
    passScore: existing?.passScore ? String(existing.passScore) : "",
    blocks: existing?.content.blocks ?? [newBlock("content")],
  }));
  const [draft, setDraft] = useState(initial);
  const [shown, setShown] = useState(false);
  const leaving = useRef(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const setBlocks = (update: (blocks: LessonBlock[]) => LessonBlock[]) =>
    setDraft((current) => ({ ...current, blocks: update(current.blocks) }));
  const passScore = Number(draft.passScore);
  const issues = {
    title: draft.title.trim() ? null : m.lrnTitleNeeded(),
    blocks: draft.blocks.length === 0 ? m.lrnBlocksNeeded() : null,
    rule:
      (draft.completion === "quiz" || draft.completion === "score") &&
      !draft.blocks.some(isAuto)
        ? m.lrnRuleNeedsQuiz()
        : draft.completion === "reflection" &&
            !draft.blocks.some((block) => block.type === "written")
          ? m.lrnRuleNeedsReflection()
          : null,
    passScore:
      draft.completion === "score" &&
      !(Number.isInteger(passScore) && passScore >= 1 && passScore <= 100)
        ? m.lrnPassScoreNeeded()
        : null,
    each: draft.blocks.some((block) => blockIssue(block)) ? "blocks" : null,
  };
  const save = useMutation({
    mutationFn: (publish: boolean) =>
      saveLesson({
        data: {
          id: existing?.id ?? "",
          moduleId,
          expectedVersion: existing?.version ?? 0,
          title: draft.title.trim(),
          completion: draft.completion,
          passScore: draft.completion === "score" ? passScore : null,
          content: { version: 2, blocks: draft.blocks.map(tidy) },
          publish,
        },
      }),
  });
  const questions = draft.blocks.filter(isCheck).length;
  return (
    <RecordForm
      title={existing ? m.lrnEditLesson() : m.lrnNewLesson()}
      submitLabel={open ? m.lrnSaveAndShow() : m.commonSave()}
      secondary={
        open ? { label: m.lrnSaveHidden(), intent: "hidden" } : undefined
      }
      onSubmit={async (intent) => {
        setShown(true);
        if (Object.values(issues).some(Boolean)) return;
        let result;
        try {
          result = await save.mutateAsync(open && intent !== "hidden");
        } catch {
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ["learning"] });
        leaving.current = true;
        toast.success(
          result.published
            ? m.lrnLessonShown()
            : open
              ? m.lrnLessonSavedHidden()
              : m.lrnLessonSaved(),
        );
        onClose();
      }}
      onCancel={onClose}
      isDirty={() =>
        !leaving.current && JSON.stringify(draft) !== JSON.stringify(initial)
      }
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
    >
      <FormSection
        title={m.lrnSectionLesson()}
        description={
          open && existing?.published?.changed
            ? m.lrnChangesWaiting()
            : undefined
        }
      >
        <TextField
          id="lesson-title"
          label={m.lrnLessonTitle()}
          width="name"
          dir="auto"
          maxLength={200}
          autoComplete="off"
          value={draft.title}
          onChange={(event) => set("title", event.target.value)}
          errors={shown && issues.title ? [issues.title] : undefined}
        />
        <SelectField
          id="lesson-completion"
          label={m.lrnCompletion()}
          hint={m.lrnCompletionHint()}
          width="name"
          value={draft.completion}
          options={LESSON_COMPLETIONS.map((completion) => ({
            value: completion,
            label: COMPLETION_LABEL[completion](),
          }))}
          onChange={(completion) => set("completion", completion)}
          errors={shown && issues.rule ? [issues.rule] : undefined}
        />
        {draft.completion === "score" ? (
          <TextField
            id="lesson-pass"
            label={m.lrnPassScore()}
            hint={m.lrnPassScoreHint()}
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            width="date"
            value={draft.passScore}
            onChange={(event) => set("passScore", event.target.value)}
            errors={shown && issues.passScore ? [issues.passScore] : undefined}
          />
        ) : null}
      </FormSection>
      <FormSection
        title={m.lrnSectionBlocks()}
        description={
          questions > 0
            ? m.lrnBlocksSummary({
                parts: formatNumber(draft.blocks.length),
                questions: formatNumber(questions),
              })
            : m.lrnBlocksHint()
        }
      >
        <BlockList
          blocks={draft.blocks}
          onChange={setBlocks}
          shown={shown}
          missing={shown ? issues.blocks : null}
        />
      </FormSection>
    </RecordForm>
  );
}
