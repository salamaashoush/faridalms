import type { DayKind, IsoWeekday } from "@faridalms/domain/school-days";
import type { QueryClient } from "@tanstack/react-query";

import { monthWeeks } from "@faridalms/domain/calendar";
import { addDays, shiftMonth } from "@faridalms/domain/school";
import { DAY_KINDS, dayOpen, isoWeekday } from "@faridalms/domain/school-days";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import {
  useMutation,
  useQueryClient,
  useSuspenseQueries,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { Printer, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CheckboxRow } from "~/components/people/fields";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { schoolDaysQuery } from "~/queries/school-days";
import { paintSchoolDays } from "~/server/school-days";
import {
  formatWeekday,
  formatDate,
  formatMonthLabel,
  formatNumber,
} from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";
import { useWords } from "~/utils/words";

import type { DayPlannerPart, PlannerDay, PlannerDayPart } from "./slots";

import { dayPlannerParts } from "./slots";

/** How each meaning is drawn: a tint to scan, with the name in every cell's label and in the list. */
const MEANING: Record<string, { label: () => string; tint: string }> = {
  instructional_day: { label: m.dayInstructional, tint: "" },
  weekend: { label: m.dayWeekend, tint: "bg-muted text-muted-foreground" },
  public_holiday: {
    label: m.dayPublicHoliday,
    tint: "bg-rose-500/20 text-rose-900 dark:text-rose-100",
  },
  school_holiday: {
    label: m.daySchoolHoliday,
    tint: "bg-amber-500/25 text-amber-900 dark:text-amber-100",
  },
  exam_day: {
    label: m.dayExam,
    tint: "bg-violet-500/20 text-violet-900 dark:text-violet-100",
  },
  teacher_only_day: {
    label: m.dayStaff,
    tint: "bg-sky-500/20 text-sky-900 dark:text-sky-100",
  },
  early_dismissal: {
    label: m.dayEarlyDismissal,
    tint: "bg-teal-500/20 text-teal-900 dark:text-teal-100",
  },
  make_up_day: {
    label: m.dayMakeUp,
    tint: "bg-emerald-500/25 text-emerald-900 dark:text-emerald-100",
  },
  weather_closure: {
    label: m.dayWeatherClosure,
    tint: "bg-slate-500/30 text-slate-900 dark:text-slate-100",
  },
  emergency_closure: {
    label: m.dayEmergencyClosure,
    tint: "bg-slate-700/30 text-slate-900 dark:text-slate-100",
  },
  other: {
    label: m.dayOther,
    tint: "bg-orange-500/20 text-orange-900 dark:text-orange-100",
  },
};

const KIND_LABEL: Record<DayKind, () => string> = {
  normal: m.dayNormal,
  public_holiday: m.dayPublicHoliday,
  school_holiday: m.daySchoolHoliday,
  exam_day: m.dayExam,
  teacher_only_day: m.dayStaff,
  early_dismissal: m.dayEarlyDismissal,
  make_up_day: m.dayMakeUp,
  weather_closure: m.dayWeatherClosure,
  emergency_closure: m.dayEmergencyClosure,
  other: m.dayOther,
};

const OTHER = {
  label: m.dayOther,
  tint: "bg-orange-500/20 text-orange-900 dark:text-orange-100",
};

export const meaningOf = (meaning: string) => MEANING[meaning] ?? OTHER;

/** Whatever a change to the school's days moves: the days, and every view that reads them. */
export async function refreshDays(queryClient: QueryClient) {
  await Promise.all(
    [
      "school-days",
      "calendar",
      "years",
      "timetable",
      "attendance",
      "periods",
    ].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
  );
}

interface Run {
  from: string;
  to: string;
  day: PlannerDay;
}

/** Marked days grouped into runs of the same kind and note, rest days between them bridged. */
function runsOf(days: readonly PlannerDay[]): Run[] {
  const runs: Run[] = [];
  for (const day of days) {
    if (!day.marked) continue;
    const last = runs.at(-1);
    const bridged =
      last &&
      days
        .filter((one) => one.day > last.to && one.day < day.day)
        .every((one) => !one.marked && !one.open);
    if (
      last &&
      bridged &&
      last.day.meaning === day.meaning &&
      last.day.noteEn === day.noteEn &&
      last.day.noteAr === day.noteAr &&
      last.day.provisional === day.provisional
    )
      last.to = day.day;
    else runs.push({ from: day.day, to: day.day, day });
  }
  return runs;
}

interface MonthProps {
  month: string;
  weekStart: IsoWeekday;
  byDay: Map<string, PlannerDay>;
  partsOf: (day: PlannerDay) => PlannerDayPart[];
  today: string;
  selected: { from: string; to: string } | null;
  onPick: (day: string) => void;
  canEdit: boolean;
  hydrated: boolean;
}

function Month({
  month,
  weekStart,
  byDay,
  partsOf,
  today,
  selected,
  onPick,
  canEdit,
  hydrated,
}: MonthProps) {
  const weeks = monthWeeks(month, weekStart);
  return (
    <table className="w-full table-fixed border-collapse break-inside-avoid text-center text-xs">
      <caption className="pb-1.5 text-start text-sm font-semibold">
        {formatMonthLabel(month)}
      </caption>
      <thead>
        <tr>
          {weeks[0]?.map((day) => (
            <th
              key={day}
              scope="col"
              className="pb-1 font-medium text-muted-foreground"
            >
              <abbr
                title={formatWeekday(isoWeekday(day), "long")}
                className="no-underline"
              >
                {formatWeekday(isoWeekday(day), "short")}
              </abbr>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]}>
            {week.map((day) => {
              const entry = day.startsWith(month) ? byDay.get(day) : undefined;
              if (!entry) return <td key={day} aria-hidden />;
              const look = meaningOf(entry.meaning);
              const parts = partsOf(entry);
              const outside = parts.some((part) => part.outside);
              const note = inLocale(entry.noteEn, entry.noteAr);
              const chosen =
                selected !== null && selected.from <= day && day <= selected.to;
              const label = [
                formatDate(day, "weekday"),
                look.label(),
                note,
                entry.provisional ? m.plannerExpected() : "",
                ...parts.flatMap((part) => part.words),
              ]
                .filter(Boolean)
                .join(", ");
              const face = (
                <span
                  className={cn(
                    "relative grid aspect-square place-items-center rounded tabular-nums",
                    look.tint,
                    entry.provisional && "border border-dashed border-current",
                    outside &&
                      entry.open &&
                      !entry.marked &&
                      "border border-dotted border-muted-foreground/60 text-muted-foreground",
                    day === today && "ring-2 ring-foreground",
                    chosen && "outline-2 outline-offset-1 outline-primary",
                  )}
                >
                  {Number(day.slice(8))}
                  {parts.map((part, index) => (
                    <span key={index}>{part.marks}</span>
                  ))}
                </span>
              );
              return (
                <td key={day} className="p-0.5">
                  {canEdit ? (
                    <button
                      type="button"
                      aria-label={label}
                      aria-pressed={chosen}
                      disabled={!hydrated}
                      onClick={() => onPick(day)}
                      className="block w-full rounded focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {face}
                    </button>
                  ) : (
                    <span title={label}>
                      <span className="sr-only">{label}</span>
                      <span aria-hidden>{face}</span>
                    </span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface MarkFormProps {
  range: { from: string; to: string };
  onDone: () => void;
}

function MarkForm({ range, onDone }: MarkFormProps) {
  const queryClient = useQueryClient();
  const words = useWords();
  const [kind, setKind] = useState<DayKind>("school_holiday");
  const [noteEn, setNoteEn] = useState("");
  const [noteAr, setNoteAr] = useState("");
  const [provisional, setProvisional] = useState(false);
  const paint = useMutation({
    mutationFn: () =>
      paintSchoolDays({
        data: {
          ...range,
          kind,
          noteEn,
          noteAr,
          provisional: kind === "normal" ? false : provisional,
        },
      }),
    onSuccess: async (result) => {
      await refreshDays(queryClient);
      toast.success(m.plannerMarked({ count: formatNumber(result.changed) }));
      onDone();
    },
  });
  return (
    <form
      className="grid gap-4 rounded-lg border bg-card p-4 print:hidden"
      onSubmit={(event) => {
        event.preventDefault();
        paint.mutate();
      }}
    >
      <p className="text-sm font-medium">
        {range.from === range.to
          ? m.plannerMarkOne({ day: formatDate(range.from) })
          : m.plannerMarkRange({
              from: formatDate(range.from),
              to: formatDate(range.to),
            })}
      </p>
      <SelectField
        id="planner-kind"
        label={m.plannerKind()}
        width="name"
        value={kind}
        options={DAY_KINDS.map((value) => ({
          value,
          label: KIND_LABEL[value](),
        }))}
        onChange={setKind}
      />
      {kind === "normal" ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.plannerNormalHint()}
        </p>
      ) : (
        <>
          <TextField
            id="planner-note-en"
            label={m.plannerNoteEn()}
            optional
            width="name"
            dir="ltr"
            maxLength={200}
            value={noteEn}
            onChange={(event) => setNoteEn(event.target.value)}
          />
          <TextField
            id="planner-note-ar"
            label={m.plannerNoteAr()}
            optional
            width="name"
            dir="rtl"
            maxLength={200}
            value={noteAr}
            onChange={(event) => setNoteAr(event.target.value)}
          />
          <CheckboxRow
            label={m.plannerExpectedLabel()}
            hint={words(m.plannerExpectedHintCore)()}
            checked={provisional}
            onChange={setProvisional}
          />
          {kind === "make_up_day" ? null : (
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {m.plannerWeekendsKept()}
            </p>
          )}
        </>
      )}
      {paint.error ? (
        <p role="alert" className="text-sm text-destructive">
          {getMessageFromError(paint.error)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          className="max-md:h-10"
          disabled={paint.isPending}
        >
          {m.plannerApply()}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="max-md:h-10"
          onClick={onDone}
        >
          {m.commonCancel()}
        </Button>
      </div>
    </form>
  );
}

export interface DayPlannerProps {
  /** The first day shown. */
  from: string;
  /** The last day shown. */
  to: string;
}

/**
 * The school's days on one page: every month from `from` to `to`, each day
 * drawn by what it is, and a way to mark a run of days by choosing its
 * first and last day. The modules on add what they keep of each day, and
 * their panels beside the months.
 */
export function DayPlanner({ from, to }: DayPlannerProps) {
  const user = useCurrentUser();
  const hydrated = useHydrated();
  const data = useSuspenseQuery(schoolDaysQuery(from, to)).data;
  const parts = useSlot(dayPlannerParts);
  const reads = useSuspenseQueries({
    queries: parts.map((part) => part.query(from, to)),
  });
  const queryClient = useQueryClient();
  const [anchor, setAnchor] = useState<string | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const week = { weekStart: data.weekStart, weekendDays: data.weekendDays };
  const marks = new Map(data.days.map((day) => [day.day, day]));
  const days: PlannerDay[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const mark = marks.get(day);
    const open = dayOpen(week, day, mark?.meaning ?? null);
    days.push({
      day,
      meaning:
        mark?.meaning ??
        (data.weekendDays.includes(isoWeekday(day))
          ? "weekend"
          : "instructional_day"),
      marked: mark !== undefined,
      open,
      noteEn: mark?.noteEn ?? null,
      noteAr: mark?.noteAr ?? null,
      provisional: mark?.provisional ?? false,
    });
  }
  const byDay = new Map(days.map((day) => [day.day, day]));
  const partsOf = (day: PlannerDay) =>
    parts.flatMap((part: DayPlannerPart, index) => {
      const found = part.dayOf?.(reads[index]?.data, day);
      return found ? [found] : [];
    });
  const months: string[] = [];
  for (
    let month = from.slice(0, 7);
    month <= to.slice(0, 7);
    month = shiftMonth(month, 1)
  )
    months.push(month);
  const runs = runsOf(days);
  const done = () => {
    setRange(null);
    setAnchor(null);
  };
  const pick = (day: string) => {
    if (anchor === null || range === null || range.from !== range.to) {
      setAnchor(day);
      setRange({ from: day, to: day });
      return;
    }
    const [start, end] = anchor <= day ? [anchor, day] : [day, anchor];
    setRange({ from: start, to: end });
    setAnchor(null);
  };
  const reset = useMutation({
    mutationFn: (run: Run) =>
      paintSchoolDays({
        data: {
          from: run.from,
          to: run.to,
          kind: "normal",
          noteEn: "",
          noteAr: "",
          provisional: false,
        },
      }),
    onSuccess: () => refreshDays(queryClient),
  });
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] print:block">
      <div className="grid content-start gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {data.canEdit ? m.plannerHowTo() : m.plannerReadOnly()}
          </p>
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={() => window.print()}
          >
            <Printer aria-hidden />
            {m.plannerPrint()}
          </Button>
        </div>
        <div className="grid items-start gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3 print:grid-cols-3">
          {months.map((month) => (
            <Month
              key={month}
              month={month}
              weekStart={user.school.weekStart as IsoWeekday}
              byDay={byDay}
              partsOf={partsOf}
              today={user.today}
              selected={range}
              onPick={pick}
              canEdit={data.canEdit}
              hydrated={hydrated}
            />
          ))}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          {Object.entries(MEANING).map(([meaning, look]) => (
            <li key={meaning} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn("size-3.5 rounded-sm border", look.tint)}
              />
              {look.label()}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-3.5 rounded-sm border border-dashed border-current"
            />
            {m.plannerExpected()}
          </li>
          {parts.flatMap((part, index) =>
            (part.legend?.(reads[index]?.data) ?? []).map((entry) => (
              <li
                key={`${part.key}-${entry.key}`}
                className="inline-flex items-center gap-1.5"
              >
                {entry.swatch}
                {entry.label}
              </li>
            )),
          )}
        </ul>
      </div>
      <aside className="grid content-start gap-4">
        {range && data.canEdit ? (
          <MarkForm
            key={`${range.from}-${range.to}`}
            range={range}
            onDone={done}
          />
        ) : null}
        {parts.map((part, index) =>
          part.Aside ? (
            <part.Aside
              key={part.key}
              read={reads[index]?.data}
              from={from}
              to={to}
              days={days}
              range={range}
              canEdit={data.canEdit}
              onDone={done}
            />
          ) : null,
        )}
        <section
          aria-labelledby="planner-marked"
          className="grid gap-2 rounded-lg border bg-card p-4"
        >
          <h3 id="planner-marked" className="text-sm font-semibold">
            {m.plannerMarkedList()}
          </h3>
          {runs.length === 0 ? (
            <EmptyState placement="section" title={m.plannerNothingMarked()} />
          ) : (
            <ul className="grid gap-2">
              {runs.map((run) => (
                <li key={run.from} className="flex items-start gap-2 text-sm">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1 size-3 shrink-0 rounded-sm",
                      meaningOf(run.day.meaning).tint,
                    )}
                  />
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
                      {[
                        meaningOf(run.day.meaning).label(),
                        inLocale(run.day.noteEn, run.day.noteAr),
                        run.day.provisional ? m.plannerExpected() : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {data.canEdit ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="max-md:size-10 print:hidden"
                      aria-label={m.plannerResetRun()}
                      disabled={reset.isPending}
                      onClick={() => reset.mutate(run)}
                    >
                      <RotateCcw aria-hidden />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
