import type { Rubric } from "@faridalms/domain/coursework";
import type {
  RubricCriterion,
  RubricLevelDraft,
  RubricLevelErrors,
} from "@faridalms/ui/system/rubric";

import {
  MAX_LEVEL_DESCRIPTION,
  MAX_RUBRIC_CRITERIA,
  MAX_RUBRIC_LEVELS,
  rubricSchema,
} from "@faridalms/domain/coursework";
import { Button } from "@faridalms/ui/button";
import { ActionMenu } from "@faridalms/ui/system/action-menu";
import {
  GridAddButton,
  useFocusAfterRender,
} from "@faridalms/ui/system/data-grid";
import { TextField } from "@faridalms/ui/system/form-field";
import {
  RubricLevelEditor,
  rubricLevelFieldId,
  RubricMatrix,
} from "@faridalms/ui/system/rubric";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Copy, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { CheckboxRow } from "~/components/people/fields";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { courseworkOptionsQuery } from "~/queries/coursework";
import { removeRubric, saveRubric } from "~/server/coursework";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { criterionStandards } from "./slots";

interface CriterionDraft {
  id: string;
  title: string;
  standards: string[];
  levels: RubricLevelDraft[];
}

/** A four-step scale from beyond the expectation down to its start. */
const STARTING_LEVELS: readonly [() => string, number][] = [
  [m.rubricLevelExceeds, 4],
  [m.rubricLevelMeets, 3],
  [m.rubricLevelApproaching, 2],
  [m.rubricLevelBeginning, 1],
];

const newLevel = (): RubricLevelDraft => ({
  id: crypto.randomUUID(),
  title: "",
  points: 0,
  description: "",
});

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

const copyOf = (criterion: CriterionDraft): CriterionDraft => ({
  id: crypto.randomUUID(),
  title: criterion.title
    ? m.rubricCopyOf({ title: criterion.title }).slice(0, 120)
    : "",
  standards: [...criterion.standards],
  levels: criterion.levels.map((level) => ({
    ...level,
    id: crypto.randomUUID(),
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

/** What stops a criterion being used: its name, then each level's. */
function problemsOf(criterion: CriterionDraft) {
  const levels: Record<string, RubricLevelErrors> = {};
  for (const level of criterion.levels) {
    const errors: RubricLevelErrors = {
      ...(level.title.trim() ? {} : { title: m.rubricLevelNeeded() }),
      ...(pointsOf(level.points) === null
        ? { points: m.rubricPointsNeeded() }
        : {}),
    };
    if (errors.title || errors.points) levels[level.id] = errors;
  }
  const name = criterion.title.trim() ? null : m.rubricCriterionNeeded();
  return { name, levels, any: Boolean(name) || Object.keys(levels).length > 0 };
}

const nameField = (criterion: CriterionDraft) => `criterion-${criterion.id}`;
const editButton = (criterion: CriterionDraft) =>
  `criterion-${criterion.id}-edit`;

/** The first field to fix in a criterion, by the order it is read. */
function firstProblem(criterion: CriterionDraft): string {
  const problems = problemsOf(criterion);
  if (problems.name) return nameField(criterion);
  for (const level of criterion.levels) {
    const errors = problems.levels[level.id];
    if (errors?.title) return rubricLevelFieldId("level", level.id, "title");
    if (errors?.points) return rubricLevelFieldId("level", level.id, "points");
  }
  return nameField(criterion);
}

interface Writing {
  id: string;
  /** The criterion as it was when opened; null when it was just added. */
  before: CriterionDraft | null;
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
 * Writes the rubric a piece of work is graded by, read as the matrix of
 * criteria by levels that the grader and the student see, with one
 * criterion at a time opened in place to change its name, its levels'
 * names, points and descriptions, and the standards it counts toward. It
 * may be kept among the teacher's own rubrics to use again.
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
  const focusLater = useFocusAfterRender();
  const Standards = useSlot(criterionStandards)[0];
  const [criteria, setCriteria] = useState(() => draftOf(rubric));
  const [writing, setWriting] = useState<Writing | null>(() =>
    rubric ? null : { id: criteria[0]?.id ?? "", before: null },
  );
  const [shown, setShown] = useState(false);
  const [said, setSaid] = useState("");
  const [keep, setKeep] = useState(false);
  const [title, setTitle] = useState(kept?.title ?? "");
  const [titleShown, setTitleShown] = useState(false);
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
  const current = criteria.find((row) => row.id === writing?.id) ?? null;
  const numberOf = (criterion: CriterionDraft) =>
    formatNumber(criteria.indexOf(criterion) + 1);
  const nameOf = (criterion: CriterionDraft) =>
    criterion.title.trim() ||
    m.rubricCriterion({ number: numberOf(criterion) });
  const change = (id: string, patch: Partial<CriterionDraft>) =>
    setCriteria((rows) =>
      rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  /** Closes the open criterion, or shows what it lacks and keeps it open. */
  const finish = (): boolean => {
    if (!current) return true;
    if (problemsOf(current).any) {
      setShown(true);
      focusLater(firstProblem(current));
      return false;
    }
    setShown(false);
    setWriting(null);
    return true;
  };
  const edit = (criterion: CriterionDraft) => {
    if (!finish()) return;
    setWriting({ id: criterion.id, before: criterion });
    focusLater(nameField(criterion));
  };
  const cancel = () => {
    if (!writing) return;
    const before = writing.before;
    setShown(false);
    setWriting(null);
    if (before) {
      setCriteria((rows) =>
        rows.map((row) => (row.id === before.id ? before : row)),
      );
      focusLater(editButton(before));
    } else {
      setCriteria((rows) => rows.filter((row) => row.id !== writing.id));
    }
  };
  const move = (criterion: CriterionDraft, by: -1 | 1) => {
    const index = criteria.indexOf(criterion);
    const target = index + by;
    if (target < 0 || target >= criteria.length) return;
    const next = criteria.filter((row) => row.id !== criterion.id);
    next.splice(target, 0, criterion);
    setCriteria(next);
    setSaid(
      m.rubricCriterionMoved({
        name: nameOf(criterion),
        position: formatNumber(target + 1),
      }),
    );
    focusLater(editButton(criterion));
  };
  const add = (criterion: CriterionDraft, at = criteria.length) => {
    if (!finish()) return;
    const next = [...criteria];
    next.splice(at, 0, criterion);
    setCriteria(next);
    setWriting({ id: criterion.id, before: null });
    focusLater(nameField(criterion));
  };
  const titleMissing = titleShown && keep && !title.trim();
  const shownCriteria: RubricCriterion[] = criteria.map((criterion) => ({
    id: criterion.id,
    title: nameOf(criterion),
    levels: criterion.levels,
  }));
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title={m.rubricSheetTitle()}
      submitLabel={m.rubricUse()}
      size="wide"
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={() => {
        setTitleShown(true);
        if (!finish()) return;
        const written = rubricOf(criteria);
        if (!written) {
          const broken = criteria.find((row) => problemsOf(row).any);
          if (broken) {
            setWriting({ id: broken.id, before: broken });
            setShown(true);
            focusLater(firstProblem(broken));
          }
          return;
        }
        if (keep && !title.trim()) return;
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
      <div className="grid gap-3">
        <RubricMatrix
          label={m.rubricSheetTitle()}
          criteria={shownCriteria}
          showTotal
          renderCriterionMeta={(row) => {
            const count =
              criteria.find((draft) => draft.id === row.id)?.standards.length ??
              0;
            return count ? m.rubricStandardsCount({ count }) : null;
          }}
          renderCriterionActions={(row, index) => {
            const criterion = criteria[index];
            if (!criterion) return null;
            const name = nameOf(criterion);
            return (
              <>
                <Button
                  id={editButton(criterion)}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="max-md:h-10"
                  aria-label={m.rubricEditCriterion({ name })}
                  onClick={() => edit(criterion)}
                >
                  <Pencil aria-hidden />
                  {m.recordEdit()}
                </Button>
                <ActionMenu
                  label={m.indexRowActions({ name: row.title })}
                  className="max-md:size-10"
                  actions={[
                    ...(index > 0
                      ? [
                          {
                            label: m.rubricMoveUp(),
                            icon: ArrowUp,
                            onSelect: () => move(criterion, -1),
                          },
                        ]
                      : []),
                    ...(index < criteria.length - 1
                      ? [
                          {
                            label: m.rubricMoveDown(),
                            icon: ArrowDown,
                            onSelect: () => move(criterion, 1),
                          },
                        ]
                      : []),
                    ...(criteria.length < MAX_RUBRIC_CRITERIA
                      ? [
                          {
                            label: m.rubricDuplicate(),
                            icon: Copy,
                            onSelect: () => add(copyOf(criterion), index + 1),
                          },
                        ]
                      : []),
                    ...(criteria.length > 1
                      ? [
                          {
                            label: m.rubricRemove(),
                            icon: Trash2,
                            destructive: true as const,
                            confirm: {
                              title: m.rubricRemoveCriterionTitle({ name }),
                              body: m.rubricRemoveCriterionBody(),
                              label: m.rubricRemove(),
                            },
                            onSelect: () =>
                              setCriteria((rows) =>
                                rows.filter(
                                  (other) => other.id !== criterion.id,
                                ),
                              ),
                          },
                        ]
                      : []),
                  ]}
                />
              </>
            );
          }}
          editing={
            current
              ? {
                  criterionId: current.id,
                  onDone: () => {
                    const closed = current;
                    if (finish()) focusLater(editButton(closed));
                  },
                  ...(writing?.before || criteria.length > 1
                    ? { onCancel: cancel }
                    : {}),
                  content: (
                    <>
                      <TextField
                        id={nameField(current)}
                        className="max-w-[30rem]"
                        label={m.rubricCriterion({
                          number: numberOf(current),
                        })}
                        placeholder={m.rubricCriterionPlaceholder()}
                        maxLength={120}
                        dir="auto"
                        value={current.title}
                        onChange={(event) =>
                          change(current.id, { title: event.target.value })
                        }
                        errors={
                          shown && !current.title.trim()
                            ? [m.rubricCriterionNeeded()]
                            : []
                        }
                      />
                      <RubricLevelEditor
                        idPrefix="level"
                        levels={current.levels}
                        onChange={(levels) => change(current.id, { levels })}
                        newLevel={newLevel}
                        max={MAX_RUBRIC_LEVELS}
                        maxDescription={MAX_LEVEL_DESCRIPTION}
                        errors={shown ? problemsOf(current).levels : undefined}
                      />
                      {Standards ? (
                        <Standards
                          value={current.standards}
                          onChange={(standards) =>
                            change(current.id, { standards })
                          }
                        />
                      ) : null}
                    </>
                  ),
                }
              : null
          }
        />
        {criteria.length < MAX_RUBRIC_CRITERIA ? (
          <div>
            <GridAddButton
              label={m.rubricAddCriterion()}
              onAdd={() => add(newCriterion())}
            />
          </div>
        ) : null}
        <p aria-live="polite" className="sr-only">
          {said}
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
