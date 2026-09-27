import type {
  CheckBlock,
  ChoiceBlock,
  GapsBlock,
  LessonBlock,
  NumberBlock,
  TextBlock,
  WrittenBlock,
} from "@faridalms/domain/learning";

import { parseNumber } from "@faridalms/domain/answers";
import {
  gapsSource,
  MAX_ACCEPTED_ANSWERS,
  MAX_CHOICE_OPTIONS,
  MAX_GAPS,
  needsCaptions,
  needsTranscript,
  parseGaps,
} from "@faridalms/domain/learning";
import { ChevronDown, Plus, X } from "lucide-react";
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
