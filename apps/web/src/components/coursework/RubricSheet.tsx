import type { Rubric } from "@faridalms/domain/coursework";
import type { GridColumn, GridIssue } from "@faridalms/ui/system/data-grid";

import {
  MAX_LEVEL_DESCRIPTION,
  MAX_RUBRIC_CRITERIA,
  MAX_RUBRIC_LEVELS,
  rubricSchema,
  rubricTotal,
} from "@faridalms/domain/coursework";
import { Button } from "@faridalms/ui/button";
import {
  DataGrid,
  GridAddButton,
  GridRemoveButton,
  NoteCell,
  NumberCell,
  TextCell,
  useFocusAfterRender,
} from "@faridalms/ui/system/data-grid";
import { TextField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { CheckboxRow } from "~/components/people/fields";
import { StandardsField } from "~/components/standards/StandardsField";
import * as m from "~/i18n/messages";
import { courseworkOptionsQuery } from "~/queries/coursework";
import { removeRubric, saveRubric } from "~/server/coursework";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

interface LevelDraft {
  id: string;
  title: string;
  points: number | null;
  description: string;
}

interface CriterionDraft {
  id: string;
  title: string;
  standards: string[];
  levels: LevelDraft[];
}

/** A four-step scale from beyond the expectation down to its start. */
const STARTING_LEVELS: readonly [() => string, number][] = [
  [m.rubricLevelExceeds, 4],
  [m.rubricLevelMeets, 3],
  [m.rubricLevelApproaching, 2],
  [m.rubricLevelBeginning, 1],
];

const newCriterion = (): CriterionDraft => ({
  id: crypto.randomUUID(),
  title: "",
  standards: [],
  levels: STARTING_LEVELS.map(([title, points]) => ({
    id: crypto.randomUUID(),
    title: title(),
    points,
    description: "",
  })),
});

const draftOf = (rubric: Rubric | null): CriterionDraft[] =>
  rubric
    ? rubric.criteria.map((criterion) => ({
        id: criterion.id,
        title: criterion.title,
        standards: [...(criterion.standards ?? [])],
        levels: criterion.levels.map((level) => ({
          id: level.id,
          title: level.title,
          points: level.points,
          description: level.description ?? "",
        })),
      }))
    : [newCriterion()];

const pointsOf = (value: number | null) =>
  value !== null && value >= 0 && value <= 10_000 ? value : null;

/** The rubric as it is kept, or null while something in it is missing. */
function rubricOf(criteria: readonly CriterionDraft[]): Rubric | null {
  const parsed = v.safeParse(rubricSchema, {
    criteria: criteria.map((criterion) => ({
      id: criterion.id,
      title: criterion.title,
      ...(criterion.standards.length ? { standards: criterion.standards } : {}),
      levels: criterion.levels.map((level) => ({
        id: level.id,
        title: level.title,
        points: pointsOf(level.points) ?? -1,
        ...(level.description.trim() ? { description: level.description } : {}),
      })),
    })),
  });
  return parsed.success ? parsed.output : null;
}

const levelCell = (level: LevelDraft, field: "title" | "points" | "about") =>
  `level-${level.id}-${field}`;

const levelName = (level: LevelDraft, index: number) =>
  level.title || formatNumber(index + 1);

/** What stops a criterion's levels being used, each tied to its cell. */
function levelIssues(criterion: CriterionDraft): GridIssue[] {
  return criterion.levels.flatMap((level, index) => [
    ...(level.title.trim()
      ? []
      : [
          {
            target: levelCell(level, "title"),
            label: m.rubricLevelTitle({ number: formatNumber(index + 1) }),
            message: m.rubricLevelNeeded(),
          },
        ]),
    ...(pointsOf(level.points) === null
      ? [
          {
            target: levelCell(level, "points"),
            label: m.rubricLevelPoints({ level: levelName(level, index) }),
            message: m.rubricPointsNeeded(),
          },
        ]
      : []),
  ]);
}

interface LevelGridOptions {
  levels: LevelDraft[];
  change: (id: string, patch: Partial<LevelDraft>) => void;
  remove: (id: string) => void;
}

// Built per render: headers read the request's locale.
function levelGrid({ levels, change, remove }: LevelGridOptions) {
  const at = (level: LevelDraft) => levels.indexOf(level);
  const rowHeader = {
    header: m.rubricLevels(),
    cell: (level: LevelDraft) => (
      <TextCell
        id={levelCell(level, "title")}
        label={m.rubricLevelTitle({ number: formatNumber(at(level) + 1) })}
        placeholder={m.rubricLevelTitlePlaceholder()}
        maxLength={80}
        value={level.title}
        onChange={(title) => change(level.id, { title })}
      />
    ),
  };
  const columns: GridColumn<LevelDraft>[] = [
    {
      id: "points",
      header: m.rubricPointsHeader(),
      numeric: true,
      cell: (level) => (
        <NumberCell
          id={levelCell(level, "points")}
          label={m.rubricLevelPoints({ level: levelName(level, at(level)) })}
          decimals={2}
          value={level.points}
          onChange={(points) => change(level.id, { points })}
        />
      ),
    },
  ];
  const rowEnd = (level: LevelDraft) => (
    <GridRemoveButton
      label={m.rubricRemoveLevel({ level: levelName(level, at(level)) })}
      disabled={levels.length <= 1}
      onRemove={() => remove(level.id)}
    />
  );
  const rowDetail = (level: LevelDraft) => (
    <NoteCell
      id={levelCell(level, "about")}
      label={m.rubricLevelDescription({ level: levelName(level, at(level)) })}
      placeholder={m.rubricLevelDescriptionPlaceholder()}
      maxLength={MAX_LEVEL_DESCRIPTION}
      value={level.description}
      onChange={(description) => change(level.id, { description })}
    />
  );
  return { rowHeader, columns, rowEnd, rowDetail };
}

interface CriterionEditorProps {
  criterion: CriterionDraft;
  index: number;
  shown: boolean;
  removable: boolean;
  onChange: (patch: Partial<CriterionDraft>) => void;
  onRemove: () => void;
}

/**
 * One criterion: what it judges, its levels as rows with their points and
 * what work at each looks like, and the standards it counts toward.
 */
function CriterionEditor({
  criterion,
  index,
  shown,
  removable,
  onChange,
  onRemove,
}: CriterionEditorProps) {
  const focusLater = useFocusAfterRender();
  const number = formatNumber(index + 1);
  const name = criterion.title || m.rubricCriterion({ number });
  const top = Math.max(
    0,
    ...criterion.levels.map((level) => pointsOf(level.points) ?? 0),
  );
  const changeLevel = (id: string, patch: Partial<LevelDraft>) =>
    onChange({
      levels: criterion.levels.map((level) =>
        level.id === id ? { ...level, ...patch } : level,
      ),
    });
  return (
    <section
      aria-label={name}
      className="grid min-w-0 gap-3 border-t pt-5 first-of-type:border-t-0 first-of-type:pt-0"
    >
      <div className="flex items-end gap-2">
        <TextField
          id={`criterion-${criterion.id}`}
          className="min-w-0 flex-1"
          label={m.rubricCriterion({ number })}
          placeholder={m.rubricCriterionPlaceholder()}
          maxLength={120}
          dir="auto"
          value={criterion.title}
          onChange={(event) => onChange({ title: event.target.value })}
          errors={
            shown && !criterion.title.trim() ? [m.rubricCriterionNeeded()] : []
          }
        />
        {removable ? (
          <span className="mb-0.5">
            <GridRemoveButton
              label={m.rubricRemoveCriterion({
                name: criterion.title || number,
              })}
              onRemove={onRemove}
            />
          </span>
        ) : null}
      </div>
      <DataGrid<LevelDraft>
        caption={m.rubricLevelsOf({ criterion: name })}
        editing
        surface="sheet"
        {...levelGrid({
          levels: criterion.levels,
          change: changeLevel,
          remove: (id) =>
            onChange({
              levels: criterion.levels.filter((level) => level.id !== id),
            }),
        })}
        groups={[{ id: "levels", title: "", rows: criterion.levels }]}
        rowKey={(level) => level.id}
        totals={{
          label: m.rubricTopPoints(),
          cells: { points: formatNumber(top) },
        }}
        issues={shown ? levelIssues(criterion) : []}
        footer={
          <GridAddButton
            label={m.rubricAddLevel()}
            disabled={criterion.levels.length >= MAX_RUBRIC_LEVELS}
            onAdd={() => {
              const added: LevelDraft = {
                id: crypto.randomUUID(),
                title: "",
                points: 0,
                description: "",
              };
              onChange({ levels: [...criterion.levels, added] });
              focusLater(levelCell(added, "title"));
            }}
          />
        }
      />
      <StandardsField
        label={m.rubricStandards()}
        hint={m.rubricStandardsHint()}
        value={criterion.standards}
        onChange={(standards) => onChange({ standards })}
      />
    </section>
  );
}

export interface RubricSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rubric: Rubric | null;
  /** The teacher's own rubric it began as, which saving changes too. */
  kept: { id: string; title: string } | null;
  /** The rubric written, and the id it is kept under, or empty. */
  onUse: (rubric: Rubric, keptId: string) => void;
  /** The rubric it began as is no longer among the teacher's own. */
  onForget: () => void;
}

/**
 * Writes the rubric a piece of work is graded by: criteria, each with the
 * levels a grader chooses between, their points and what work at each
 * looks like, and the standards a level counts toward. It may be kept among
 * the teacher's own rubrics to use again.
 */
export function RubricSheet({
  open,
  onOpenChange,
  rubric,
  kept,
  onUse,
  onForget,
}: RubricSheetProps) {
  const queryClient = useQueryClient();
  const [criteria, setCriteria] = useState(() => draftOf(rubric));
  const [keep, setKeep] = useState(false);
  const [title, setTitle] = useState(kept?.title ?? "");
  const [shown, setShown] = useState(false);
  const save = useMutation({
    mutationFn: (written: Rubric) =>
      saveRubric({
        data: { ...(kept ? { id: kept.id } : {}), title, rubric: written },
      }),
    onSuccess: async (saved, written) => {
      await queryClient.invalidateQueries({
        queryKey: courseworkOptionsQuery.queryKey,
      });
      onUse(written, saved.id);
      onOpenChange(false);
    },
  });
  const forget = useMutation({
    mutationFn: (id: string) => removeRubric({ data: { id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: courseworkOptionsQuery.queryKey,
      });
      setKeep(false);
      onForget();
      toast.success(m.rubricForgotten());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const written = rubricOf(criteria);
  const total = written
    ? rubricTotal(written)
    : criteria.reduce(
        (sum, criterion) =>
          sum +
          Math.max(
            0,
            ...criterion.levels.map((level) => pointsOf(level.points) ?? 0),
          ),
        0,
      );
  const change = (index: number, patch: Partial<CriterionDraft>) =>
    setCriteria(
      criteria.map((row, at) => (at === index ? { ...row, ...patch } : row)),
    );
  const titleMissing = shown && keep && !title.trim();
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title={m.rubricSheetTitle()}
      submitLabel={m.rubricUse()}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={() => {
        setShown(true);
        if (!written || (keep && !title.trim())) return;
        if (keep) save.mutate(written);
        else {
          onUse(written, "");
          onOpenChange(false);
        }
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {m.rubricSheetHint()}
      </p>
      {criteria.map((criterion, index) => (
        <CriterionEditor
          key={criterion.id}
          criterion={criterion}
          index={index}
          shown={shown}
          removable={criteria.length > 1}
          onChange={(patch) => change(index, patch)}
          onRemove={() => setCriteria(criteria.filter((_, at) => at !== index))}
        />
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {criteria.length < MAX_RUBRIC_CRITERIA ? (
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={() => setCriteria([...criteria, newCriterion()])}
          >
            <Plus aria-hidden />
            {m.rubricAddCriterion()}
          </Button>
        ) : (
          <span />
        )}
        <p className="text-sm leading-5 text-muted-foreground tabular-nums">
          {m.rubricTotalPoints({ points: formatNumber(total) })}
        </p>
      </div>
      <div className="grid gap-3 border-t pt-4">
        <CheckboxRow
          label={
            kept ? m.rubricKeepChanges({ title: kept.title }) : m.rubricKeep()
          }
          hint={m.rubricKeepHint()}
          checked={keep}
          onChange={setKeep}
        />
        {keep ? (
          <TextField
            id="rubric-title"
            label={m.rubricName()}
            maxLength={120}
            dir="auto"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            errors={titleMissing ? [m.rubricNameNeeded()] : []}
          />
        ) : null}
        {kept ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-ms-2 w-fit text-destructive hover:text-destructive max-md:h-10"
            disabled={forget.isPending}
            onClick={() => forget.mutate(kept.id)}
          >
            <Trash2 aria-hidden />
            {m.rubricForget({ title: kept.title })}
          </Button>
        ) : null}
      </div>
    </SheetForm>
  );
}
