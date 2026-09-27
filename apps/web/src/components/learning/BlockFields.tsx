import type {
  CheckBlock,
  ChoiceBlock,
  GapsBlock,
  LessonBlock,
  MatchingBlock,
  NumberBlock,
  OrderingBlock,
  SortingBlock,
  TextBlock,
  WrittenBlock,
} from "@faridalms/domain/learning";
import type { ReactNode } from "react";

import { parseNumber } from "@faridalms/domain/answers";
import {
  gapsSource,
  MAX_ACCEPTED_ANSWERS,
  MAX_CHOICE_OPTIONS,
  MAX_DISTRACTORS,
  MAX_GAPS,
  MAX_ORDER_ITEMS,
  MAX_PAIRS,
  MAX_SORT_GROUPS,
  MAX_SORT_ITEMS,
  needsCaptions,
  needsTranscript,
  parseGaps,
} from "@faridalms/domain/learning";
import { ArrowDown, ArrowUp, ChevronDown, Plus, X } from "lucide-react";
import { useId, useState } from "react";

import { CheckboxRow } from "~/components/people/fields";
import { FormField, SelectField } from "~/components/system/field";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";
import { formatChoices, formatNumber } from "~/utils/datetime";

type Change<T> = (next: T) => void;

const TRIES = ["unlimited", "1", "2", "3", "5"] as const;

/** What stops a block being saved, in the teacher's words. */
export function blockIssue(block: LessonBlock): string | null {
  if ("prompt" in block && !block.prompt.trim()) return m.lrnPromptNeeded();
  switch (block.type) {
    case "choice": {
      const filled = block.options.filter((option) => option.text.trim());
      if (filled.length < 2) return m.lrnOptionsNeeded();
      if (
        !block.correctOptionIds.some((optionId) =>
          filled.some((option) => option.id === optionId),
        )
      )
        return m.lrnCorrectNeeded();
      return null;
    }
    case "text":
      return block.answers.some((answer) => answer.trim())
        ? null
        : m.lrnAnswersNeeded();
    case "gaps": {
      const gaps = block.segments.filter((segment) => segment.type === "gap");
      if (gaps.length === 0) return m.lrnGapsNeeded();
      if (gaps.length > MAX_GAPS)
        return m.lrnGapsTooMany({ count: formatNumber(MAX_GAPS) });
      if (gaps.some((gap) => gap.answers.length === 0)) return m.lrnGapEmpty();
      if (gaps.some((gap) => gap.options.length === 1))
        return m.lrnGapChoices();
      return null;
    }
    case "number":
      return block.mode === "range" && block.min > block.max
        ? m.lrnRangeOrder()
        : null;
    case "matching": {
      const started = block.pairs.filter(
        (pair) => pair.prompt.trim() || pair.answer.trim(),
      );
      if (started.some((pair) => !pair.prompt.trim() || !pair.answer.trim()))
        return m.lrnPairIncomplete();
      return started.length < 2 ? m.lrnPairsNeeded() : null;
    }
    case "ordering":
      return block.items.filter((item) => item.text.trim()).length < 2
        ? m.lrnItemsNeeded()
        : null;
    case "sorting":
      if (block.groups.some((group) => !group.name.trim()))
        return m.lrnGroupNameNeeded();
      return block.items.filter((item) => item.text.trim()).length < 2
        ? m.lrnItemsNeeded()
        : null;
    case "media":
      if (needsCaptions(block.mediaType) && !block.captionsFileId)
        return m.lrnErrCaptions();
      if (
        needsTranscript(block.mediaType) &&
        !block.captionsFileId &&
        !block.transcript.trim()
      )
        return m.lrnTranscriptNeeded();
      return null;
    default:
      return null;
  }
}

function PromptField({
  block,
  label,
  onChange,
}: {
  block: CheckBlock;
  label: string;
  onChange: Change<CheckBlock>;
}) {
  return (
    <FormField id={`block-${block.id}-prompt`} label={label}>
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
  );
}

/**
 * Points, tries, hint and explanation, summed up in one line and opened on
 * request, so a question is quick to write and the defaults are enough.
 */
function CheckSettings({
  block,
  onChange,
}: {
  block: CheckBlock;
  onChange: Change<CheckBlock>;
}) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const written = block.type === "written";
  const summary = [
    block.points === 0 ? m.lrnPractice() : m.lrnPoints({ count: block.points }),
    ...(written
      ? []
      : [
          block.tries === null
            ? m.lrnTriesUnlimited()
            : m.lrnTriesCount({ count: block.tries }),
          ...(block.hint ? [m.lrnWithHint()] : []),
          ...(block.explanation ? [m.lrnWithExplanation()] : []),
        ]),
  ];
  return (
    <div className="grid gap-3 border-t pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {summary.join(" · ")}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="max-md:h-10"
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen((current) => !current)}
        >
          {m.lrnMoreOptions()}
          <ChevronDown
            aria-hidden
            className={cn("transition-transform", open && "rotate-180")}
          />
        </Button>
      </div>
      <div id={panel} hidden={!open} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id={`block-${block.id}-points`}
            label={m.lrnPointsLabel()}
            hint={written ? m.lrnWrittenPointsHint() : m.lrnPointsHint()}
          >
            {(control) => (
              <Input
                {...control}
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                className="w-24 max-md:h-10"
                value={String(block.points)}
                onChange={(event) => {
                  const points = Number(event.target.value);
                  if (Number.isInteger(points) && points >= 0 && points <= 100)
                    onChange({ ...block, points });
                }}
              />
            )}
          </FormField>
          {written ? null : (
            <SelectField
              id={`block-${block.id}-tries`}
              label={m.lrnTries()}
              hint={m.lrnTriesHint()}
              value={block.tries === null ? "unlimited" : String(block.tries)}
              options={TRIES.map((value) => ({
                value,
                label:
                  value === "unlimited"
                    ? m.lrnTriesUnlimited()
                    : m.lrnTriesCount({ count: Number(value) }),
              }))}
              onChange={(value) =>
                onChange({
                  ...block,
                  tries: value === "unlimited" ? null : Number(value),
                })
              }
            />
          )}
        </div>
        {written ? null : (
          <>
            <FormField
              id={`block-${block.id}-hint`}
              label={m.lrnHintLabel()}
              hint={m.lrnHintHint()}
              optional
            >
              {(control) => (
                <Textarea
                  {...control}
                  dir="auto"
                  rows={2}
                  maxLength={500}
                  value={block.hint}
                  onChange={(event) =>
                    onChange({ ...block, hint: event.target.value })
                  }
                />
              )}
            </FormField>
            <FormField
              id={`block-${block.id}-explanation`}
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
          </>
        )}
      </div>
    </div>
  );
}

function ChoiceFields({
  block,
  onChange,
}: {
  block: ChoiceBlock;
  onChange: Change<ChoiceBlock>;
}) {
  const [feedback, setFeedback] = useState(
    block.options.some((option) => option.feedback),
  );
  const setOption = (
    index: number,
    patch: Partial<ChoiceBlock["options"][number]>,
  ) =>
    onChange({
      ...block,
      options: block.options.map((option, at) =>
        at === index ? { ...option, ...patch } : option,
      ),
    });
  const toggle = (optionId: string, correct: boolean) =>
    onChange({
      ...block,
      correctOptionIds: !correct
        ? block.correctOptionIds.filter((item) => item !== optionId)
        : block.multiple
          ? [...block.correctOptionIds, optionId]
          : [optionId],
    });
  return (
    <>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm leading-5 font-medium">
          {m.lrnOptions()}
        </legend>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {block.multiple ? m.lrnOptionsHintMany() : m.lrnOptionsHintOne()}
        </p>
        {block.options.map((option, index) => (
          <div key={option.id} className="grid gap-1.5">
            <div className="flex items-center gap-2">
              <Checkbox
                aria-label={m.lrnCorrectFor({
                  number: formatNumber(index + 1),
                })}
                checked={block.correctOptionIds.includes(option.id)}
                onCheckedChange={(checked) => toggle(option.id, checked)}
                className="max-md:after:-inset-3"
              />
              <Input
                aria-label={m.lrnOptionNumber({
                  number: formatNumber(index + 1),
                })}
                dir="auto"
                maxLength={300}
                className="min-w-0 flex-1 max-md:h-10"
                value={option.text}
                onChange={(event) =>
                  setOption(index, { text: event.target.value })
                }
              />
              {block.options.length > 2 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="max-md:size-10"
                  aria-label={m.lrnRemoveOptionNumber({
                    number: formatNumber(index + 1),
                  })}
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
            {feedback ? (
              <Input
                aria-label={m.lrnOptionFeedbackFor({
                  number: formatNumber(index + 1),
                })}
                placeholder={m.lrnOptionFeedback()}
                dir="auto"
                maxLength={300}
                className="ms-7 w-auto min-w-0 max-md:h-10"
                value={option.feedback}
                onChange={(event) =>
                  setOption(index, { feedback: event.target.value })
                }
              />
            ) : null}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {block.options.length < MAX_CHOICE_OPTIONS ? (
            <Button
              type="button"
              variant="ghost"
              className="max-md:h-10"
              onClick={() =>
                onChange({
                  ...block,
                  options: [
                    ...block.options,
                    { id: crypto.randomUUID(), text: "", feedback: "" },
                  ],
                })
              }
            >
              <Plus aria-hidden />
              {m.lrnAddOption()}
            </Button>
          ) : null}
          {feedback ? null : (
            <Button
              type="button"
              variant="ghost"
              className="max-md:h-10"
              onClick={() => setFeedback(true)}
            >
              <Plus aria-hidden />
              {m.lrnAddOptionFeedback()}
            </Button>
          )}
        </div>
      </fieldset>
      <div className="grid gap-3">
        <CheckboxRow
          label={m.lrnMultiple()}
          checked={block.multiple}
          onChange={(multiple) =>
            onChange({
              ...block,
              multiple,
              correctOptionIds: multiple
                ? block.correctOptionIds
                : block.correctOptionIds.slice(0, 1),
            })
          }
        />
        <CheckboxRow
          label={m.lrnShuffle()}
          hint={m.lrnShuffleHint()}
          checked={block.shuffle}
          onChange={(shuffle) => onChange({ ...block, shuffle })}
        />
      </div>
    </>
  );
}

function MatchingRows<T extends TextBlock | GapsBlock>({
  block,
  onChange,
}: {
  block: T;
  onChange: Change<T>;
}) {
  return (
    <div className="grid gap-3">
      <CheckboxRow
        label={m.lrnCloseEnough()}
        hint={m.lrnCloseEnoughHint()}
        checked={block.closeEnough}
        onChange={(closeEnough) => onChange({ ...block, closeEnough })}
      />
      <CheckboxRow
        label={m.lrnTehMarbuta()}
        hint={m.lrnTehMarbutaHint()}
        checked={block.tehMarbuta}
        onChange={(tehMarbuta) => onChange({ ...block, tehMarbuta })}
      />
      <CheckboxRow
        label={m.lrnCaseSensitive()}
        checked={block.caseSensitive}
        onChange={(caseSensitive) => onChange({ ...block, caseSensitive })}
      />
    </div>
  );
}

function TextFields({
  block,
  onChange,
}: {
  block: TextBlock;
  onChange: Change<TextBlock>;
}) {
  const [keys, setKeys] = useState(() =>
    block.answers.map(() => crypto.randomUUID()),
  );
  return (
    <>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm leading-5 font-medium">
          {m.lrnAccepted()}
        </legend>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.lrnAcceptedHint()}
        </p>
        {block.answers.map((answer, index) => (
          <div key={keys[index]} className="flex items-center gap-2">
            <Input
              aria-label={m.lrnAcceptedNumber({
                number: formatNumber(index + 1),
              })}
              dir="auto"
              maxLength={200}
              className="min-w-0 flex-1 max-md:h-10"
              value={answer}
              onChange={(event) =>
                onChange({
                  ...block,
                  answers: block.answers.map((item, at) =>
                    at === index ? event.target.value : item,
                  ),
                })
              }
            />
            {block.answers.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="max-md:size-10"
                aria-label={m.lrnRemoveAccepted({
                  number: formatNumber(index + 1),
                })}
                onClick={() => {
                  setKeys((current) => current.filter((_, at) => at !== index));
                  onChange({
                    ...block,
                    answers: block.answers.filter((_, at) => at !== index),
                  });
                }}
              >
                <X aria-hidden />
              </Button>
            ) : null}
          </div>
        ))}
        {block.answers.length < MAX_ACCEPTED_ANSWERS ? (
          <div>
            <Button
              type="button"
              variant="ghost"
              className="max-md:h-10"
              onClick={() => {
                setKeys((current) => [...current, crypto.randomUUID()]);
                onChange({ ...block, answers: [...block.answers, ""] });
              }}
            >
              <Plus aria-hidden />
              {m.lrnAddAccepted()}
            </Button>
          </div>
        ) : null}
      </fieldset>
      <MatchingRows block={block} onChange={onChange} />
    </>
  );
}

function GapsFields({
  block,
  onChange,
}: {
  block: GapsBlock;
  onChange: Change<GapsBlock>;
}) {
  const [source, setSource] = useState(() => gapsSource(block.segments));
  const gaps = block.segments.filter((segment) => segment.type === "gap");
  return (
    <>
      <FormField
        id={`block-${block.id}-passage`}
        label={m.lrnPassage()}
        hint={m.lrnPassageHint()}
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={4}
            maxLength={4000}
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              onChange({
                ...block,
                segments: parseGaps(
                  event.target.value,
                  gaps.map((gap) => gap.id),
                ),
              });
            }}
          />
        )}
      </FormField>
      {gaps.length > 0 ? (
        <ol className="grid list-inside list-decimal gap-1 text-[13px] leading-[18px] text-muted-foreground">
          {gaps.map((gap) => (
            <li key={gap.id}>
              <bdi>{formatChoices(gap.answers)}</bdi>
              {gap.options.length > 0
                ? ` ${m.lrnGapFrom({ options: formatChoices(gap.options) })}`
                : ""}
            </li>
          ))}
        </ol>
      ) : null}
      <MatchingRows block={block} onChange={onChange} />
    </>
  );
}

function NumberInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const invalid = parseNumber(text) === null;
  return (
    <FormField
      id={id}
      label={label}
      errors={invalid ? [m.lrnNumberNeeded()] : undefined}
    >
      {(control) => (
        <Input
          {...control}
          dir="ltr"
          inputMode="decimal"
          autoComplete="off"
          className="w-36 tabular-nums max-md:h-10"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            const parsed = parseNumber(event.target.value);
            if (parsed !== null) onChange(parsed);
          }}
        />
      )}
    </FormField>
  );
}

function NumberFields({
  block,
  onChange,
}: {
  block: NumberBlock;
  onChange: Change<NumberBlock>;
}) {
  return (
    <>
      <SelectField
        id={`block-${block.id}-mode`}
        label={m.lrnNumberMode()}
        width="name"
        value={block.mode}
        options={[
          { value: "exact", label: m.lrnNumberExact() },
          { value: "range", label: m.lrnNumberRange() },
        ]}
        onChange={(mode) => onChange({ ...block, mode })}
      />
      {block.mode === "exact" ? (
        <div className="flex flex-wrap items-start gap-4">
          <NumberInput
            id={`block-${block.id}-value`}
            label={m.lrnNumberValue()}
            value={block.value}
            onChange={(value) => onChange({ ...block, value })}
          />
          <NumberInput
            id={`block-${block.id}-tolerance`}
            label={block.percent ? m.lrnTolerancePercent() : m.lrnTolerance()}
            value={block.tolerance}
            onChange={(tolerance) =>
              onChange({ ...block, tolerance: Math.abs(tolerance) })
            }
          />
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          <NumberInput
            id={`block-${block.id}-min`}
            label={m.lrnNumberMin()}
            value={block.min}
            onChange={(min) => onChange({ ...block, min })}
          />
          <NumberInput
            id={`block-${block.id}-max`}
            label={m.lrnNumberMax()}
            value={block.max}
            onChange={(max) => onChange({ ...block, max })}
          />
        </div>
      )}
      {block.mode === "exact" ? (
        <CheckboxRow
          label={m.lrnToleranceAsPercent()}
          checked={block.percent}
          onChange={(percent) => onChange({ ...block, percent })}
        />
      ) : null}
    </>
  );
}

/** A list of short text rows a teacher adds to, edits and removes from. */
function RowList<T extends { id: string }>({
  legend,
  hint,
  rows,
  min,
  max,
  addLabel,
  onAdd,
  onRemove,
  removeLabel,
  onMove,
  moveLabels,
  children,
}: {
  legend: string;
  hint: string;
  rows: T[];
  min: number;
  max: number;
  addLabel: string;
  onAdd: () => void;
  onRemove: (id: string) => void;
  removeLabel: (number: string) => string;
  onMove?: (index: number, by: -1 | 1) => void;
  moveLabels?: {
    up: (number: string) => string;
    down: (number: string) => string;
  };
  children: (row: T, index: number) => ReactNode;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm leading-5 font-medium">{legend}</legend>
      <p className="text-[13px] leading-[18px] text-muted-foreground">{hint}</p>
      {rows.map((row, index) => {
        const number = formatNumber(index + 1);
        return (
          <div key={row.id} className="flex items-center gap-2">
            {children(row, index)}
            {onMove && moveLabels ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="max-md:size-10"
                  aria-label={moveLabels.up(number)}
                  disabled={index === 0}
                  onClick={() => onMove(index, -1)}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="max-md:size-10"
                  aria-label={moveLabels.down(number)}
                  disabled={index === rows.length - 1}
                  onClick={() => onMove(index, 1)}
                >
                  <ArrowDown aria-hidden />
                </Button>
              </>
            ) : null}
            {rows.length > min ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="max-md:size-10"
                aria-label={removeLabel(number)}
                onClick={() => onRemove(row.id)}
              >
                <X aria-hidden />
              </Button>
            ) : null}
          </div>
        );
      })}
      {rows.length < max ? (
        <div>
          <Button
            type="button"
            variant="ghost"
            className="max-md:h-10"
            onClick={onAdd}
          >
            <Plus aria-hidden />
            {addLabel}
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}

const rowInput = "min-w-0 flex-1 max-md:h-10";

function MatchingFields({
  block,
  onChange,
}: {
  block: MatchingBlock;
  onChange: Change<MatchingBlock>;
}) {
  const setPair = (
    pairId: string,
    patch: Partial<MatchingBlock["pairs"][number]>,
  ) =>
    onChange({
      ...block,
      pairs: block.pairs.map((pair) =>
        pair.id === pairId ? { ...pair, ...patch } : pair,
      ),
    });
  return (
    <>
      <RowList
        legend={m.lrnPairs()}
        hint={m.lrnPairsHint()}
        rows={block.pairs}
        min={2}
        max={MAX_PAIRS}
        addLabel={m.lrnAddPair()}
        onAdd={() =>
          onChange({
            ...block,
            pairs: [
              ...block.pairs,
              { id: crypto.randomUUID(), prompt: "", answer: "" },
            ],
          })
        }
        onRemove={(pairId) =>
          onChange({
            ...block,
            pairs: block.pairs.filter((pair) => pair.id !== pairId),
          })
        }
        removeLabel={(number) => m.lrnRemovePair({ number })}
      >
        {(pair, index) => (
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
            <Input
              aria-label={m.lrnPairPrompt({ number: formatNumber(index + 1) })}
              placeholder={m.lrnPairPromptPlaceholder()}
              dir="auto"
              maxLength={300}
              className={rowInput}
              value={pair.prompt}
              onChange={(event) =>
                setPair(pair.id, { prompt: event.target.value })
              }
            />
            <Input
              aria-label={m.lrnPairAnswer({ number: formatNumber(index + 1) })}
              placeholder={m.lrnPairAnswerPlaceholder()}
              dir="auto"
              maxLength={300}
              className={rowInput}
              value={pair.answer}
              onChange={(event) =>
                setPair(pair.id, { answer: event.target.value })
              }
            />
          </div>
        )}
      </RowList>
      <RowList
        legend={m.lrnDistractors()}
        hint={m.lrnDistractorsHint()}
        rows={block.distractors}
        min={0}
        max={MAX_DISTRACTORS}
        addLabel={m.lrnAddDistractor()}
        onAdd={() =>
          onChange({
            ...block,
            distractors: [
              ...block.distractors,
              { id: crypto.randomUUID(), text: "" },
            ],
          })
        }
        onRemove={(otherId) =>
          onChange({
            ...block,
            distractors: block.distractors.filter(
              (other) => other.id !== otherId,
            ),
          })
        }
        removeLabel={(number) => m.lrnRemoveDistractor({ number })}
      >
        {(other, index) => (
          <Input
            aria-label={m.lrnDistractorNumber({
              number: formatNumber(index + 1),
            })}
            dir="auto"
            maxLength={300}
            className={rowInput}
            value={other.text}
            onChange={(event) =>
              onChange({
                ...block,
                distractors: block.distractors.map((item) =>
                  item.id === other.id
                    ? { ...item, text: event.target.value }
                    : item,
                ),
              })
            }
          />
        )}
      </RowList>
    </>
  );
}

function OrderingFields({
  block,
  onChange,
}: {
  block: OrderingBlock;
  onChange: Change<OrderingBlock>;
}) {
  return (
    <>
      <RowList
        legend={m.lrnOrderItems()}
        hint={m.lrnOrderItemsHint()}
        rows={block.items}
        min={2}
        max={MAX_ORDER_ITEMS}
        addLabel={m.lrnAddItem()}
        onAdd={() =>
          onChange({
            ...block,
            items: [...block.items, { id: crypto.randomUUID(), text: "" }],
          })
        }
        onRemove={(itemId) =>
          onChange({
            ...block,
            items: block.items.filter((item) => item.id !== itemId),
          })
        }
        removeLabel={(number) => m.lrnRemoveItem({ number })}
        onMove={(index, by) => {
          const items = [...block.items];
          const [moved] = items.splice(index, 1);
          if (moved) items.splice(index + by, 0, moved);
          onChange({ ...block, items });
        }}
        moveLabels={{
          up: (number) => m.lrnMoveItemNumberUp({ number }),
          down: (number) => m.lrnMoveItemNumberDown({ number }),
        }}
      >
        {(item, index) => (
          <>
            <span className="w-5 shrink-0 text-sm text-muted-foreground tabular-nums">
              {formatNumber(index + 1)}
            </span>
            <Input
              aria-label={m.lrnItemNumber({ number: formatNumber(index + 1) })}
              dir="auto"
              maxLength={300}
              className={rowInput}
              value={item.text}
              onChange={(event) =>
                onChange({
                  ...block,
                  items: block.items.map((row) =>
                    row.id === item.id
                      ? { ...row, text: event.target.value }
                      : row,
                  ),
                })
              }
            />
          </>
        )}
      </RowList>
      <SelectField
        id={`block-${block.id}-scoring`}
        label={m.lrnOrderScoring()}
        width="name"
        value={block.scoring}
        options={[
          { value: "all", label: m.lrnScoreAll() },
          { value: "neighbours", label: m.lrnScoreNeighbours() },
        ]}
        onChange={(scoring) => onChange({ ...block, scoring })}
      />
    </>
  );
}

function SortingFields({
  block,
  onChange,
}: {
  block: SortingBlock;
  onChange: Change<SortingBlock>;
}) {
  const groupItems = block.groups.map((group, index) => ({
    value: group.id,
    label:
      group.name.trim() ||
      m.lrnGroupNumber({ number: formatNumber(index + 1) }),
  }));
  return (
    <>
      <RowList
        legend={m.lrnGroups()}
        hint={m.lrnGroupsHint()}
        rows={block.groups}
        min={2}
        max={MAX_SORT_GROUPS}
        addLabel={m.lrnAddGroup()}
        onAdd={() =>
          onChange({
            ...block,
            groups: [...block.groups, { id: crypto.randomUUID(), name: "" }],
          })
        }
        onRemove={(groupId) => {
          const groups = block.groups.filter((group) => group.id !== groupId);
          const fallback = groups[0]?.id ?? "";
          onChange({
            ...block,
            groups,
            items: block.items.map((item) =>
              item.groupId === groupId ? { ...item, groupId: fallback } : item,
            ),
          });
        }}
        removeLabel={(number) => m.lrnRemoveGroup({ number })}
      >
        {(group, index) => (
          <Input
            aria-label={m.lrnGroupNumber({ number: formatNumber(index + 1) })}
            dir="auto"
            maxLength={100}
            className={rowInput}
            value={group.name}
            onChange={(event) =>
              onChange({
                ...block,
                groups: block.groups.map((row) =>
                  row.id === group.id
                    ? { ...row, name: event.target.value }
                    : row,
                ),
              })
            }
          />
        )}
      </RowList>
      <RowList
        legend={m.lrnSortItems()}
        hint={m.lrnSortItemsHint()}
        rows={block.items}
        min={2}
        max={MAX_SORT_ITEMS}
        addLabel={m.lrnAddItem()}
        onAdd={() =>
          onChange({
            ...block,
            items: [
              ...block.items,
              {
                id: crypto.randomUUID(),
                text: "",
                groupId: block.groups[0]?.id ?? "",
              },
            ],
          })
        }
        onRemove={(itemId) =>
          onChange({
            ...block,
            items: block.items.filter((item) => item.id !== itemId),
          })
        }
        removeLabel={(number) => m.lrnRemoveItem({ number })}
      >
        {(item, index) => (
          <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <Input
              aria-label={m.lrnItemNumber({ number: formatNumber(index + 1) })}
              dir="auto"
              maxLength={300}
              className={rowInput}
              value={item.text}
              onChange={(event) =>
                onChange({
                  ...block,
                  items: block.items.map((row) =>
                    row.id === item.id
                      ? { ...row, text: event.target.value }
                      : row,
                  ),
                })
              }
            />
            <SelectField
              label={m.lrnItemGroup({ number: formatNumber(index + 1) })}
              labelHidden
              value={item.groupId}
              options={groupItems}
              onChange={(groupId) =>
                onChange({
                  ...block,
                  items: block.items.map((row) =>
                    row.id === item.id ? { ...row, groupId } : row,
                  ),
                })
              }
            />
          </div>
        )}
      </RowList>
    </>
  );
}

function WrittenFields({
  block,
  onChange,
}: {
  block: WrittenBlock;
  onChange: Change<WrittenBlock>;
}) {
  return (
    <FormField
      id={`block-${block.id}-limit`}
      label={m.lrnWordLimit()}
      hint={m.lrnWordLimitHint()}
      optional
    >
      {(control) => (
        <Input
          {...control}
          type="number"
          inputMode="numeric"
          min={10}
          max={5000}
          className="w-28 max-md:h-10"
          value={block.wordLimit === null ? "" : String(block.wordLimit)}
          onChange={(event) => {
            const limit = Number(event.target.value);
            onChange({
              ...block,
              wordLimit:
                event.target.value === ""
                  ? null
                  : Number.isInteger(limit)
                    ? Math.min(5000, Math.max(10, limit))
                    : block.wordLimit,
            });
          }}
        />
      )}
    </FormField>
  );
}

/** The fields of one question, whatever its kind, with its settings below. */
export function CheckFields({
  block,
  onChange,
}: {
  block: CheckBlock;
  onChange: Change<CheckBlock>;
}) {
  return (
    <div className="grid gap-4">
      <PromptField
        block={block}
        label={block.type === "gaps" ? m.lrnInstruction() : m.lrnQuestion()}
        onChange={onChange}
      />
      {block.type === "choice" ? (
        <ChoiceFields block={block} onChange={onChange} />
      ) : block.type === "text" ? (
        <TextFields block={block} onChange={onChange} />
      ) : block.type === "gaps" ? (
        <GapsFields block={block} onChange={onChange} />
      ) : block.type === "number" ? (
        <NumberFields block={block} onChange={onChange} />
      ) : block.type === "matching" ? (
        <MatchingFields block={block} onChange={onChange} />
      ) : block.type === "ordering" ? (
        <OrderingFields block={block} onChange={onChange} />
      ) : block.type === "sorting" ? (
        <SortingFields block={block} onChange={onChange} />
      ) : (
        <WrittenFields block={block} onChange={onChange} />
      )}
      <CheckSettings block={block} onChange={onChange} />
    </div>
  );
}

export function MediaFields({
  block,
  onChange,
}: {
  block: Extract<LessonBlock, { type: "media" }>;
  onChange: Change<LessonBlock>;
}) {
  return (
    <div className="grid gap-4">
      <p className="text-sm leading-5 font-medium">
        <bdi>{block.name}</bdi>
      </p>
      <FormField
        id={`block-${block.id}-caption`}
        label={m.lrnCaption()}
        optional
      >
        {(control) => (
          <Input
            {...control}
            dir="auto"
            maxLength={500}
            className="max-md:h-10"
            value={block.caption}
            onChange={(event) =>
              onChange({ ...block, caption: event.target.value })
            }
          />
        )}
      </FormField>
      {block.mediaType.startsWith("audio/") ||
      block.mediaType.startsWith("video/") ? (
        <FormField
          id={`block-${block.id}-transcript`}
          label={m.lrnTranscript()}
          hint={m.lrnTranscriptHint()}
          optional={
            !needsTranscript(block.mediaType) || Boolean(block.captionsFileId)
          }
        >
          {(control) => (
            <Textarea
              {...control}
              dir="auto"
              rows={4}
              maxLength={20000}
              value={block.transcript}
              onChange={(event) =>
                onChange({ ...block, transcript: event.target.value })
              }
            />
          )}
        </FormField>
      ) : null}
    </div>
  );
}
