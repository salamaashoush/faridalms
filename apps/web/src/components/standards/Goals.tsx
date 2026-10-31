import type { GoalLevel } from "@faridalms/domain/standards";
import type { LucideIcon } from "lucide-react";

import { goalGroups } from "@faridalms/domain/standards";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@faridalms/ui/select";
import { Textarea } from "@faridalms/ui/textarea";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  Flag,
  NotebookPen,
} from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import type { studentProgressQuery } from "~/queries/standards";

import { displayName } from "~/components/people/format";
import { FormField, SelectField } from "~/components/system/field";
import { EmptyState } from "~/components/system/IndexPage";
import { Segmented } from "~/components/system/panel";
import {
  phoneLink,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "~/components/system/RecordPage";
import * as m from "~/i18n/messages";
import { classGoalsQuery } from "~/queries/standards";
import { addEarlyGoals, judgeGoal } from "~/server/standards";
import { formatAgo, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type GoalsData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof classGoalsQuery>["queryFn"]>>
>;
type Goal = GoalsData["goals"][number];
type Student = GoalsData["students"][number];
type Judgement = GoalsData["judgements"][number];

export const GOAL_LEVEL: Record<
  GoalLevel,
  { icon: LucideIcon; tone: string; label: () => string }
> = {
  expected: {
    icon: CircleCheck,
    tone: "text-success",
    label: m.goalsExpected,
  },
  emerging: {
    icon: CircleDashed,
    tone: "text-warning-foreground dark:text-warning",
    label: m.goalsEmerging,
  },
};

/** A judgement by its shape and colour, so neither alone carries it. */
export function GoalMark({ level }: { level: GoalLevel | null }) {
  if (!level)
    return (
      <span className="text-sm leading-5 text-muted-foreground">
        {m.goalsNotJudged()}
      </span>
    );
  const { icon: Icon, tone, label } = GOAL_LEVEL[level];
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon aria-hidden className={cn("size-4 shrink-0", tone)} />
      <span className="text-sm leading-5 font-medium">{label()}</span>
    </span>
  );
}

interface GoalGroup {
  area: Goal | null;
  goals: Goal[];
}

export const goalName = (goal: Pick<Goal, "code" | "statement">) =>
  goal.code ? `${goal.code} ${goal.statement}` : goal.statement;

function GoalPicker({
  groups,
  value,
  judged,
  onChange,
}: {
  groups: readonly GoalGroup[];
  value: string;
  /** How many children each goal is judged for, of how many. */
  judged: (goalId: string) => string;
  onChange: (id: string) => void;
}) {
  const goals = groups.flatMap((group) => group.goals);
  const at = goals.findIndex((goal) => goal.id === value);
  const previous = goals[at - 1];
  const next = goals[at + 1];
  const items = goals.map((goal) => ({
    value: goal.id,
    label: goalName(goal),
  }));
  return (
    <FormField
      label={m.goalsGoal()}
      className="min-w-0 flex-1 basis-72 md:max-w-2xl"
    >
      {(control) => (
        <div className="flex min-w-0 items-center gap-1">
          <Select
            items={items}
            value={value}
            onValueChange={(picked) => {
              if (typeof picked === "string") onChange(picked);
            }}
          >
            <SelectTrigger
              {...control}
              aria-labelledby={`${control.id}-label ${control.id}`}
              className="w-full min-w-0 max-md:data-[size=default]:h-10"
            >
              <SelectValue dir="auto" className="block min-w-0 truncate" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((group) => (
                <SelectGroup key={group.area?.id ?? "top"}>
                  {group.area ? (
                    <SelectLabel>{goalName(group.area)}</SelectLabel>
                  ) : null}
                  {group.goals.map((goal) => (
                    <SelectItem key={goal.id} value={goal.id}>
                      <span dir="auto" className="min-w-0 flex-1 truncate">
                        {goalName(goal)}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {judged(goal.id)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={m.goalsPrevious()}
            disabled={!previous}
            onClick={() => previous && onChange(previous.id)}
            className="max-md:size-10"
          >
            <ChevronLeft aria-hidden className="rtl:rotate-180" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={m.goalsNext()}
            disabled={!next}
            onClick={() => next && onChange(next.id)}
            className="max-md:size-10"
          >
            <ChevronRight aria-hidden className="rtl:rotate-180" />
          </Button>
        </div>
      )}
    </FormField>
  );
}

const LEVEL_CHOICES = ["none", "emerging", "expected"] as const;
type LevelChoice = (typeof LEVEL_CHOICES)[number];

function ChildRow({
  classId,
  student,
  goal,
  judgement,
  canJudge,
}: {
  classId: string;
  student: Student;
  goal: Goal;
  judgement: Judgement | undefined;
  canJudge: boolean;
}) {
  const queryClient = useQueryClient();
  const judge = useServerFn(judgeGoal);
  const noteId = useId();
  const [noting, setNoting] = useState(false);
  const save = useMutation({
    mutationFn: (next: { level: GoalLevel | null; note?: string }) =>
      judge({
        data: {
          classId,
          studentId: student.id,
          standardId: goal.id,
          ...next,
        },
      }),
    // The row shows what was chosen until the class reads it back.
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["standards", "goals", classId],
      }),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const level = save.isPending
    ? save.variables.level
    : (judgement?.level ?? null);
  const note =
    (save.isPending ? save.variables.note : undefined) ??
    (save.isPending && !save.variables.level ? "" : (judgement?.note ?? ""));
  const name = displayName(student);
  const options = LEVEL_CHOICES.map((value) => ({
    value,
    label: value === "none" ? m.goalsNotJudged() : GOAL_LEVEL[value].label(),
  }));
  return (
    <li className="grid gap-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="grid min-w-0 flex-1 basis-48 gap-0.5">
          <Link
            to="/students/$studentId"
            params={{ studentId: student.id }}
            search={{ tab: "skills" }}
            className={cn(
              "text-sm leading-5 font-medium hover:text-primary hover:underline",
              phoneLink,
            )}
          >
            <bdi>{name}</bdi>
          </Link>
          {judgement ? (
            <span className="text-[13px] leading-[18px] text-muted-foreground">
              {judgement.lesson
                ? m.goalsJudgedFrom({
                    lesson: judgement.lesson.title,
                    when: formatAgo(judgement.judgedAt),
                  })
                : m.goalsJudgedWhen({ when: formatAgo(judgement.judgedAt) })}
            </span>
          ) : null}
        </div>
        {canJudge ? (
          <div className="flex w-full items-center gap-1 sm:w-auto">
            <Segmented<LevelChoice>
              label={m.goalsLevelOf({ name })}
              value={level ?? "none"}
              options={options}
              onChange={(picked) =>
                save.mutate({ level: picked === "none" ? null : picked })
              }
              className="flex-1 flex-nowrap sm:w-80"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={m.goalsNoteOf({ name })}
              aria-expanded={noting}
              aria-controls={noting ? noteId : undefined}
              disabled={!level}
              onClick={() => setNoting((open) => !open)}
              className={cn(
                "max-md:size-10",
                note ? "text-primary" : "text-muted-foreground",
              )}
            >
              <NotebookPen aria-hidden />
            </Button>
          </div>
        ) : (
          <GoalMark level={level} />
        )}
      </div>
      {note && !noting ? (
        <p
          dir="auto"
          className="text-[13px] leading-[18px] whitespace-pre-line text-muted-foreground"
        >
          {note}
        </p>
      ) : null}
      {noting && level ? (
        <FormField
          id={noteId}
          label={m.goalsNote()}
          optional
          hint={m.goalsNoteHint()}
        >
          {(control) => (
            <Textarea
              {...control}
              dir="auto"
              defaultValue={note}
              maxLength={1000}
              onBlur={(event) => {
                const written = event.currentTarget.value.trim();
                if (written !== note) save.mutate({ level, note: written });
              }}
            />
          )}
        </FormField>
      ) : null}
    </li>
  );
}

function NoGoals({ canAdd, classId }: { canAdd: boolean; classId: string }) {
  const queryClient = useQueryClient();
  const add = useServerFn(addEarlyGoals);
  const adding = useMutation({
    mutationFn: () => add(),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["standards", "goals", classId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["standards", "frameworks"],
        }),
      ]),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  return (
    <EmptyState
      icon={Flag}
      title={m.goalsEmptyTitle()}
      description={canAdd ? m.goalsEmptyAdd() : m.goalsEmptyAsk()}
      action={
        canAdd ? (
          <Button
            type="button"
            disabled={adding.isPending}
            onClick={() => adding.mutate()}
          >
            {m.goalsAddEyfs()}
          </Button>
        ) : undefined
      }
    />
  );
}

/**
 * A class's children against the goals of a framework, one goal at a time,
 * each judged by their teacher from all they know of the child: expected,
 * or emerging while not yet there.
 */
export function ClassGoals({ classId }: { classId: string }) {
  const [frameworkId, setFrameworkId] = useState("");
  const data = useSuspenseQuery(classGoalsQuery(classId, frameworkId)).data;
  const groups = goalGroups(data.goals);
  const goals = groups.flatMap((group) => group.goals);
  const [picked, setPicked] = useState("");
  const goal = goals.find((row) => row.id === picked) ?? goals[0];
  if (!data.frameworkId || !goal)
    return <NoGoals canAdd={data.canAddGoals} classId={classId} />;
  const area = groups.find((group) => group.goals.includes(goal))?.area;
  const judged = new Map(
    data.judgements
      .filter((row) => row.standardId === goal.id)
      .map((row) => [row.studentId, row]),
  );
  const count = (level: GoalLevel) =>
    formatNumber(
      [...judged.values()].filter((row) => row.level === level).length,
    );
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        {data.frameworks.length > 1 ? (
          <SelectField
            label={m.goalsFramework()}
            value={data.frameworkId}
            options={data.frameworks.map((row) => ({
              value: row.id,
              label: row.title,
            }))}
            onChange={(id) => {
              setFrameworkId(id);
              setPicked("");
            }}
            className="min-w-0 basis-60"
          />
        ) : null}
        <GoalPicker
          groups={groups}
          value={goal.id}
          judged={(id) =>
            m.goalsJudgedOf({
              count: formatNumber(
                data.judgements.filter((row) => row.standardId === id).length,
              ),
              total: formatNumber(data.students.length),
            })
          }
          onChange={setPicked}
        />
      </div>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {m.goalsHow()}
      </p>
      <RecordSection
        title={goal.statement}
        description={
          <>
            {area ? <span dir="auto">{area.statement}</span> : null}
            {area ? " · " : null}
            {m.goalsCounts({
              expected: count("expected"),
              emerging: count("emerging"),
              none: formatNumber(data.students.length - judged.size),
            })}
          </>
        }
      >
        {data.students.length === 0 ? (
          <RecordEmpty>{m.lrnNoStudents()}</RecordEmpty>
        ) : (
          <RecordList>
            {data.students.map((student) => (
              <ChildRow
                key={`${goal.id}:${student.id}`}
                classId={classId}
                student={student}
                goal={goal}
                judgement={judged.get(student.id)}
                canJudge={data.canJudge}
              />
            ))}
          </RecordList>
        )}
      </RecordSection>
    </div>
  );
}

type StudentData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof studentProgressQuery>["queryFn"]>>
>;

/**
 * Where a child stands against each goal of the frameworks they have been
 * judged on, the goals not yet judged included, as their profile reads.
 */
export function StudentGoals({
  frameworks,
  judgements,
}: {
  frameworks: StudentData["goalFrameworks"];
  judgements: StudentData["judgements"];
}) {
  const judged = new Map(judgements.map((row) => [row.standardId, row]));
  return frameworks.map((framework) => {
    const groups = goalGroups(framework.goals);
    const goals = groups.flatMap((group) => group.goals);
    const count = (level: GoalLevel) =>
      formatNumber(
        goals.filter((goal) => judged.get(goal.id)?.level === level).length,
      );
    return (
      <RecordSection
        key={framework.id}
        title={framework.title}
        description={m.goalsCounts({
          expected: count("expected"),
          emerging: count("emerging"),
          none: formatNumber(
            goals.filter((goal) => !judged.has(goal.id)).length,
          ),
        })}
      >
        <div className="grid gap-5">
          {groups.map((group) => (
            <div key={group.area?.id ?? "top"} className="grid gap-1">
              {group.area ? (
                <h3
                  dir="auto"
                  className="text-[13px] leading-[18px] font-medium text-muted-foreground"
                >
                  {goalName(group.area)}
                </h3>
              ) : null}
              <ul className="grid divide-y">
                {group.goals.map((goal) => {
                  const judgement = judged.get(goal.id);
                  return (
                    <li
                      key={goal.id}
                      className="grid gap-1 py-2.5 first:pt-1 last:pb-0"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
                        <span
                          dir="auto"
                          className="min-w-0 flex-1 basis-56 text-sm leading-5"
                        >
                          {goalName(goal)}
                        </span>
                        <GoalMark level={judgement?.level ?? null} />
                      </div>
                      {judgement?.note ? (
                        <p
                          dir="auto"
                          className="text-[13px] leading-[18px] whitespace-pre-line text-muted-foreground"
                        >
                          {judgement.note}
                        </p>
                      ) : null}
                      {judgement ? (
                        <p className="text-[13px] leading-[18px] text-muted-foreground">
                          {judgement.lesson
                            ? m.goalsJudgedFrom({
                                lesson: judgement.lesson.title,
                                when: formatAgo(judgement.judgedAt),
                              })
                            : m.goalsJudgedWhen({
                                when: formatAgo(judgement.judgedAt),
                              })}
                          {judgement.judgedBy
                            ? ` · ${displayName(judgement.judgedBy)}`
                            : null}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </RecordSection>
    );
  });
}
