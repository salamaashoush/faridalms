import type {
  CheckBlock,
  LessonBlock,
  LessonCompletion,
} from "@faridalms/domain/learning";
import type { LucideIcon } from "lucide-react";
import type { ReactElement } from "react";

import { emptyContent } from "@faridalms/domain/content-conversion";
import {
  isAuto,
  isCheck,
  LESSON_COMPLETIONS,
  MAX_LESSON_BLOCKS,
} from "@faridalms/domain/learning";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  Brackets,
  Copy,
  Hash,
  ListChecks,
  MessageSquareText,
  Plus,
  TextCursorInput,
  ToggleLeft,
  Trash2,
  Type,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { lessonEditorQuery } from "~/queries/learning";

import { ContentEditor } from "~/components/content/ContentEditor";
import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import { FormField, SelectField, TextField } from "~/components/system/field";
import { FormSection, RecordForm } from "~/components/system/RecordForm";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import * as m from "~/i18n/messages";
import { moduleRecordQuery } from "~/queries/learning";
import { saveLesson } from "~/server/learning";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { blockIssue, CheckFields, MediaFields } from "./BlockFields";
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
  media: m.lrnBlockMedia,
  gate: m.lrnBlockGate,
  choice: m.lrnBlockChoice,
  text: m.lrnBlockTyped,
  gaps: m.lrnBlockGaps,
  number: m.lrnBlockNumber,
  written: m.lrnBlockWritten,
};

type Kind =
  | "content"
  | "gate"
  | "choice"
  | "truefalse"
  | "text"
  | "gaps"
  | "number"
  | "written";

const KINDS: {
  group: () => string;
  items: {
    kind: Kind;
    icon: LucideIcon;
    label: () => string;
    hint: () => string;
  }[];
}[] = [
  {
    group: m.lrnGroupContent,
    items: [
      {
        kind: "content",
        icon: Type,
        label: m.lrnBlockText,
        hint: m.lrnKindTextHint,
      },
      {
        kind: "gate",
        icon: ArrowDownToLine,
        label: m.lrnBlockGate,
        hint: m.lrnKindGateHint,
      },
    ],
  },
  {
    group: m.lrnGroupQuestions,
    items: [
      {
        kind: "choice",
        icon: ListChecks,
        label: m.lrnBlockChoice,
        hint: m.lrnKindChoiceHint,
      },
      {
        kind: "truefalse",
        icon: ToggleLeft,
        label: m.lrnKindTrueFalse,
        hint: m.lrnKindTrueFalseHint,
      },
      {
        kind: "text",
        icon: TextCursorInput,
        label: m.lrnBlockTyped,
        hint: m.lrnKindTypedHint,
      },
      {
        kind: "gaps",
        icon: Brackets,
        label: m.lrnBlockGaps,
        hint: m.lrnKindGapsHint,
      },
      {
        kind: "number",
        icon: Hash,
        label: m.lrnBlockNumber,
        hint: m.lrnKindNumberHint,
      },
      {
        kind: "written",
        icon: MessageSquareText,
        label: m.lrnBlockWritten,
        hint: m.lrnKindWrittenHint,
      },
    ],
  },
];

const option = (text = "") => ({ id: crypto.randomUUID(), text, feedback: "" });

function newBlock(kind: Kind): LessonBlock {
  const id = crypto.randomUUID();
  const check = {
    id,
    prompt: "",
    points: 1,
    hint: "",
    explanation: "",
    tries: null,
  };
  const matching = {
    caseSensitive: false,
    closeEnough: false,
    tehMarbuta: true,
  };
  switch (kind) {
    case "content":
      return { id, type: "content", content: emptyContent() };
    case "gate":
      return { id, type: "gate", requires: "above" };
    case "choice":
      return {
        ...check,
        type: "choice",
        options: [option(), option()],
        correctOptionIds: [],
        multiple: false,
        shuffle: true,
      };
    case "truefalse": {
      const right = option(m.lrnTrue());
      return {
        ...check,
        type: "choice",
        options: [right, option(m.lrnFalse())],
        correctOptionIds: [right.id],
        multiple: false,
        shuffle: false,
      };
    }
    case "text":
      return { ...check, ...matching, type: "text", answers: [""] };
    case "gaps":
      return {
        ...check,
        ...matching,
        type: "gaps",
        prompt: m.lrnGapsPrompt(),
        segments: [],
      };
    case "number":
      return {
        ...check,
        type: "number",
        mode: "exact",
        value: 0,
        tolerance: 0,
        percent: false,
        min: 0,
        max: 0,
      };
  }
  return { ...check, points: 0, type: "written", wordLimit: null };
}

/** A copy with new ids throughout, so answers to the original never match it. */
function duplicate(block: LessonBlock): LessonBlock {
  const id = crypto.randomUUID();
  if (block.type === "choice") {
    const ids = new Map(
      block.options.map((item) => [item.id, crypto.randomUUID()]),
    );
    return {
      ...block,
      id,
      options: block.options.map((item) => ({
        ...item,
        id: ids.get(item.id) ?? item.id,
      })),
      correctOptionIds: block.correctOptionIds.map(
        (item) => ids.get(item) ?? item,
      ),
    };
  }
  if (block.type === "gaps")
    return {
      ...block,
      id,
      segments: block.segments.map((segment) =>
        segment.type === "gap"
          ? { ...segment, id: crypto.randomUUID() }
          : segment,
      ),
    };
  return { ...structuredClone(block), id };
}

/** Empty options and answers are dropped on save rather than refused. */
function tidy(block: LessonBlock): LessonBlock {
  if (block.type === "choice") {
    const options = block.options.filter((item) => item.text.trim());
    return {
      ...block,
      options,
      correctOptionIds: block.correctOptionIds.filter((item) =>
        options.some((kept) => kept.id === item),
      ),
    };
  }
  if (block.type === "text")
    return {
      ...block,
      answers: block.answers.map((item) => item.trim()).filter(Boolean),
    };
  return block;
}

function Inserter({
  trigger,
  onPick,
}: {
  trigger: ReactElement;
  onPick: (kind: Kind) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="start" className="w-80">
        {KINDS.map((group) => (
          <DropdownMenuGroup key={group.group()}>
            <DropdownMenuLabel>{group.group()}</DropdownMenuLabel>
            {group.items.map((item) => (
              <DropdownMenuItem
                key={item.kind}
                className="items-start gap-3 py-2"
                onClick={() => onPick(item.kind)}
              >
                <item.icon aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span className="grid gap-0.5">
                  <span className="text-sm leading-5 font-medium">
                    {item.label()}
                  </span>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {item.hint()}
                  </span>
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function BlockCard({
  block,
  index,
  count,
  shown,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
}: {
  block: LessonBlock;
  index: number;
  count: number;
  shown: boolean;
  onChange: (next: LessonBlock) => void;
  onMove: (by: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const media = useDocumentMedia();
  const issue = shown ? blockIssue(block) : null;
  const tools: {
    label: string;
    icon: LucideIcon;
    onClick: () => void;
    disabled?: boolean;
  }[] = [
    {
      label: m.lrnMoveUp(),
      icon: ArrowUp,
      onClick: () => onMove(-1),
      disabled: index === 0,
    },
    {
      label: m.lrnMoveDown(),
      icon: ArrowDown,
      onClick: () => onMove(1),
      disabled: index === count - 1,
    },
    {
      label: m.lrnDuplicateBlock(),
      icon: Copy,
      onClick: onDuplicate,
      disabled: count >= MAX_LESSON_BLOCKS,
    },
    { label: m.lrnRemoveBlock(), icon: Trash2, onClick: onRemove },
  ];
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
          {tools.map((tool) => (
            <Button
              key={tool.label}
              type="button"
              variant="ghost"
              size="icon-sm"
              className="max-md:size-10"
              aria-label={tool.label}
              title={tool.label}
              disabled={tool.disabled}
              onClick={tool.onClick}
            >
              <tool.icon aria-hidden />
            </Button>
          ))}
        </div>
      </div>
      {block.type === "content" ? (
        <FormField
          id={`block-${block.id}`}
          label={m.lrnBlockText()}
          labelHidden
        >
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
      ) : block.type === "gate" ? (
        <p className="text-sm leading-5 text-muted-foreground">
          {m.lrnGateHint()}
        </p>
      ) : block.type === "media" ? (
        <MediaFields block={block} onChange={onChange} />
      ) : (
        <CheckFields
          block={block}
          onChange={(next: CheckBlock) => onChange(next)}
        />
      )}
      {issue ? (
        <p role="alert" className="text-[13px] leading-[18px] text-destructive">
          {issue}
        </p>
      ) : null}
    </div>
  );
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
  const insert = (at: number, block: LessonBlock) =>
    setBlocks((blocks) => [...blocks.slice(0, at), block, ...blocks.slice(at)]);
  const moveBlock = (index: number, by: -1 | 1) =>
    setBlocks((blocks) => {
      const next = [...blocks];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(index + by, 0, moved);
      return next;
    });
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
  const addAt = (at: number) => (kind: Kind) => insert(at, newBlock(kind));
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
        <div className="grid gap-2">
          {draft.blocks.map((block, index) => (
            <div key={block.id} className="grid gap-2">
              <BlockCard
                block={block}
                index={index}
                count={draft.blocks.length}
                shown={shown}
                onChange={(next) =>
                  setBlocks((blocks) =>
                    blocks.map((item) => (item.id === block.id ? next : item)),
                  )
                }
                onMove={(by) => moveBlock(index, by)}
                onDuplicate={() => insert(index + 1, duplicate(block))}
                onRemove={() =>
                  setBlocks((blocks) =>
                    blocks.filter((item) => item.id !== block.id),
                  )
                }
              />
              {index < draft.blocks.length - 1 &&
              draft.blocks.length < MAX_LESSON_BLOCKS ? (
                <div className="flex justify-center">
                  <Inserter
                    onPick={addAt(index + 1)}
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground max-md:size-10"
                        aria-label={m.lrnAddAfter({
                          number: formatNumber(index + 1),
                        })}
                        title={m.lrnAddPart()}
                      >
                        <Plus aria-hidden />
                      </Button>
                    }
                  />
                </div>
              ) : null}
            </div>
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
            <div className="pt-2">
              <Inserter
                onPick={addAt(draft.blocks.length)}
                trigger={
                  <Button
                    type="button"
                    variant="outline"
                    className="max-md:h-10"
                  >
                    <Plus aria-hidden />
                    {m.lrnAddPart()}
                  </Button>
                }
              />
            </div>
          ) : null}
        </div>
      </FormSection>
    </RecordForm>
  );
}
