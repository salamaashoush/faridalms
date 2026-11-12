import { cycleDays, timetableOn } from "@faridalms/domain/cycle";
import { Button } from "@faridalms/ui/button";
import { SelectField } from "@faridalms/ui/system/form-field";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type {
  DayPlannerPart,
  PlannerAsideProps,
  PlannerDay,
} from "~/components/school-days/slots";

import { refreshDays } from "~/components/school-days/DayPlanner";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { timetableDaysQuery } from "~/queries/periods";
import { runDayAs, scheduleDays } from "~/server/periods";
import { formatDate, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { cycleDayLabel } from "./cycle";

type Read = Awaited<
  ReturnType<NonNullable<ReturnType<typeof timetableDaysQuery>["queryFn"]>>
>;

const asRead = (read: unknown) => read as Read;

function namesOf(read: Read) {
  const settingOf = new Map(read.days.map((row) => [row.day, row]));
  const scheduleName = (id: string) => {
    const found = read.schedules.find((row) => row.id === id);
    return found ? inLocale(found.nameEn, found.nameAr) : "";
  };
  const runsAsName = (day: string, runsAs: number) =>
    cycleDayLabel(timetableOn(read.timetables, day), runsAs);
  return { settingOf, scheduleName, runsAsName };
}

interface ScheduleRun {
  from: string;
  to: string;
  scheduleId: string;
}

/** Days on a bell schedule grouped into runs of the same schedule, closed days between them bridged. */
function scheduleRunsOf(
  read: Read,
  days: readonly PlannerDay[],
): ScheduleRun[] {
  const scheduleOf = new Map(
    read.days.flatMap((row) =>
      row.scheduleId ? [[row.day, row.scheduleId] as const] : [],
    ),
  );
  const runs: ScheduleRun[] = [];
  for (const day of days) {
    const scheduleId = scheduleOf.get(day.day);
    if (!scheduleId) continue;
    const last = runs.at(-1);
    const bridged =
      last &&
      days
        .filter((one) => one.day > last.to && one.day < day.day)
        .every((one) => !one.open);
    if (last && bridged && last.scheduleId === scheduleId) last.to = day.day;
    else runs.push({ from: day.day, to: day.day, scheduleId });
  }
  return runs;
}

interface ScheduleFormProps {
  range: { from: string; to: string };
  schedules: Read["schedules"];
  scheduleName: (id: string) => string;
  onDone: () => void;
}

/** Runs the chosen days on a bell schedule, or back on their periods' own times. */
function ScheduleForm({
  range,
  schedules,
  scheduleName,
  onDone,
}: ScheduleFormProps) {
  const queryClient = useQueryClient();
  const [scheduleId, setScheduleId] = useState(schedules[0]?.id ?? "");
  const apply = useMutation({
    mutationFn: () => scheduleDays({ data: { ...range, scheduleId } }),
    onSuccess: async (result) => {
      await refreshDays(queryClient);
      toast.success(
        m.plannerScheduled({ count: formatNumber(result.changed) }),
      );
      onDone();
    },
  });
  return (
    <form
      className="grid gap-4 rounded-lg border bg-card p-4 print:hidden"
      onSubmit={(event) => {
        event.preventDefault();
        apply.mutate();
      }}
    >
      <SelectField
        id="planner-schedule"
        label={m.plannerSchedule()}
        hint={m.plannerScheduleHint()}
        width="name"
        value={scheduleId}
        options={[
          ...schedules.map((row) => ({
            value: row.id,
            label: scheduleName(row.id),
          })),
          { value: "", label: m.plannerScheduleOwn() },
        ]}
        onChange={setScheduleId}
      />
      {apply.error ? (
        <p role="alert" className="text-sm text-destructive">
          {getMessageFromError(apply.error)}
        </p>
      ) : null}
      <Button
        type="submit"
        variant="outline"
        className="justify-self-start max-md:h-10"
        disabled={apply.isPending}
      >
        {m.plannerScheduleApply()}
      </Button>
    </form>
  );
}

interface RunAsFormProps {
  day: string;
  current: number | null;
  options: { value: number; label: string }[];
  onDone: () => void;
}

/** Runs one school day as another day of its timetable's cycle, or as its own. */
function RunAsForm({ day, current, options, onDone }: RunAsFormProps) {
  const queryClient = useQueryClient();
  const [runsAs, setRunsAs] = useState(current === null ? "" : String(current));
  const apply = useMutation({
    mutationFn: () =>
      runDayAs({ data: { day, runsAs: runsAs ? Number(runsAs) : null } }),
    onSuccess: async () => {
      await refreshDays(queryClient);
      toast.success(m.plannerRunsAsSaved());
      onDone();
    },
  });
  return (
    <form
      className="grid gap-4 rounded-lg border bg-card p-4 print:hidden"
      onSubmit={(event) => {
        event.preventDefault();
        apply.mutate();
      }}
    >
      <SelectField
        id="planner-runs-as"
        label={m.plannerRunsAs()}
        hint={m.plannerRunsAsHint()}
        width="name"
        value={runsAs}
        options={[
          { value: "", label: m.plannerRunsAsOwn() },
          ...options.map((option) => ({
            value: String(option.value),
            label: option.label,
          })),
        ]}
        onChange={setRunsAs}
      />
      {apply.error ? (
        <p role="alert" className="text-sm text-destructive">
          {getMessageFromError(apply.error)}
        </p>
      ) : null}
      <Button
        type="submit"
        variant="outline"
        className="justify-self-start max-md:h-10"
        disabled={apply.isPending}
      >
        {m.plannerRunsAsApply()}
      </Button>
    </form>
  );
}

/** The timetable's panels beside the school's days: what the chosen days run on, and the days that run otherwise. */
function TimetableAside({
  read: raw,
  days,
  range,
  canEdit,
  onDone,
}: PlannerAsideProps) {
  const read = asRead(raw);
  const queryClient = useQueryClient();
  const { settingOf, scheduleName, runsAsName } = namesOf(read);
  const ownDay = useMutation({
    mutationFn: (day: string) => runDayAs({ data: { day, runsAs: null } }),
    onSuccess: () => refreshDays(queryClient),
  });
  const ownTimes = useMutation({
    mutationFn: (run: ScheduleRun) =>
      scheduleDays({ data: { from: run.from, to: run.to, scheduleId: "" } }),
    onSuccess: () => refreshDays(queryClient),
  });
  const single =
    range && range.from === range.to
      ? days.find((day) => day.day === range.from)
      : undefined;
  const singleCycle = single ? timetableOn(read.timetables, single.day) : null;
  const runsAsOptions =
    single && singleCycle && single.open
      ? cycleDays(singleCycle, read.weekdays).map((value) => ({
          value,
          label: cycleDayLabel(singleCycle, value),
        }))
      : [];
  const ranAs = read.days.filter((row) => row.runsAs !== null);
  const scheduleRuns = scheduleRunsOf(read, days);
  return (
    <>
      {range && canEdit && read.schedules.length > 0 ? (
        <ScheduleForm
          key={`schedule-${range.from}-${range.to}`}
          range={range}
          schedules={read.schedules}
          scheduleName={scheduleName}
          onDone={onDone}
        />
      ) : null}
      {single && canEdit && runsAsOptions.length > 0 ? (
        <RunAsForm
          key={`runs-as-${single.day}`}
          day={single.day}
          current={settingOf.get(single.day)?.runsAs ?? null}
          options={runsAsOptions}
          onDone={onDone}
        />
      ) : null}
      {ranAs.length > 0 ? (
        <section
          aria-labelledby="planner-runs-as-list"
          className="grid gap-2 rounded-lg border bg-card p-4"
        >
          <h3 id="planner-runs-as-list" className="text-sm font-semibold">
            {m.plannerRunsAsList()}
          </h3>
          <ul className="grid gap-2">
            {ranAs.map((day) => (
              <li key={day.day} className="flex items-start gap-2 text-sm">
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="font-medium">
                    {formatDate(day.day, "weekday")}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {m.plannerRunsAsDay({
                      day: runsAsName(day.day, day.runsAs ?? 0),
                    })}
                  </span>
                </span>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="max-md:size-10 print:hidden"
                    aria-label={m.plannerRunsAsReset({
                      day: formatDate(day.day),
                    })}
                    disabled={ownDay.isPending}
                    onClick={() => ownDay.mutate(day.day)}
                  >
                    <RotateCcw aria-hidden />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {scheduleRuns.length > 0 ? (
        <section
          aria-labelledby="planner-scheduled"
          className="grid gap-2 rounded-lg border bg-card p-4"
        >
          <h3 id="planner-scheduled" className="text-sm font-semibold">
            {m.plannerScheduledList()}
          </h3>
          <ul className="grid gap-2">
            {scheduleRuns.map((run) => (
              <li key={run.from} className="flex items-start gap-2 text-sm">
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="font-medium">
                    {run.from === run.to
                      ? formatDate(run.from)
                      : m.plannerRange({
                          from: formatDate(run.from),
                          to: formatDate(run.to),
                        })}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {scheduleName(run.scheduleId)}
                  </span>
                </span>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="max-md:size-10 print:hidden"
                    aria-label={m.plannerScheduleReset()}
                    disabled={ownTimes.isPending}
                    onClick={() => ownTimes.mutate(run)}
                  >
                    <RotateCcw aria-hidden />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

/** What the timetable adds to the school's days: the bell schedule each runs on, and the day of the cycle it runs as. */
export const timetableDayPart: DayPlannerPart = {
  key: "timetable",
  query: (from, to) => timetableDaysQuery(from, to),
  dayOf: (raw, day) => {
    const read = asRead(raw);
    const { settingOf, scheduleName, runsAsName } = namesOf(read);
    const setting = settingOf.get(day.day);
    if (!setting) return null;
    return {
      words: [
        setting.scheduleId
          ? m.plannerOnSchedule({ name: scheduleName(setting.scheduleId) })
          : "",
        setting.runsAs && day.open
          ? m.plannerRunsAsDay({ day: runsAsName(day.day, setting.runsAs) })
          : "",
      ],
      marks: (
        <>
          {setting.scheduleId ? (
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0.5 mx-auto size-1 rounded-full bg-primary"
            />
          ) : null}
          {setting.runsAs && day.open ? (
            <span
              aria-hidden
              className="absolute end-0.5 top-0.5 size-1.5 rotate-45 bg-primary"
            />
          ) : null}
        </>
      ),
    };
  },
  legend: (raw) => {
    const read = asRead(raw);
    return [
      ...(read.schedules.length > 0
        ? [
            {
              key: "schedule",
              swatch: (
                <span
                  aria-hidden
                  className="grid size-3.5 place-items-center rounded-sm border"
                >
                  <span className="size-1 rounded-full bg-primary" />
                </span>
              ),
              label: m.plannerOnAnySchedule(),
            },
          ]
        : []),
      ...(read.days.some((row) => row.runsAs !== null)
        ? [
            {
              key: "runs-as",
              swatch: (
                <span
                  aria-hidden
                  className="relative size-3.5 rounded-sm border"
                >
                  <span className="absolute end-0.5 top-0.5 size-1.5 rotate-45 bg-primary" />
                </span>
              ),
              label: m.plannerRunsAsAny(),
            },
          ]
        : []),
    ];
  },
  Aside: TimetableAside,
};
