import type { GoalLevel } from "@faridalms/domain/standards";
import type { LucideIcon } from "lucide-react";

import { ancestorsOf, goalGroups } from "@faridalms/domain/standards";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
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
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { FormField, SelectField } from "@faridalms/ui/system/form-field";
import { Segmented } from "@faridalms/ui/system/panel";
import {
  phoneLink,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
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
  CircleSlash,
  Flag,
  NotebookPen,
  Share2,
  Sparkles,
} from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import type { studentProgressQuery } from "~/queries/standards";

import { displayName } from "~/components/people/format";
import * as m from "~/i18n/messages";
import { classGoalsQuery, goalsReportQuery } from "~/queries/standards";
import {
  addDevelopmentMatters,
  addEarlyGoals,
  judgeGoal,
  shareGoalsReport,
} from "~/server/standards";
import { formatAgo, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type GoalsData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof classGoalsQuery>["queryFn"]>>
>;
type Goal = GoalsData["goals"][number];
type Student = GoalsData["students"][number];
type Judgement = GoalsData["judgements"][number];
type RightAnswer = GoalsData["evidence"][number];

/** What a judgement was made from, as it reads under the child or goal. */
export const judgedLine = (judgement: {
  judgedAt: string;
  lesson: { title: string } | null;
  quiz: { title: string } | null;
}) => {
  const work = judgement.lesson ?? judgement.quiz;
  return work
    ? m.goalsJudgedFrom({
        lesson: work.title,
        when: formatAgo(judgement.judgedAt),
      })
    : m.goalsJudgedWhen({ when: formatAgo(judgement.judgedAt) });
};

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
  exempt: {
    icon: CircleSlash,
    tone: "text-muted-foreground",
    label: m.goalsExempt,
  },
};

export interface GoalMarkProps {
  level: GoalLevel | null;
}

/** A judgement by its shape and colour, so neither alone carries it. */
export function GoalMark({ level }: GoalMarkProps) {
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

interface Named {
  id: string;
  parentId: string | null;
  code: string;
  statement: string;
}

/** A group of goals by the whole way down to it: an area and its age band. */
const groupName = <T extends Named>(standards: readonly T[], area: T) =>
  [...ancestorsOf(standards, area.id), area].map(goalName).join(" · ");

/** How many goals or children stand where, exemptions only when there are any. */
function countsLine(levels: readonly (GoalLevel | null)[]) {
  const count = (level: GoalLevel | null) =>
    levels.filter((row) => row === level).length;
  const values = {
    expected: formatNumber(count("expected")),
    emerging: formatNumber(count("emerging")),
    none: formatNumber(count(null)),
  };
  return count("exempt") > 0
    ? m.goalsCountsExempt({ ...values, exempt: formatNumber(count("exempt")) })
    : m.goalsCounts(values);
}

interface GoalPickerProps {
  groups: readonly GoalGroup[];
  /** What a group is called, from the top of the framework down. */
  areaName: (area: Goal) => string;
  value: string;
  /** How many children each goal is judged for, of how many. */
  judged: (goalId: string) => string;
  onChange: (id: string) => void;
}

function GoalPicker({
  groups,
  areaName,
  value,
  judged,
  onChange,
}: GoalPickerProps) {
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
                    <SelectLabel>{areaName(group.area)}</SelectLabel>
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

interface ChildRowProps {
  classId: string;
  student: Student;
  goal: Goal;
  judgement: Judgement | undefined;
  /** Their latest right answer on the goal, waiting to be confirmed. */
  evidence: RightAnswer | undefined;
  canJudge: boolean;
}

function ChildRow({
  classId,
  student,
  goal,
  judgement,
  evidence,
  canJudge,
}: ChildRowProps) {
  const queryClient = useQueryClient();
  const judge = useServerFn(judgeGoal);
  const noteId = useId();
  const exemptId = useId();
  const [noting, setNoting] = useState(false);
  const save = useMutation({
    mutationFn: (next: {
      level: GoalLevel | null;
      note?: string;
      from?: RightAnswer["work"];
    }) =>
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
              {judgedLine(judgement)}
            </span>
          ) : null}
        </div>
        {canJudge ? (
          <div className="flex w-full items-center gap-1 sm:w-auto">
            {level === "exempt" ? (
              <div className="flex flex-1 items-center sm:w-80">
                <GoalMark level={level} />
              </div>
            ) : (
              <Segmented<LevelChoice>
                label={m.goalsLevelOf({ name })}
                value={level ?? "none"}
                options={options}
                onChange={(picked) =>
                  save.mutate({ level: picked === "none" ? null : picked })
                }
                className="flex-1 flex-nowrap sm:w-80"
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={m.goalsNoteOf({ name })}
              aria-expanded={noting}
              aria-controls={noting ? noteId : undefined}
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
      {evidence && canJudge && !save.isPending ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-md bg-muted/60 px-3 py-2">
          <span className="inline-flex min-w-0 flex-1 basis-56 items-start gap-1.5 text-[13px] leading-[18px]">
            <Sparkles
              aria-hidden
              className="mt-px size-4 shrink-0 text-muted-foreground"
            />
            <span>
              {m.goalsAnsweredRight({
                work: evidence.title,
                when: formatAgo(evidence.answeredAt),
              })}
            </span>
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={m.goalsConfirmExpectedOf({ name })}
            className="max-md:h-10"
            onClick={() =>
              save.mutate({ level: "expected", from: evidence.work })
            }
          >
            <CircleCheck aria-hidden />
            {m.goalsConfirmExpected()}
          </Button>
        </div>
      ) : null}
      {note && !noting ? (
        <p
          dir="auto"
          className="text-[13px] leading-[18px] whitespace-pre-line text-muted-foreground"
        >
          {note}
        </p>
      ) : null}
      {noting ? (
        <div id={noteId} className="grid gap-3">
          {level ? (
            <FormField label={m.goalsNote()} optional hint={m.goalsNoteHint()}>
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
          <div className="flex items-start gap-3">
            <Checkbox
              id={exemptId}
              aria-describedby={`${exemptId}-hint`}
              className="mt-0.5"
              checked={level === "exempt"}
              onCheckedChange={(checked) =>
                save.mutate({ level: checked ? "exempt" : null })
              }
            />
            <div className="grid gap-0.5">
              <label
                htmlFor={exemptId}
                className="text-sm leading-5 font-medium"
              >
                {m.goalsExemptFrom({ name })}
              </label>
              <p
                id={`${exemptId}-hint`}
                className="text-[13px] leading-[18px] text-muted-foreground"
              >
                {m.goalsExemptHint()}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}

interface NoGoalsProps {
  canAdd: boolean;
  classId: string;
}

function NoGoals({ canAdd, classId }: NoGoalsProps) {
  const queryClient = useQueryClient();
  const addEyfs = useServerFn(addEarlyGoals);
  const addMatters = useServerFn(addDevelopmentMatters);
  const adding = useMutation({
    mutationFn: (which: "eyfs" | "matters") =>
      which === "eyfs" ? addEyfs() : addMatters(),
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
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              disabled={adding.isPending}
              onClick={() => adding.mutate("eyfs")}
            >
              {m.goalsAddEyfs()}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={adding.isPending}
              onClick={() => adding.mutate("matters")}
            >
              {m.goalsAddMatters()}
            </Button>
          </div>
        ) : undefined
      }
    />
  );
}

interface ShareReportProps {
  classId: string;
  frameworkId: string;
  report: GoalsData["report"];
  total: number;
}

/**
 * Shares the class's report on these goals with its families, or takes it
 * back: they then read where their child stands on each goal, never the
 * notes behind it.
 */
function ShareReport({
  classId,
  frameworkId,
  report,
  total,
}: ShareReportProps) {
  const queryClient = useQueryClient();
  const share = useServerFn(shareGoalsReport);
  const sharing = useMutation({
    mutationFn: (shared: boolean) =>
      share({ data: { classId, frameworkId, shared } }),
    onSuccess: async (_, shared) => {
      await queryClient.invalidateQueries({
        queryKey: ["standards", "goals", classId],
      });
      toast.success(
        shared ? m.goalsReportSharedDone() : m.goalsReportWithdrawn(),
      );
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  if (report.shared === 0 || !report.sharedAt)
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="max-md:h-10"
        disabled={sharing.isPending || total === 0}
        onClick={() => sharing.mutate(true)}
      >
        <Share2 aria-hidden />
        {m.goalsReportShare()}
      </Button>
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[13px] leading-[18px] text-muted-foreground">
        {m.goalsReportSharedWith({
          count: formatNumber(report.shared),
          total: formatNumber(total),
          when: formatAgo(report.sharedAt),
        })}
      </span>
      {report.shared < total ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-md:h-10"
          disabled={sharing.isPending}
          onClick={() => sharing.mutate(true)}
        >
          {m.goalsReportShareAgain()}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="max-md:h-10"
        disabled={sharing.isPending}
        onClick={() => sharing.mutate(false)}
      >
        {m.goalsReportWithdraw()}
      </Button>
    </div>
  );
}

export interface ClassGoalsProps {
  classId: string;
}

/**
 * A class's children against the goals of a framework, one goal at a time,
 * each judged by their teacher from all they know of the child: expected,
 * or emerging while not yet there.
 */
export function ClassGoals({ classId }: ClassGoalsProps) {
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
  const answered = new Map(
    data.evidence
      .filter((row) => row.standardId === goal.id)
      .map((row) => [row.studentId, row]),
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
          areaName={(group) => groupName(data.goals, group)}
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
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="min-w-0 flex-1 basis-72 text-[13px] leading-[18px] text-muted-foreground">
          {m.goalsHow()}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <ShareReport
            classId={classId}
            frameworkId={data.frameworkId}
            report={data.report}
            total={data.students.length}
          />
        </div>
      </div>
      <RecordSection
        title={goal.statement}
        description={
          <>
            {area ? (
              <span dir="auto">{groupName(data.goals, area)}</span>
            ) : null}
            {area ? " · " : null}
            {countsLine(
              data.students.map(
                (student) => judged.get(student.id)?.level ?? null,
              ),
            )}
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
                evidence={answered.get(student.id)}
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

export interface StudentGoalsProps {
  frameworks: StudentData["goalFrameworks"];
  judgements: StudentData["judgements"];
}

/**
 * Where a child stands against each goal of the frameworks they have been
 * judged on, the goals not yet judged included, as their profile reads.
 */
export function StudentGoals({ frameworks, judgements }: StudentGoalsProps) {
  const judged = new Map(judgements.map((row) => [row.standardId, row]));
  return frameworks.map((framework) => {
    const groups = goalGroups(framework.goals);
    const goals = groups.flatMap((group) => group.goals);
    return (
      <RecordSection
        key={framework.id}
        title={framework.title}
        description={countsLine(
          goals.map((goal) => judged.get(goal.id)?.level ?? null),
        )}
      >
        <div className="grid gap-5">
          {groups.map((group) => (
            <div key={group.area?.id ?? "top"} className="grid gap-1">
              {group.area ? (
                <h3
                  dir="auto"
                  className="text-[13px] leading-[18px] font-medium text-muted-foreground"
                >
                  {groupName(framework.goals, group.area)}
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
                          {judgedLine(judgement)}
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

export interface GoalsReportProps {
  studentId: string;
}

/**
 * A child's goals reports as their family reads them, once their teacher
 * shares one: every goal with where the child stands, in the family's
 * language where Farida has the framework in it; nothing before.
 */
export function GoalsReport({ studentId }: GoalsReportProps) {
  const data = useSuspenseQuery(goalsReportQuery(studentId)).data;
  if (data.reports.length === 0) return null;
  return (
    <RecordSection
      variant="page"
      title={m.goalsReportTitle()}
      description={m.goalsReportFamilyHint()}
    >
      <div className="grid gap-4">
        {data.reports.map((report) => {
          const levels = new Map(
            report.levels.map((row) => [row.standardId, row.level]),
          );
          const groups = goalGroups(report.goals);
          return (
            <RecordSection
              key={report.id}
              title={report.title}
              description={
                <>
                  {m.goalsReportSharedOn({ when: formatAgo(report.sharedAt) })}
                  {" · "}
                  {countsLine(
                    groups.flatMap((group) =>
                      group.goals.map((goal) => levels.get(goal.id) ?? null),
                    ),
                  )}
                </>
              }
            >
              <div className="grid gap-5">
                {groups.map((group) => (
                  <div key={group.area?.id ?? "top"} className="grid gap-1">
                    {group.area ? (
                      <h3
                        dir="auto"
                        className="text-[13px] leading-[18px] font-medium text-muted-foreground"
                      >
                        {groupName(report.goals, group.area)}
                      </h3>
                    ) : null}
                    <ul className="grid divide-y">
                      {group.goals.map((goal) => (
                        <li
                          key={goal.id}
                          className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 py-2.5 first:pt-1 last:pb-0"
                        >
                          <span
                            dir="auto"
                            className="min-w-0 flex-1 basis-56 text-sm leading-5"
                          >
                            {goalName(goal)}
                          </span>
                          <GoalMark level={levels.get(goal.id) ?? null} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </RecordSection>
          );
        })}
      </div>
    </RecordSection>
  );
}
