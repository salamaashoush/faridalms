import type { Rubric } from "@faridalms/domain/coursework";

import {
  MAX_LEVEL_DESCRIPTION,
  MAX_RUBRIC_CRITERIA,
  MAX_RUBRIC_LEVELS,
  rubricSchema,
  rubricTotal,
} from "@faridalms/domain/coursework";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { CheckboxRow } from "~/components/people/fields";
import { StandardsField } from "~/components/standards/StandardsField";
import { TextField } from "~/components/system/field";
import { SheetForm } from "~/components/system/SheetForm";
import * as m from "~/i18n/messages";
import { courseworkOptionsQuery } from "~/queries/coursework";
import { removeRubric, saveRubric } from "~/server/coursework";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

interface LevelDraft {
  id: string;
  title: string;
  points: string;
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
    points: String(points),
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
          points: String(level.points),
          description: level.description ?? "",
        })),
      }))
    : [newCriterion()];

const pointsOf = (text: string) => {
  const value = Number(text);
  return text.trim() && Number.isFinite(value) && value >= 0 && value <= 10_000
    ? value
    : null;
};

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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rubric: Rubric | null;
  /** The teacher's own rubric it began as, which saving changes too. */
  kept: { id: string; title: string } | null;
  /** The rubric written, and the id it is kept under, or empty. */
  onUse: (rubric: Rubric, keptId: string) => void;
  /** The rubric it began as is no longer among the teacher's own. */
  onForget: () => void;
}) {
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
  const changeLevel = (
    index: number,
    levelIndex: number,
    patch: Partial<LevelDraft>,
  ) => {
    const criterion = criteria[index];
    if (!criterion) return;
    change(index, {
      levels: criterion.levels.map((level, at) =>
        at === levelIndex ? { ...level, ...patch } : level,
      ),
    });
  };
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
      {criteria.map((criterion, index) => {
        const number = formatNumber(index + 1);
        return (
          <fieldset
            key={criterion.id}
            className="grid min-w-0 gap-3 rounded-lg border p-3"
          >
            <legend className="sr-only">
              {criterion.title || m.rubricCriterion({ number })}
            </legend>
            <div className="flex items-end gap-2">
              <TextField
                id={`criterion-${criterion.id}`}
                className="min-w-0 flex-1"
                label={m.rubricCriterion({ number })}
                placeholder={m.rubricCriterionPlaceholder()}
                maxLength={120}
                dir="auto"
                value={criterion.title}
                onChange={(event) =>
                  change(index, { title: event.target.value })
                }
                errors={
                  shown && !criterion.title.trim()
                    ? [m.rubricCriterionNeeded()]
                    : []
                }
              />
              {criteria.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="mb-0.5 max-md:size-10"
                  aria-label={m.rubricRemoveCriterion({
                    name: criterion.title || number,
                  })}
                  onClick={() =>
                    setCriteria(criteria.filter((_, at) => at !== index))
                  }
                >
                  <Trash2 aria-hidden />
                </Button>
              ) : null}
            </div>
            <div className="grid gap-2">
              <p className="text-sm leading-5 font-medium">
                {m.rubricLevels()}
              </p>
              {criterion.levels.map((level, levelIndex) => {
                const levelName = level.title || formatNumber(levelIndex + 1);
                const badTitle = shown && !level.title.trim();
                const badPoints = shown && pointsOf(level.points) === null;
                return (
                  <div
                    key={level.id}
                    className="grid gap-1.5 rounded-md bg-muted/50 p-2"
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={m.rubricLevelTitle({
                          number: formatNumber(levelIndex + 1),
                        })}
                        aria-invalid={badTitle || undefined}
                        placeholder={m.rubricLevelTitlePlaceholder()}
                        maxLength={80}
                        dir="auto"
                        value={level.title}
                        onChange={(event) =>
                          changeLevel(index, levelIndex, {
                            title: event.target.value,
                          })
                        }
                        className="h-8 min-w-0 flex-1 bg-background max-md:h-10"
                      />
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={10_000}
                        step={0.5}
                        aria-label={m.rubricLevelPoints({ level: levelName })}
                        aria-invalid={badPoints || undefined}
                        value={level.points}
                        onChange={(event) =>
                          changeLevel(index, levelIndex, {
                            points: event.target.value,
                          })
                        }
                        className="h-8 w-20 bg-background tabular-nums max-md:h-10"
                      />
                      <span
                        aria-hidden
                        className="text-[13px] text-muted-foreground"
                      >
                        {m.rubricPointsShort()}
                      </span>
                      {criterion.levels.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="max-md:size-10"
                          aria-label={m.rubricRemoveLevel({
                            level: levelName,
                          })}
                          onClick={() =>
                            change(index, {
                              levels: criterion.levels.filter(
                                (_, at) => at !== levelIndex,
                              ),
                            })
                          }
                        >
                          <X aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                    <Textarea
                      aria-label={m.rubricLevelDescription({
                        level: levelName,
                      })}
                      placeholder={m.rubricLevelDescriptionPlaceholder()}
                      maxLength={MAX_LEVEL_DESCRIPTION}
                      dir="auto"
                      rows={2}
                      value={level.description}
                      onChange={(event) =>
                        changeLevel(index, levelIndex, {
                          description: event.target.value,
                        })
                      }
                      className="min-h-0 bg-background"
                    />
                    {badTitle || badPoints ? (
                      <p className="text-[13px] leading-[18px] text-destructive">
                        {badTitle
                          ? m.rubricLevelNeeded()
                          : m.rubricPointsNeeded()}
                      </p>
                    ) : null}
                  </div>
                );
              })}
              {criterion.levels.length < MAX_RUBRIC_LEVELS ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-ms-2 w-fit max-md:h-10"
                  onClick={() =>
                    change(index, {
                      levels: [
                        ...criterion.levels,
                        {
                          id: crypto.randomUUID(),
                          title: "",
                          points: "0",
                          description: "",
                        },
                      ],
                    })
                  }
                >
                  <Plus aria-hidden />
                  {m.rubricAddLevel()}
                </Button>
              ) : null}
            </div>
            <StandardsField
              label={m.rubricStandards()}
              hint={m.rubricStandardsHint()}
              value={criterion.standards}
              onChange={(standards) => change(index, { standards })}
            />
          </fieldset>
        );
      })}
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
