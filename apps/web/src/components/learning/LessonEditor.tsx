import type {
  LessonBlock,
  LessonCompletion,
  QuizBlock,
} from "@faridalms/domain/learning";

import { emptyContent } from "@faridalms/domain/content-conversion";
import {
  LESSON_COMPLETIONS,
  MAX_LESSON_BLOCKS,
  MAX_QUIZ_OPTIONS,
} from "@faridalms/domain/learning";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ListChecks,
  MessageSquareText,
  Plus,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { lessonEditorQuery } from "~/queries/learning";

import { ContentEditor } from "~/components/content/ContentEditor";
import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import { FormField, SelectField, TextField } from "~/components/system/field";
import { FormSection, RecordForm } from "~/components/system/RecordForm";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import * as m from "~/i18n/messages";
import { saveLesson } from "~/server/learning";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

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

const BLOCK_LABEL: Record<LessonBlock["type"], () => string> = {
  content: m.lrnBlockText,
  quiz: m.lrnBlockQuestion,
  reflection: m.lrnBlockReflection,
  media: m.lrnBlockMedia,
};

const newOption = () => ({ id: crypto.randomUUID(), text: "" });

function blockIssue(block: LessonBlock): string | null {
  if (block.type === "quiz") {
    if (!block.question.trim()) return m.lrnQuestionNeeded();
    if (block.options.filter((option) => option.text.trim()).length < 2)
      return m.lrnOptionsNeeded();
    if (block.correctOptionIds.length === 0) return m.lrnCorrectNeeded();
  }
  if (block.type === "reflection" && !block.prompt.trim())
    return m.lrnPromptNeeded();
  return null;
}

function QuizFields({
  block,
  onChange,
}: {
  block: QuizBlock;
  onChange: (next: QuizBlock) => void;
}) {
  const setOption = (index: number, text: string) =>
    onChange({
      ...block,
      options: block.options.map((option, at) =>
        at === index ? { ...option, text } : option,
      ),
    });
  const toggle = (optionId: string, correct: boolean) =>
    onChange({
      ...block,
      correctOptionIds: correct
        ? [...block.correctOptionIds, optionId]
        : block.correctOptionIds.filter((item) => item !== optionId),
    });
  return (
    <div className="grid gap-4">
      <FormField id={`quiz-${block.id}-question`} label={m.lrnQuestion()}>
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={2}
            maxLength={1000}
            value={block.question}
            onChange={(event) =>
              onChange({ ...block, question: event.target.value })
            }
          />
        )}
      </FormField>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm leading-5 font-medium">
          {m.lrnOptions()}
        </legend>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.lrnOptionsHint()}
        </p>
        {block.options.map((option, index) => (
          <div key={option.id} className="flex items-center gap-2">
            <Checkbox
              aria-label={m.lrnCorrectFor({ number: formatNumber(index + 1) })}
              checked={block.correctOptionIds.includes(option.id)}
              onCheckedChange={(checked) => toggle(option.id, checked)}
            />
            <Input
              aria-label={m.lrnOptionNumber({
                number: formatNumber(index + 1),
              })}
              dir="auto"
              maxLength={300}
              className="min-w-0 flex-1 max-md:h-10"
              value={option.text}
              onChange={(event) => setOption(index, event.target.value)}
            />
            {block.options.length > 2 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="max-md:size-10"
                aria-label={m.lrnRemoveOption()}
                onClick={() =>
                  onChange({
                    ...block,
                    options: block.options.filter(
                      (item) => item.id !== option.id,
                    ),
                    correctOptionIds: block.correctOptionIds.filter(
                      (item) => item !== option.id,
                    ),
                  })
                }
              >
                <X aria-hidden />
              </Button>
            ) : null}
          </div>
        ))}
        {block.options.length < MAX_QUIZ_OPTIONS ? (
          <div>
            <Button
              type="button"
              variant="ghost"
              className="max-md:h-10"
              onClick={() =>
                onChange({ ...block, options: [...block.options, newOption()] })
              }
            >
              <Plus aria-hidden />
              {m.lrnAddOption()}
            </Button>
          </div>
        ) : null}
      </fieldset>
      <FormField
        id={`quiz-${block.id}-explanation`}
        label={m.lrnExplanation()}
        hint={m.lrnExplanationHint()}
        optional
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={2}
            maxLength={1000}
            value={block.explanation}
            onChange={(event) =>
              onChange({ ...block, explanation: event.target.value })
            }
          />
        )}
      </FormField>
    </div>
  );
}

function BlockCard({
  block,
  index,
  count,
  shown,
  onChange,
  onMove,
  onRemove,
}: {
  block: LessonBlock;
  index: number;
  count: number;
  shown: boolean;
  onChange: (next: LessonBlock) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const media = useDocumentMedia();
  const issue = shown ? blockIssue(block) : null;
  return (
    <div className="grid min-w-0 gap-4 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm leading-5 font-semibold">
          {m.lrnBlockHeading({
            number: formatNumber(index + 1),
            kind: BLOCK_LABEL[block.type](),
          })}
        </h3>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="max-md:size-10"
            aria-label={m.lrnMoveUp()}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="max-md:size-10"
            aria-label={m.lrnMoveDown()}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="max-md:size-10"
            aria-label={m.lrnRemoveBlock()}
            onClick={onRemove}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      </div>
      {block.type === "content" ? (
        <FormField id={`block-${block.id}`} label={m.lrnBlockText()}>
          {(control) => (
            <div className="min-w-0">
              <ContentEditor
                id={control.id}
                label={m.lrnBlockText()}
                value={block.content}
                onChange={(content) => onChange({ ...block, content })}
                media={media}
              />
            </div>
          )}
        </FormField>
      ) : block.type === "quiz" ? (
        <QuizFields block={block} onChange={onChange} />
      ) : block.type === "reflection" ? (
        <FormField id={`block-${block.id}`} label={m.lrnPrompt()}>
          {(control) => (
            <Textarea
              {...control}
              dir="auto"
              rows={2}
              maxLength={1000}
              value={block.prompt}
              onChange={(event) =>
                onChange({ ...block, prompt: event.target.value })
              }
            />
          )}
        </FormField>
      ) : (
        <p className="text-sm leading-5 text-muted-foreground">
          <bdi>{block.name}</bdi>
        </p>
      )}
      {issue ? (
        <p role="alert" className="text-[13px] leading-[18px] text-destructive">
          {issue}
        </p>
      ) : null}
    </div>
  );
}

/** A lesson's title, what finishes it, and its blocks of text, questions and prompts. */
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
  const [initial] = useState<Draft>(() => ({
    title: existing?.title ?? "",
    completion: existing?.completion ?? "view",
    passScore: existing?.passScore ? String(existing.passScore) : "",
    blocks: existing?.content.blocks ?? [
      { id: crypto.randomUUID(), type: "content", content: emptyContent() },
    ],
  }));
  const [draft, setDraft] = useState(initial);
  const [shown, setShown] = useState(false);
  const leaving = useRef(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const setBlock = (index: number, next: LessonBlock) =>
    set(
      "blocks",
      draft.blocks.map((block, at) => (at === index ? next : block)),
    );
  const moveBlock = (index: number, by: -1 | 1) => {
    const next = [...draft.blocks];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(index + by, 0, moved);
    set("blocks", next);
  };
  const add = (type: "content" | "quiz" | "reflection") => {
    const id = crypto.randomUUID();
    const block: LessonBlock =
      type === "content"
        ? { id, type, content: emptyContent() }
        : type === "quiz"
          ? {
              id,
              type,
              question: "",
              options: [newOption(), newOption()],
              correctOptionIds: [],
              explanation: "",
            }
          : { id, type, prompt: "" };
    set("blocks", [...draft.blocks, block]);
  };
  const passScore = Number(draft.passScore);
  const issues = {
    title: draft.title.trim() ? null : m.lrnTitleNeeded(),
    blocks: draft.blocks.length === 0 ? m.lrnBlocksNeeded() : null,
    rule:
      (draft.completion === "quiz" || draft.completion === "score") &&
      !draft.blocks.some((block) => block.type === "quiz")
        ? m.lrnRuleNeedsQuiz()
        : draft.completion === "reflection" &&
            !draft.blocks.some((block) => block.type === "reflection")
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
    mutationFn: () =>
      saveLesson({
        data: {
          id: existing?.id ?? "",
          moduleId,
          expectedVersion: existing?.version ?? 0,
          title: draft.title.trim(),
          completion: draft.completion,
          passScore: draft.completion === "score" ? passScore : null,
          content: {
            version: 1,
            blocks: draft.blocks.map((block) =>
              block.type === "quiz"
                ? {
                    ...block,
                    options: block.options.filter((option) =>
                      option.text.trim(),
                    ),
                  }
                : block,
            ),
          },
        },
      }),
  });
  return (
    <RecordForm
      title={existing ? m.lrnEditLesson() : m.lrnNewLesson()}
      onSubmit={async () => {
        setShown(true);
        if (Object.values(issues).some(Boolean)) return;
        try {
          await save.mutateAsync();
        } catch {
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ["learning"] });
        leaving.current = true;
        toast.success(m.lrnLessonSaved());
        onClose();
      }}
      onCancel={onClose}
      isDirty={() =>
        !leaving.current && JSON.stringify(draft) !== JSON.stringify(initial)
      }
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
    >
      <FormSection title={m.lrnSectionLesson()}>
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
      <FormSection title={m.lrnSectionBlocks()} description={m.lrnBlocksHint()}>
        <div className="grid gap-4">
          {draft.blocks.map((block, index) => (
            <BlockCard
              key={block.id}
              block={block}
              index={index}
              count={draft.blocks.length}
              shown={shown}
              onChange={(next) => setBlock(index, next)}
              onMove={(by) => moveBlock(index, by)}
              onRemove={() =>
                set(
                  "blocks",
                  draft.blocks.filter((_, at) => at !== index),
                )
              }
            />
          ))}
          {shown && issues.blocks ? (
            <p
              role="alert"
              className="text-[13px] leading-[18px] text-destructive"
            >
              {issues.blocks}
            </p>
          ) : null}
          {draft.blocks.length < MAX_LESSON_BLOCKS ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="max-md:h-10"
                onClick={() => add("content")}
              >
                <Type aria-hidden />
                {m.lrnAddText()}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="max-md:h-10"
                onClick={() => add("quiz")}
              >
                <ListChecks aria-hidden />
                {m.lrnAddQuestion()}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="max-md:h-10"
                onClick={() => add("reflection")}
              >
                <MessageSquareText aria-hidden />
                {m.lrnAddReflection()}
              </Button>
            </div>
          ) : null}
        </div>
      </FormSection>
    </RecordForm>
  );
}
