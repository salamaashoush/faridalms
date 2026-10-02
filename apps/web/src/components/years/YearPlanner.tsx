import type { DayKind } from "@faridalms/domain/calendar";
import type { IsoWeekday } from "@faridalms/domain/timetable";

import {
  DAY_KINDS,
  monthWeeks,
  SCHOOL_DAY_MEANINGS,
  schoolDayCount,
} from "@faridalms/domain/calendar";
import { addDays, shiftMonth } from "@faridalms/domain/school";
import { isoWeekday } from "@faridalms/domain/timetable";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { Printer, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CheckboxRow } from "~/components/people/fields";
import { SelectField, TextField } from "~/components/system/field";
import { dayName } from "~/components/timetable/WeekGrid";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { yearDaysQuery } from "~/queries/years";
import { paintYearDays, setYearTarget } from "~/server/years";
import { formatDate, formatMonthLabel, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type Days = Awaited<
  ReturnType<NonNullable<ReturnType<typeof yearDaysQuery>["queryFn"]>>
>;
type Day = Days["days"][number];

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

const longDate = (iso: string) =>
  new Intl.DateTimeFormat(getLocale(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));

interface Run {
  from: string;
  to: string;
  day: Day;
}

/** Marked days grouped into runs of the same kind and note, weekends between them bridged. */
function runsOf(days: Day[]): Run[] {
  const runs: Run[] = [];
  for (const day of days) {
    if (day.meaning === "instructional_day" || day.meaning === "weekend")
      continue;
    const last = runs.at(-1);
    const bridged =
      last &&
      days
        .filter((one) => one.day > last.to && one.day < day.day)
        .every((one) => one.meaning === "weekend");
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

function Target({
  yearId,
  target,
  count,
  closed,
  canEdit,
}: {
  yearId: string;
  target: number | null;
  count: number;
  closed: number;
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(target ? String(target) : "");
  const save = useMutation({
    mutationFn: () =>
      setYearTarget({
        data: { yearId, target: value.trim() ? Number(value) : null },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["years"] });
      toast.success(m.plannerTargetSaved());
    },
  });
  const gap = target ? count - target : null;
  return (
    <div className="grid gap-3 rounded-lg border bg-card p-4">
      <p className="text-sm text-muted-foreground">{m.plannerSchoolDays()}</p>
      <p className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums">
          {formatNumber(count)}
        </span>
        {target ? (
          <span className="text-sm text-muted-foreground">
            {m.plannerOfTarget({ target: formatNumber(target) })}
          </span>
        ) : null}
      </p>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {m.plannerClosedCount({ count: formatNumber(closed) })}
      </p>
      {gap !== null && gap !== 0 ? (
        <p
          className={cn(
            "text-[13px] leading-[18px]",
            gap < 0 ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {gap < 0
            ? m.plannerShort({ count: formatNumber(-gap) })
            : m.plannerOver({ count: formatNumber(gap) })}
        </p>
      ) : null}
      {canEdit ? (
        <form
          className="flex items-end gap-2 print:hidden"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <TextField
            id="planner-target"
            label={m.plannerTarget()}
            type="number"
            min={1}
            max={366}
            width="date"
            inputMode="numeric"
            dir="ltr"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            errors={save.error ? [getMessageFromError(save.error)] : undefined}
          />
          <Button
            type="submit"
            variant="outline"
            className="max-md:h-10"
            disabled={save.isPending}
          >
            {m.commonSave()}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function Month({
  month,
  weekStart,
  byDay,
  terms,
  today,
  selected,
  onPick,
  canEdit,
  hydrated,
}: {
  month: string;
  weekStart: IsoWeekday;
  byDay: Map<string, Day>;
  terms: Days["terms"];
  today: string;
  selected: { from: string; to: string } | null;
  onPick: (day: string) => void;
  canEdit: boolean;
  hydrated: boolean;
}) {
  const weeks = monthWeeks(month, weekStart);
  const termOf = (day: string) =>
    terms.find((term) => term.startsOn <= day && day < term.endsBefore);
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
                title={dayName(isoWeekday(day), "long")}
                className="no-underline"
              >
                {dayName(isoWeekday(day), "short")}
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
              const term = termOf(day);
              const note = inLocale(entry.noteEn, entry.noteAr);
              const chosen =
                selected !== null && selected.from <= day && day <= selected.to;
              const label = [
                longDate(day),
                look.label(),
                note,
                entry.provisional ? m.plannerExpected() : "",
                term
                  ? inLocale(term.titleEn, term.titleAr)
                  : m.plannerBetweenTerms(),
              ]
                .filter(Boolean)
                .join(", ");
              const face = (
                <span
                  className={cn(
                    "grid aspect-square place-items-center rounded tabular-nums",
                    look.tint,
                    entry.provisional && "border border-dashed border-current",
                    !term &&
                      entry.meaning === "instructional_day" &&
                      "border border-dotted border-muted-foreground/60 text-muted-foreground",
                    day === today && "ring-2 ring-foreground",
                    chosen && "outline-2 outline-offset-1 outline-primary",
                  )}
                >
                  {Number(day.slice(8))}
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

function MarkForm({
  yearId,
  range,
  onDone,
}: {
  yearId: string;
  range: { from: string; to: string };
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<DayKind>("school_holiday");
  const [noteEn, setNoteEn] = useState("");
  const [noteAr, setNoteAr] = useState("");
  const [provisional, setProvisional] = useState(false);
  const paint = useMutation({
    mutationFn: () =>
      paintYearDays({
        data: {
          yearId,
          ...range,
          kind,
          noteEn,
          noteAr,
          provisional: kind === "normal" ? false : provisional,
        },
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["years"] });
      await queryClient.invalidateQueries({ queryKey: ["calendar"] });
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
            hint={m.plannerExpectedHint()}
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

/**
 * The year's school days on one page: every month, each day drawn by what
 * it is, terms underlined, the count against the authority's target, and a
 * way to mark a run of days by choosing its first and last day.
 */
export function YearPlanner({
  yearId,
  startsOn,
  endsBefore,
}: {
  yearId: string;
  startsOn: string;
  endsBefore: string;
}) {
  const user = useCurrentUser();
  const hydrated = useHydrated();
  const data = useSuspenseQuery(yearDaysQuery(yearId)).data;
  const queryClient = useQueryClient();
  const [anchor, setAnchor] = useState<string | null>(null);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);
  const byDay = new Map(data.days.map((day) => [day.day, day]));
  const months: string[] = [];
  const last = addDays(endsBefore, -1).slice(0, 7);
  for (
    let month = startsOn.slice(0, 7);
    month <= last;
    month = shiftMonth(month, 1)
  )
    months.push(month);
  const runs = runsOf(data.days);
  const count = schoolDayCount(data.days);
  const closed = data.days.filter(
    (day) =>
      day.meaning !== "weekend" && !SCHOOL_DAY_MEANINGS.includes(day.meaning),
  ).length;
  const pick = (day: string) => {
    if (anchor === null || range === null || range.from !== range.to) {
      setAnchor(day);
      setRange({ from: day, to: day });
      return;
    }
    const [from, to] = anchor <= day ? [anchor, day] : [day, anchor];
    setRange({ from, to });
    setAnchor(null);
  };
  const reset = useMutation({
    mutationFn: (run: Run) =>
      paintYearDays({
        data: {
          yearId,
          from: run.from,
          to: run.to,
          kind: "normal",
          noteEn: "",
          noteAr: "",
          provisional: false,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["years"] });
      await queryClient.invalidateQueries({ queryKey: ["calendar"] });
    },
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
              terms={data.terms}
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
          <li className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-3.5 rounded-sm border border-dotted border-muted-foreground/60"
            />
            {m.plannerBetweenTerms()}
          </li>
        </ul>
      </div>
      <aside className="grid content-start gap-4">
        <Target
          yearId={yearId}
          target={data.targetDays}
          count={count}
          closed={closed}
          canEdit={data.canEdit}
        />
        {range && data.canEdit ? (
          <MarkForm
            key={`${range.from}-${range.to}`}
            yearId={yearId}
            range={range}
            onDone={() => {
              setRange(null);
              setAnchor(null);
            }}
          />
        ) : null}
        <section
          aria-labelledby="planner-marked"
          className="grid gap-2 rounded-lg border bg-card p-4"
        >
          <h3 id="planner-marked" className="text-sm font-semibold">
            {m.plannerMarkedList()}
          </h3>
          {runs.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              {m.plannerNothingMarked()}
            </p>
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
