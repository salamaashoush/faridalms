import type { ReactNode } from "react";

import { ArrowDown, ArrowUp, Check, CircleAlert, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "../button";
import { cn } from "../cn";
import { Input } from "../input";
import { RadioGroup, RadioGroupItem } from "../radio-group";
import { Textarea } from "../textarea";
import { ActionMenu } from "./action-menu";
import {
  GridAddButton,
  readNumber,
  useFocusAfterRender,
  writeNumber,
} from "./data-grid";
import { useDesignSystem } from "./provider";

/** One level of a criterion as it is read: its name, points and meaning. */
export interface RubricLevel {
  id: string;
  title: string;
  /** Null only while a level is being written without a figure. */
  points: number | null;
  description?: string;
}

/** One thing work is judged on, with the levels a grader chooses between. */
export interface RubricCriterion {
  id: string;
  title: string;
  levels: readonly RubricLevel[];
}

/**
 * The container width from which a criterion's levels stand side by side,
 * about 9rem a level; below it, and for more than six levels, they stack.
 * Written out whole so Tailwind sees every class.
 */
const SIDE_BY_SIDE: Record<number, string> = {
  1: "",
  2: "@min-[20rem]:grid-cols-2",
  3: "@min-[28rem]:grid-cols-3",
  4: "@min-[36rem]:grid-cols-4",
  5: "@min-[45rem]:grid-cols-5",
  6: "@min-[54rem]:grid-cols-6",
};

const best = (criterion: RubricCriterion) =>
  Math.max(0, ...criterion.levels.map((level) => level.points ?? 0));

interface LevelCellProps {
  level: RubricLevel;
  showPoints: boolean;
  awarded: boolean;
}

function LevelCell({ level, showPoints, awarded }: LevelCellProps) {
  const { strings } = useDesignSystem();
  return (
    <li
      className={cn(
        "grid content-start gap-1 bg-card px-4 py-3",
        awarded && "bg-primary/5 ring-2 ring-primary ring-inset",
      )}
    >
      <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span dir="auto" className="text-sm leading-5 font-medium">
          {level.title}
        </span>
        {showPoints ? (
          <span className="text-[13px] leading-[18px] whitespace-nowrap text-muted-foreground tabular-nums">
            {level.points === null
              ? strings.notRecorded
              : strings.rubricPoints(level.points)}
          </span>
        ) : null}
      </span>
      {awarded ? (
        <span className="flex items-center gap-1 text-[13px] leading-[18px] font-medium text-primary">
          <Check className="size-3.5" aria-hidden />
          {strings.rubricAwarded}
        </span>
      ) : null}
      {level.description ? (
        <span
          dir="auto"
          className="text-[13px] leading-[18px] whitespace-pre-line text-muted-foreground"
        >
          {level.description}
        </span>
      ) : null}
    </li>
  );
}

/** The criterion being written, drawn in place of its levels. */
export interface RubricEditing {
  criterionId: string;
  content: ReactNode;
  onDone: () => void;
  /** Absent when there is nothing to go back to, such as a first criterion. */
  onCancel?: () => void;
}

export interface RubricMatrixProps {
  /** Names the whole rubric to a screen reader. */
  label: string;
  criteria: readonly RubricCriterion[];
  /** The level awarded on each criterion, by criterion id; marked in its row. */
  awarded?: Readonly<Record<string, string>>;
  /** Off where levels are chosen without points, as a classmate's review is. */
  showPoints?: boolean;
  /** A line under a criterion's name, such as the standards it counts toward. */
  renderCriterionMeta?: (criterion: RubricCriterion) => ReactNode;
  /** At the end of a criterion's row: its Edit and `•••` while writing. */
  renderCriterionActions?: (criterion: RubricCriterion, index: number) => ReactNode;
  /** Under a criterion's levels, such as the grader's comment on it. */
  renderCriterionNote?: (criterion: RubricCriterion) => ReactNode;
  /** A criterion's problem while writing, said under its name. */
  criterionError?: (criterion: RubricCriterion) => string | null;
  editing?: RubricEditing | null;
  /** Ends the matrix with the most it can award. */
  showTotal?: boolean;
}

/**
 * A rubric read as criteria by levels (Canvas, Classroom): each criterion's
 * name and the most it earns, then its levels side by side as wide as the
 * container allows, each with its points and what work at it looks like,
 * stacking into a list on a phone. An awarded level is outlined and says
 * so. While writing, one criterion at a time opens in place of its levels.
 */
export function RubricMatrix({
  label,
  criteria,
  awarded,
  showPoints = true,
  renderCriterionMeta,
  renderCriterionActions,
  renderCriterionNote,
  criterionError,
  editing,
  showTotal = false,
}: RubricMatrixProps) {
  const { strings, formatNumber } = useDesignSystem();
  const total = criteria.reduce((sum, criterion) => sum + best(criterion), 0);
  return (
    <div className="@container min-w-0">
      <div className="overflow-hidden rounded-lg border bg-card">
        <ol aria-label={label} className="divide-y">
          {criteria.map((criterion, index) => {
            const chosen = awarded
              ? criterion.levels.find(
                  (level) => level.id === awarded[criterion.id],
                )
              : undefined;
            const open = editing?.criterionId === criterion.id;
            const error = criterionError?.(criterion) ?? null;
            const meta = renderCriterionMeta?.(criterion);
            const note = renderCriterionNote?.(criterion);
            return (
              <li key={criterion.id} data-criterion={criterion.id}>
                <div className="flex items-start gap-3 bg-muted/40 px-4 py-3">
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <span
                      dir="auto"
                      className="text-sm leading-5 font-semibold break-words"
                    >
                      {criterion.title || strings.notRecorded}
                    </span>
                    {showPoints ? (
                      <span className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
                        {awarded
                          ? chosen && chosen.points !== null
                            ? strings.rubricScored(
                                formatNumber(chosen.points),
                                strings.rubricPoints(best(criterion)),
                              )
                            : strings.rubricNotMarked
                          : strings.rubricBest(
                              strings.rubricPoints(best(criterion)),
                            )}
                      </span>
                    ) : awarded && !chosen ? (
                      <span className="text-[13px] leading-[18px] text-muted-foreground">
                        {strings.rubricNotMarked}
                      </span>
                    ) : null}
                    {meta ? (
                      <span className="text-[13px] leading-[18px] text-muted-foreground">
                        {meta}
                      </span>
                    ) : null}
                    {error && !open ? (
                      <span className="flex items-start gap-1.5 text-[13px] leading-[18px] text-destructive">
                        <CircleAlert
                          className="mt-px size-3.5 shrink-0"
                          aria-hidden
                        />
                        {error}
                      </span>
                    ) : null}
                  </div>
                  {!open && renderCriterionActions ? (
                    <div className="-me-2 -mt-1 flex shrink-0 items-center gap-1">
                      {renderCriterionActions(criterion, index)}
                    </div>
                  ) : null}
                </div>
                {open && editing ? (
                  <div className="grid gap-6 border-t bg-muted/30 px-4 py-4">
                    {editing.content}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="max-md:h-10"
                        onClick={editing.onDone}
                      >
                        {strings.done}
                      </Button>
                      {editing.onCancel ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className="max-md:h-10"
                          aria-label={strings.rubricCancelEdit(
                            criterion.title || strings.notRecorded,
                          )}
                          onClick={editing.onCancel}
                        >
                          {strings.cancel}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <ul
                    aria-label={strings.rubricLevelsOf(
                      criterion.title || strings.notRecorded,
                    )}
                    className={cn(
                      "grid gap-px border-t bg-border",
                      SIDE_BY_SIDE[criterion.levels.length],
                    )}
                  >
                    {criterion.levels.map((level) => (
                      <LevelCell
                        key={level.id}
                        level={level}
                        showPoints={showPoints}
                        awarded={chosen?.id === level.id}
                      />
                    ))}
                  </ul>
                )}
                {note ? <div className="border-t px-4 py-3">{note}</div> : null}
              </li>
            );
          })}
        </ol>
        {showTotal && showPoints ? (
          <p className="flex justify-between gap-3 border-t bg-muted/40 px-4 py-3 text-sm leading-5 font-semibold tabular-nums">
            <span>{strings.rubricTotal}</span>
            <span>{strings.rubricPoints(total)}</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

export interface RubricLevelPickerProps {
  /** Prefix of the levels' ids; also the group's own id. */
  id: string;
  criterion: RubricCriterion;
  /** The chosen level's id, or null while none is. */
  value: string | null;
  onChange: (levelId: string | null) => void;
  showPoints?: boolean;
  /** What the grader adds about this criterion, under its levels. */
  children?: ReactNode;
}

/**
 * Choosing one criterion's level while marking: the criterion's name and
 * the points the choice earns, then every level as a choice with its points
 * and what work at it looks like, so the grader reads the descriptors
 * while choosing (Canvas's vertical view, the Classroom grading panel).
 * Clear takes the choice back.
 */
export function RubricLevelPicker({
  id,
  criterion,
  value,
  onChange,
  showPoints = true,
  children,
}: RubricLevelPickerProps) {
  const { strings, formatNumber } = useDesignSystem();
  const chosen = criterion.levels.find((level) => level.id === value);
  const legendId = `${id}-legend`;
  return (
    <div className="grid min-w-0 content-start gap-2">
      <div className="flex min-h-8 items-center gap-3">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <span
            id={legendId}
            dir="auto"
            className="text-sm leading-5 font-semibold break-words"
          >
            {criterion.title}
          </span>
          <span className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
            {chosen
              ? showPoints && chosen.points !== null
                ? strings.rubricScored(
                    formatNumber(chosen.points),
                    strings.rubricPoints(best(criterion)),
                  )
                : chosen.title
              : strings.rubricNotMarked}
          </span>
        </div>
        {chosen ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0 max-md:h-10"
            aria-label={strings.rubricClear(criterion.title)}
            onClick={() => onChange(null)}
          >
            {strings.clear}
          </Button>
        ) : null}
      </div>
      <RadioGroup
        aria-labelledby={legendId}
        value={value ?? ""}
        onValueChange={(next) => {
          if (typeof next === "string" && next) onChange(next);
        }}
        className="gap-0 overflow-hidden rounded-lg border bg-card"
      >
        {criterion.levels.map((level, index) => {
          const itemId = `${id}-${level.id}`;
          return (
            <label
              key={level.id}
              htmlFor={itemId}
              className={cn(
                "flex cursor-pointer items-start gap-3 px-3 py-2.5 has-data-checked:bg-primary/5 has-data-checked:ring-2 has-data-checked:ring-primary has-data-checked:ring-inset",
                index > 0 && "border-t",
              )}
            >
              <RadioGroupItem
                id={itemId}
                value={level.id}
                aria-labelledby={`${itemId}-name`}
                aria-describedby={
                  level.description ? `${itemId}-about` : undefined
                }
                className="mt-0.5"
              />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span
                  id={`${itemId}-name`}
                  className="flex flex-wrap items-baseline justify-between gap-x-3"
                >
                  <span dir="auto" className="text-sm leading-5 font-medium">
                    {level.title}
                  </span>
                  {showPoints && level.points !== null ? (
                    <span className="text-[13px] leading-[18px] whitespace-nowrap text-muted-foreground tabular-nums">
                      {strings.rubricPoints(level.points)}
                    </span>
                  ) : null}
                </span>
                {level.description ? (
                  <span
                    id={`${itemId}-about`}
                    dir="auto"
                    className="text-[13px] leading-[18px] whitespace-pre-line text-muted-foreground"
                  >
                    {level.description}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </RadioGroup>
      {children}
    </div>
  );
}

/** One level as it is written. */
export interface RubricLevelDraft {
  id: string;
  title: string;
  points: number | null;
  description: string;
}

/** What stops a level being used, by the field it is about. */
export interface RubricLevelErrors {
  title?: string;
  points?: string;
}

/** The id of one field of a level, so a caller can move focus to it. */
export const rubricLevelFieldId = (
  prefix: string,
  levelId: string,
  field: "title" | "points" | "description",
) => `${prefix}-${levelId}-${field}`;

interface PointsInputProps {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  invalid: boolean;
  describedBy?: string;
}

/** Points typed as text in either script: no spinner, digits at the end. */
function PointsInput({
  id,
  label,
  value,
  onChange,
  invalid,
  describedBy,
}: PointsInputProps) {
  const { formatNumber } = useDesignSystem();
  const [text, setText] = useState<string | null>(null);
  const shown =
    text ?? (value === null ? "" : writeNumber(value, formatNumber));
  return (
    <Input
      id={id}
      inputMode="decimal"
      autoComplete="off"
      aria-label={label}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      value={shown}
      className="text-end tabular-nums max-md:h-10"
      onFocus={(event) => {
        setText(shown);
        event.currentTarget.select();
      }}
      onBlur={() => setText(null)}
      onChange={(event) => {
        setText(event.target.value);
        const figure = readNumber(event.target.value);
        onChange(figure === null || Number.isNaN(figure) ? null : figure);
      }}
    />
  );
}

export interface RubricLevelEditorProps {
  /** Prefix of every field's id (`rubricLevelFieldId`). */
  idPrefix: string;
  levels: readonly RubricLevelDraft[];
  onChange: (levels: RubricLevelDraft[]) => void;
  /** A new, empty level to add at the end. */
  newLevel: () => RubricLevelDraft;
  max: number;
  maxDescription: number;
  /** Each level's problems, by level id, once they are to be shown. */
  errors?: Readonly<Record<string, RubricLevelErrors>>;
}

/**
 * A criterion's levels written one per row: the name, the points and what
 * work at the level looks like side by side, the description given the
 * room left and growing with its text (Canvas's criterion editor), under
 * column headings; on a phone each row stacks with its own labels. Each
 * level's `•••` moves it up or down or removes it, and Add a level puts
 * one at the end.
 */
export function RubricLevelEditor({
  idPrefix,
  levels,
  onChange,
  newLevel,
  max,
  maxDescription,
  errors,
}: RubricLevelEditorProps) {
  const { strings, formatNumber } = useDesignSystem();
  const focusLater = useFocusAfterRender();
  const [said, setSaid] = useState("");
  const field = (levelId: string, which: "title" | "points" | "description") =>
    rubricLevelFieldId(idPrefix, levelId, which);
  const nameOf = (level: RubricLevelDraft, index: number) =>
    level.title.trim() || formatNumber(index + 1);
  const change = (id: string, patch: Partial<RubricLevelDraft>) =>
    onChange(
      levels.map((level) => (level.id === id ? { ...level, ...patch } : level)),
    );
  const move = (index: number, by: -1 | 1) => {
    const level = levels[index];
    const target = index + by;
    if (!level || target < 0 || target >= levels.length) return;
    const next = levels.filter((_, at) => at !== index);
    next.splice(target, 0, level);
    onChange(next);
    setSaid(
      strings.rubricLevelMoved(nameOf(level, index), formatNumber(target + 1)),
    );
  };
  const remove = (index: number) => {
    const next = levels.filter((_, at) => at !== index);
    onChange(next);
    const neighbour = next[Math.min(index, next.length - 1)];
    if (neighbour) focusLater(field(neighbour.id, "title"));
  };
  const label =
    "text-[13px] leading-[18px] font-medium text-muted-foreground @min-[36rem]:sr-only";
  return (
    <div className="@container grid min-w-0 gap-3">
      <div
        aria-hidden
        className="hidden gap-3 text-[13px] leading-[18px] font-medium text-muted-foreground @min-[36rem]:grid @min-[36rem]:grid-cols-[minmax(0,11rem)_6rem_minmax(0,1fr)_2rem]"
      >
        <span>{strings.rubricLevelName}</span>
        <span className="text-end">{strings.rubricLevelPoints}</span>
        <span>{strings.rubricLevelDescription}</span>
      </div>
      <ol className="grid gap-3">
        {levels.map((level, index) => {
          const name = nameOf(level, index);
          const problem = errors?.[level.id];
          const problemId = `${field(level.id, "title")}-problem`;
          const actions = [
            ...(index > 0
              ? [
                  {
                    label: strings.rubricMoveUp,
                    icon: ArrowUp,
                    onSelect: () => move(index, -1),
                  },
                ]
              : []),
            ...(index < levels.length - 1
              ? [
                  {
                    label: strings.rubricMoveDown,
                    icon: ArrowDown,
                    onSelect: () => move(index, 1),
                  },
                ]
              : []),
            ...(levels.length > 1
              ? [
                  {
                    label: strings.rubricRemoveLevel,
                    icon: Trash2,
                    onSelect: () => remove(index),
                  },
                ]
              : []),
          ];
          return (
            <li
              key={level.id}
              className="grid gap-x-3 gap-y-2 border-b pb-3 last:border-b-0 last:pb-0"
            >
              <div className="grid grid-cols-[minmax(0,1fr)_6rem_2rem] items-start gap-x-3 gap-y-2 @min-[36rem]:grid-cols-[minmax(0,11rem)_6rem_minmax(0,1fr)_2rem]">
                <label className="grid min-w-0 gap-1">
                  <span className={label}>{strings.rubricLevelName}</span>
                  <Input
                    id={field(level.id, "title")}
                    dir={level.title ? "auto" : undefined}
                    maxLength={80}
                    aria-label={strings.rubricLevelNameOf(
                      formatNumber(index + 1),
                    )}
                    aria-invalid={problem?.title ? true : undefined}
                    aria-describedby={problem ? problemId : undefined}
                    value={level.title}
                    className="max-md:h-10"
                    onChange={(event) =>
                      change(level.id, { title: event.target.value })
                    }
                  />
                </label>
                <label className="grid min-w-0 gap-1">
                  <span className={cn(label, "text-end")}>
                    {strings.rubricLevelPoints}
                  </span>
                  <PointsInput
                    id={field(level.id, "points")}
                    label={strings.rubricLevelPointsOf(name)}
                    value={level.points}
                    invalid={Boolean(problem?.points)}
                    describedBy={problem ? problemId : undefined}
                    onChange={(points) => change(level.id, { points })}
                  />
                </label>
                <label className="col-span-3 row-start-2 grid min-w-0 gap-1 @min-[36rem]:col-span-1 @min-[36rem]:col-start-3 @min-[36rem]:row-start-1">
                  <span className={label}>
                    {strings.rubricLevelDescription}
                  </span>
                  <Textarea
                    id={field(level.id, "description")}
                    dir="auto"
                    rows={1}
                    maxLength={maxDescription}
                    aria-label={strings.rubricLevelDescriptionOf(name)}
                    value={level.description}
                    className="min-h-9 resize-y py-1.5 max-md:min-h-10"
                    onChange={(event) =>
                      change(level.id, { description: event.target.value })
                    }
                  />
                </label>
                <div className="col-start-3 row-start-1 self-end @min-[36rem]:col-start-4 @min-[36rem]:self-start">
                  <ActionMenu
                    label={strings.rowActions(name)}
                    actions={actions}
                    className="max-md:size-10"
                  />
                </div>
              </div>
              {problem?.title || problem?.points ? (
                <p
                  id={problemId}
                  className="flex items-start gap-1.5 text-[13px] leading-[18px] text-destructive"
                >
                  <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                  {[problem.title, problem.points].filter(Boolean).join(" ")}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      <div>
        <GridAddButton
          label={strings.rubricAddLevel}
          disabled={levels.length >= max}
          onAdd={() => {
            const added = newLevel();
            onChange([...levels, added]);
            focusLater(field(added.id, "title"));
          }}
        />
      </div>
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
    </div>
  );
}
