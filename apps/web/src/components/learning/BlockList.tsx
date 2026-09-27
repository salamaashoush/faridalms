import type { CheckBlock, LessonBlock } from "@faridalms/domain/learning";
import type { LucideIcon } from "lucide-react";
import type { ReactElement } from "react";

import { emptyContent } from "@faridalms/domain/content-conversion";
import { MAX_LESSON_BLOCKS } from "@faridalms/domain/learning";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUp,
  Brackets,
  Copy,
  Hash,
  ListChecks,
  ListOrdered,
  MessageSquareText,
  Plus,
  Shapes,
  TextCursorInput,
  ToggleLeft,
  Trash2,
  Type,
} from "lucide-react";

import { ContentEditor } from "~/components/content/ContentEditor";
import { useDocumentMedia } from "~/components/coursework/useDocumentMedia";
import { FormField } from "~/components/system/field";
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
import { formatNumber } from "~/utils/datetime";

import { blockIssue, CheckFields, MediaFields } from "./BlockFields";

const BLOCK_LABEL: Record<LessonBlock["type"], () => string> = {
  content: m.lrnBlockText,
  media: m.lrnBlockMedia,
  gate: m.lrnBlockGate,
  choice: m.lrnBlockChoice,
  text: m.lrnBlockTyped,
  gaps: m.lrnBlockGaps,
  number: m.lrnBlockNumber,
  matching: m.lrnBlockMatching,
  ordering: m.lrnBlockOrdering,
  sorting: m.lrnBlockSorting,
  written: m.lrnBlockWritten,
};

export type Kind =
  | "content"
  | "gate"
  | "choice"
  | "truefalse"
  | "text"
  | "gaps"
  | "number"
  | "matching"
  | "ordering"
  | "sorting"
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
        kind: "matching",
        icon: ArrowLeftRight,
        label: m.lrnBlockMatching,
        hint: m.lrnKindMatchingHint,
      },
      {
        kind: "ordering",
        icon: ListOrdered,
        label: m.lrnBlockOrdering,
        hint: m.lrnKindOrderingHint,
      },
      {
        kind: "sorting",
        icon: Shapes,
        label: m.lrnBlockSorting,
        hint: m.lrnKindSortingHint,
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
const row = <T extends object>(fields: T) => ({
  id: crypto.randomUUID(),
  ...fields,
});

export function newBlock(kind: Kind): LessonBlock {
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
    case "matching":
      return {
        ...check,
        type: "matching",
        pairs: [
          row({ prompt: "", answer: "" }),
          row({ prompt: "", answer: "" }),
        ],
        distractors: [],
      };
    case "ordering":
      return {
        ...check,
        type: "ordering",
        items: [row({ text: "" }), row({ text: "" }), row({ text: "" })],
        scoring: "neighbours",
      };
    case "sorting": {
      const groups = [row({ name: "" }), row({ name: "" })];
      return {
        ...check,
        type: "sorting",
        groups,
        items: groups.map((group) => row({ text: "", groupId: group.id })),
      };
    }
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
  if (block.type === "matching")
    return {
      ...block,
      id,
      pairs: block.pairs.map((pair) => ({ ...pair, id: crypto.randomUUID() })),
      distractors: block.distractors.map((other) => ({
        ...other,
        id: crypto.randomUUID(),
      })),
    };
  if (block.type === "ordering")
    return {
      ...block,
      id,
      items: block.items.map((item) => ({ ...item, id: crypto.randomUUID() })),
    };
  if (block.type === "sorting") {
    const ids = new Map(
      block.groups.map((group) => [group.id, crypto.randomUUID()]),
    );
    return {
      ...block,
      id,
      groups: block.groups.map((group) => ({
        ...group,
        id: ids.get(group.id) ?? group.id,
      })),
      items: block.items.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
        groupId: ids.get(item.groupId) ?? item.groupId,
      })),
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
export function tidy(block: LessonBlock): LessonBlock {
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
  if (block.type === "matching")
    return {
      ...block,
      pairs: block.pairs.filter(
        (pair) => pair.prompt.trim() || pair.answer.trim(),
      ),
      distractors: block.distractors.filter((other) => other.text.trim()),
    };
  if (block.type === "ordering")
    return { ...block, items: block.items.filter((item) => item.text.trim()) };
  if (block.type === "sorting")
    return { ...block, items: block.items.filter((item) => item.text.trim()) };
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
  exclude,
}: {
  trigger: ReactElement;
  onPick: (kind: Kind) => void;
  exclude: readonly Kind[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="start" className="w-80">
        {KINDS.map((group) => (
          <DropdownMenuGroup key={group.group()}>
            <DropdownMenuLabel>{group.group()}</DropdownMenuLabel>
            {group.items
              .filter((item) => !exclude.includes(item.kind))
              .map((item) => (
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

const NO_KINDS: readonly Kind[] = [];

/**
 * A lesson's or a quiz's parts, each with its editor, a menu to add a part at
 * the end or between any two, and tools to move, copy and remove.
 */
export function BlockList({
  blocks,
  onChange,
  shown,
  missing,
  exclude = NO_KINDS,
}: {
  blocks: LessonBlock[];
  onChange: (update: (blocks: LessonBlock[]) => LessonBlock[]) => void;
  shown: boolean;
  missing: string | null;
  exclude?: readonly Kind[];
}) {
  const insert = (at: number, block: LessonBlock) =>
    onChange((current) => [
      ...current.slice(0, at),
      block,
      ...current.slice(at),
    ]);
  const moveBlock = (index: number, by: -1 | 1) =>
    onChange((current) => {
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (moved) next.splice(index + by, 0, moved);
      return next;
    });
  const addAt = (at: number) => (kind: Kind) => insert(at, newBlock(kind));
  return (
    <div className="grid gap-2">
      {blocks.map((block, index) => (
        <div key={block.id} className="grid gap-2">
          <BlockCard
            block={block}
            index={index}
            count={blocks.length}
            shown={shown}
            onChange={(next) =>
              onChange((current) =>
                current.map((item) => (item.id === block.id ? next : item)),
              )
            }
            onMove={(by) => moveBlock(index, by)}
            onDuplicate={() => insert(index + 1, duplicate(block))}
            onRemove={() =>
              onChange((current) =>
                current.filter((item) => item.id !== block.id),
              )
            }
          />
          {index < blocks.length - 1 && blocks.length < MAX_LESSON_BLOCKS ? (
            <div className="flex justify-center">
              <Inserter
                exclude={exclude}
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
      {missing ? (
        <p role="alert" className="text-[13px] leading-[18px] text-destructive">
          {missing}
        </p>
      ) : null}
      {blocks.length < MAX_LESSON_BLOCKS ? (
        <div className="pt-2">
          <Inserter
            exclude={exclude}
            onPick={addAt(blocks.length)}
            trigger={
              <Button type="button" variant="outline" className="max-md:h-10">
                <Plus aria-hidden />
                {m.lrnAddPart()}
              </Button>
            }
          />
        </div>
      ) : null}
    </div>
  );
}
