import type { PeriodKind } from "@faridalms/domain/timetable";
import type { Column, RowAction } from "@faridalms/ui/system/data-table";
import type { ReactNode } from "react";

import { addDays } from "@faridalms/domain/school";
import { PERIOD_KINDS, savePeriodsSchema } from "@faridalms/domain/timetable";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { DataTable, RowButton } from "@faridalms/ui/system/data-table";
import {
  CheckboxGroupField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import {
  Fact,
  Facts,
  phoneLink,
  RecordColumns,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Clock, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CheckboxRow } from "~/components/people/fields";
import { BellSchedules } from "~/components/years/BellSchedules";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { yearPeriodsQuery } from "~/queries/years";
import { saveYearPeriods } from "~/server/years";
import {
  formatDate,
  formatList,
  formatNumber,
  formatTime,
  formatWeekday,
} from "~/utils/datetime";
import {
  PERIOD_COVER_AFTER,
  PERIOD_REGISTERS_AFTER,
  refusalOf,
} from "~/utils/error";
import { schemaErrors } from "~/utils/validation";

type PeriodsData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof yearPeriodsQuery>["queryFn"]>>
>;
type Period = PeriodsData["periods"][number];

const KIND_LABEL: Record<PeriodKind, () => string> = {
  lesson: m.periodsKindLesson,
  registration: m.periodsKindRegistration,
  break: m.periodsKindBreak,
  other: m.periodsKindOther,
};

function timeRange(period: { startTime: string; endTime: string }) {
  if (!period.startTime || !period.endTime) return null;
  return m.ttTimeRange({
    from: formatTime(period.startTime),
    to: formatTime(period.endTime),
  });
}

const minutesOf = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
};

function daysLabel(weekdays: readonly number[], schoolDays: readonly number[]) {
  const runs = schoolDays.filter((day) => weekdays.includes(day));
  if (runs.length === schoolDays.length) return m.periodsEveryDay();
  return formatList(runs.map((day) => formatWeekday(day)));
}

/** The dates the structure read on `on` holds for: its first day and the day after its last. */
function segmentOf(data: PeriodsData) {
  const yearEnd = addDays(data.year.lastDay, 1);
  if (data.periods.length === 0)
    return {
      from:
        data.changes.findLast((day) => day <= data.on) ?? data.year.startsOn,
      until: data.changes.find((day) => day > data.on) ?? yearEnd,
    };
  return {
    from: data.periods.reduce(
      (latest, row) => (row.from > latest ? row.from : latest),
      data.year.startsOn,
    ),
    until: data.periods.reduce(
      (earliest, row) => (row.until < earliest ? row.until : earliest),
      yearEnd,
    ),
  };
}

const clamp = (day: string, first: string, last: string) =>
  day < first ? first : day > last ? last : day;

interface DayTimesDraft {
  key: number;
  weekdays: number[];
  startTime: string;
  endTime: string;
}

interface Draft {
  id?: string;
  nameEn: string;
  nameAr: string;
  kind: PeriodKind;
  startTime: string;
  endTime: string;
  official: boolean;
  weekdays: number[];
  dayTimes: DayTimesDraft[];
}

const draftOf = (period: Period): Draft => ({
  id: period.id,
  nameEn: period.nameEn ?? "",
  nameAr: period.nameAr ?? "",
  kind: period.kind,
  startTime: period.startTime,
  endTime: period.endTime,
  official: period.official,
  weekdays: [...period.weekdays],
  dayTimes: period.dayTimes.map((entry, index) => ({
    key: index + 1,
    weekdays: [...entry.weekdays],
    startTime: entry.startTime,
    endTime: entry.endTime,
  })),
});

/** The periods as the server takes them, every one of the day. */
const payloadOf = (data: PeriodsData, from: string, drafts: Draft[]) => ({
  yearId: data.year.id,
  from,
  known: data.periods.map((period) => ({
    id: period.id,
    version: period.version,
  })),
  periods: drafts.map((draft) => ({
    ...(draft.id ? { id: draft.id } : {}),
    nameEn: draft.nameEn,
    nameAr: draft.nameAr,
    kind: draft.kind,
    startTime: draft.startTime,
    endTime: draft.endTime,
    official: draft.kind !== "break" && draft.official,
    weekdays: draft.weekdays,
    dayTimes: draft.dayTimes.map((entry) => ({
      weekdays: entry.weekdays.filter((day) => draft.weekdays.includes(day)),
      startTime: entry.startTime,
      endTime: entry.endTime,
    })),
  })),
});

/** A period's other times as a line: "Thursday 09:00–09:40". */
function otherTimesLabel(period: Pick<Period, "dayTimes">) {
  return period.dayTimes.map((entry) =>
    m.periodsOtherTimesOn({
      days: formatList(entry.weekdays.map((day) => formatWeekday(day))),
      times: m.ttTimeRange({
        from: formatTime(entry.startTime),
        to: formatTime(entry.endTime),
      }),
    }),
  );
}

const periodName = (period: Pick<Period, "nameEn" | "nameAr">) =>
  inLocale(period.nameEn, period.nameAr);

type Field = "from" | "periods" | `${number}.${string}`;

const fieldOf = (key: string, path: readonly unknown[]): Field | undefined => {
  if (key === "from") return "from";
  if (key !== "periods") return undefined;
  const [, index, field] = path;
  return typeof index === "number" && typeof field === "string"
    ? `${index}.${field}`
    : "periods";
};

/** The errors of one row, by its field, and whatever else is wrong. */
function rowErrors(errors: Partial<Record<Field, string>>, index: number) {
  const own: Partial<Record<string, string>> = {};
  let other: string | null = null;
  for (const [key, message] of Object.entries(errors)) {
    if (!message || key === "from") continue;
    const [at, field] = key.split(".");
    if (Number(at) === index && field) own[field] = message;
    else other ??= message;
  }
  return { own, other };
}

/** Where the server's refusal of a date shows: on the From field. */
function useRefusal(error: Error | null) {
  const refusal = refusalOf(error, {});
  const code = error?.message ?? "";
  const onFrom =
    code.startsWith(PERIOD_REGISTERS_AFTER) ||
    code.startsWith(PERIOD_COVER_AFTER) ||
    code === "class_period.outside_year";
  return {
    from: onFrom && refusal ? refusal.message : null,
    sheet: refusal && !onFrom ? refusal.message : null,
  };
}

interface FromFieldProps {
  data: PeriodsData;
  value: string;
  error: string | null | undefined;
  onChange: (from: string) => void;
}

/** The day a change starts on; days before it keep the periods they had. */
function FromField({ data, value, error, onChange }: FromFieldProps) {
  const segment = segmentOf(data);
  return (
    <TextField
      id="periods-from"
      label={m.periodsFrom()}
      hint={m.periodsFromHint()}
      type="date"
      width="date"
      min={segment.from}
      max={addDays(segment.until, -1)}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      errors={error ? [error] : undefined}
    />
  );
}

function useFrom(data: PeriodsData) {
  const segment = segmentOf(data);
  return useState(() =>
    clamp(data.today, segment.from, addDays(segment.until, -1)),
  );
}

function useSavePeriods() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (payload: ReturnType<typeof payloadOf>) =>
      saveYearPeriods({ data: payload }),
    meta: { inlineError: true },
  });
  return {
    mutation,
    save: async (payload: ReturnType<typeof payloadOf>) => {
      try {
        await mutation.mutateAsync(payload);
      } catch {
        return false;
      }
      await queryClient.invalidateQueries({ queryKey: ["years"] });
      await queryClient.invalidateQueries({ queryKey: ["timetable"] });
      toast.success(m.periodsSaved());
      return true;
    },
  };
}

interface OtherTimesProps {
  draft: Draft;
  days: readonly number[];
  errors?: string;
  onChange: (dayTimes: DayTimesDraft[]) => void;
}

/**
 * The days a period keeps other times on, each set of days with its own
 * start and end; only the days the period runs on can be chosen.
 */
function OtherTimes({ draft, days, errors, onChange }: OtherTimesProps) {
  const runs = days.filter((day) => draft.weekdays.includes(day));
  const change = (key: number, next: Partial<DayTimesDraft>) =>
    onChange(
      draft.dayTimes.map((entry) =>
        entry.key === key ? { ...entry, ...next } : entry,
      ),
    );
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm leading-5 font-medium">
        {m.periodsOtherTimes()}
      </legend>
      {draft.dayTimes.map((entry, index) => {
        const number = formatNumber(index + 1);
        return (
          <div key={entry.key} className="grid gap-3 rounded-md border p-3">
            <div className="flex items-start justify-between gap-2">
              <CheckboxGroupField
                label={m.periodsOtherDays({ number })}
                value={entry.weekdays.map(String)}
                options={runs.map((day) => ({
                  value: String(day),
                  label: formatWeekday(day),
                }))}
                onChange={(weekdays) =>
                  change(entry.key, { weekdays: weekdays.map(Number) })
                }
                errors={index === 0 && errors ? [errors] : undefined}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="max-md:size-10"
                aria-label={m.periodsOtherTimesRemoveOne({ number })}
                onClick={() =>
                  onChange(
                    draft.dayTimes.filter((one) => one.key !== entry.key),
                  )
                }
              >
                <X aria-hidden />
              </Button>
            </div>
            <div className="flex flex-wrap gap-4">
              <TextField
                id={`period-other-starts-${String(entry.key)}`}
                label={m.periodsStarts()}
                type="time"
                width="date"
                value={entry.startTime}
                onChange={(event) =>
                  change(entry.key, { startTime: event.target.value })
                }
              />
              <TextField
                id={`period-other-ends-${String(entry.key)}`}
                label={m.periodsEnds()}
                type="time"
                width="date"
                min={entry.startTime || undefined}
                value={entry.endTime}
                onChange={(event) =>
                  change(entry.key, { endTime: event.target.value })
                }
              />
            </div>
          </div>
        );
      })}
      {runs.length > 1 ? (
        <div>
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={() =>
              onChange([
                ...draft.dayTimes,
                {
                  key: Math.max(0, ...draft.dayTimes.map((one) => one.key)) + 1,
                  weekdays: [],
                  startTime: draft.startTime,
                  endTime: draft.endTime,
                },
              ])
            }
          >
            <Plus aria-hidden />
            {m.periodsOtherTimesAdd()}
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}

interface PeriodSheetProps {
  data: PeriodsData;
  /** The period being changed; none to add one. */
  period: Period | null;
  open: boolean;
  onClose: () => void;
}

/**
 * One period of the school day from a date: its names, kind, times, days,
 * whether it takes the day's register and its other times on some days.
 * Saving writes the day's periods from that date with this one changed.
 */
function PeriodSheet({ data, period, open, onClose }: PeriodSheetProps) {
  const [from, setFrom] = useFrom(data);
  const last = data.periods.at(-1);
  const [draft, setDraft] = useState<Draft>(() =>
    period
      ? draftOf(period)
      : {
          nameEn: "",
          nameAr: "",
          kind: "lesson",
          startTime: last?.endTime ?? "",
          endTime: "",
          official: false,
          weekdays: [...data.days],
          dayTimes: [],
        },
  );
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const { mutation, save } = useSavePeriods();
  const index = period
    ? data.periods.findIndex((row) => row.id === period.id)
    : data.periods.length;
  const drafts = data.periods.map(draftOf);
  drafts.splice(index, period ? 1 : 0, draft);
  const payload = payloadOf(data, from, drafts);
  const refused = useRefusal(mutation.error);
  const { own, other } = rowErrors(errors, index);
  const change = (next: Partial<Draft>) => {
    setErrors({});
    setDraft((current) => ({ ...current, ...next }));
  };
  const named = period ? periodName(period) : "";
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={period ? m.periodsEditOne({ name: named }) : m.periodsAdd()}
      submitLabel={period ? m.periodsSaveOne() : m.periodsAdd()}
      pending={mutation.isPending}
      error={refused.sheet ?? errors.periods ?? other}
      onSubmit={async () => {
        const found = schemaErrors(savePeriodsSchema, payload, fieldOf);
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        if (await save(payload)) onClose();
      }}
    >
      <FromField
        data={data}
        value={from}
        error={errors.from ?? refused.from}
        onChange={(next) => {
          mutation.reset();
          setErrors({});
          setFrom(next);
        }}
      />
      <TextField
        id="period-name-en"
        label={m.periodsNameEnglish()}
        dir="ltr"
        width="name"
        maxLength={60}
        autoComplete="off"
        value={draft.nameEn}
        onChange={(event) => change({ nameEn: event.target.value })}
        errors={own.nameEn ? [own.nameEn] : undefined}
      />
      <TextField
        id="period-name-ar"
        label={m.periodsNameArabic()}
        lang="ar"
        dir="rtl"
        width="name"
        maxLength={60}
        autoComplete="off"
        value={draft.nameAr}
        onChange={(event) => change({ nameAr: event.target.value })}
        errors={own.nameAr ? [own.nameAr] : undefined}
      />
      <SelectField
        id="period-kind"
        label={m.periodsKind()}
        value={draft.kind}
        options={PERIOD_KINDS.map((kind) => ({
          value: kind,
          label: KIND_LABEL[kind](),
        }))}
        onChange={(kind) => change({ kind })}
        errors={own.kind ? [own.kind] : undefined}
        width="date"
      />
      <div className="flex flex-wrap gap-4">
        <TextField
          id="period-starts"
          label={m.periodsStarts()}
          type="time"
          width="date"
          value={draft.startTime}
          onChange={(event) => change({ startTime: event.target.value })}
          errors={own.startTime ? [own.startTime] : undefined}
        />
        <TextField
          id="period-ends"
          label={m.periodsEnds()}
          type="time"
          width="date"
          min={draft.startTime || undefined}
          value={draft.endTime}
          onChange={(event) => change({ endTime: event.target.value })}
          errors={own.endTime ? [own.endTime] : undefined}
        />
      </div>
      <CheckboxGroupField
        label={m.periodsDays()}
        value={draft.weekdays.map(String)}
        options={data.days.map((day) => ({
          value: String(day),
          label: formatWeekday(day),
        }))}
        onChange={(weekdays) => change({ weekdays: weekdays.map(Number) })}
        errors={own.weekdays ? [own.weekdays] : undefined}
      />
      {draft.kind === "break" ? null : (
        <CheckboxRow
          label={m.periodsOfficial()}
          hint={m.periodsOfficialHint()}
          checked={draft.official}
          error={own.official}
          onChange={(official) => change({ official })}
        />
      )}
      <OtherTimes
        draft={draft}
        days={data.days}
        errors={own.dayTimes}
        onChange={(dayTimes) => change({ dayTimes })}
      />
    </SheetForm>
  );
}

interface RemovePeriodSheetProps {
  data: PeriodsData;
  period: Period;
  open: boolean;
  onClose: () => void;
}

/** Takes a period out of the school day from a date; days before keep it. */
function RemovePeriodSheet({
  data,
  period,
  open,
  onClose,
}: RemovePeriodSheetProps) {
  const [from, setFrom] = useFrom(data);
  const { mutation, save } = useSavePeriods();
  const refused = useRefusal(mutation.error);
  const payload = payloadOf(
    data,
    from,
    data.periods.filter((row) => row.id !== period.id).map(draftOf),
  );
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={m.periodsRemoveTitle({ name: periodName(period) })}
      submitLabel={m.periodsRemoveAction()}
      destructive
      pending={mutation.isPending}
      error={refused.sheet}
      onSubmit={async () => {
        if (await save(payload)) onClose();
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {m.periodsRemoveBody()}
      </p>
      <FromField
        data={data}
        value={from}
        error={refused.from}
        onChange={(next) => {
          mutation.reset();
          setFrom(next);
        }}
      />
    </SheetForm>
  );
}

type PeriodOpener = (period: Period) => ReactNode;

// Built per render: headers read the request's locale.
function periodColumns(
  days: readonly number[],
  opener: PeriodOpener,
): Column<Period>[] {
  return [
    {
      id: "name",
      header: m.periodsPeriod(),
      primary: true,
      // What kind of period it is and on which days reads under its name,
      // so the day's table keeps to the columns a timetable is read by.
      cell: (period) => (
        <span className="grid gap-0.5 py-1.5">
          {opener(period)}
          <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
            {KIND_LABEL[period.kind]()}
            <span aria-hidden> · </span>
            {daysLabel(period.weekdays, days)}
          </span>
          {otherTimesLabel(period).map((line) => (
            <span
              key={line}
              className="truncate text-[13px] leading-[18px] text-muted-foreground tabular-nums"
            >
              {line}
            </span>
          ))}
        </span>
      ),
    },
    {
      id: "time",
      header: m.periodsTime(),
      cell: (period) => <bdi>{timeRange(period)}</bdi>,
    },
    {
      id: "length",
      header: m.periodsLength(),
      align: "end",
      cell: (period) =>
        m.periodsMinutes({
          count: formatNumber(
            minutesOf(period.endTime) - minutesOf(period.startTime),
          ),
        }),
    },
    {
      id: "register",
      header: m.periodsRegister(),
      cell: (period) =>
        period.official ? (
          <StatusText tone="info">{m.periodsOfficialBadge()}</StatusText>
        ) : null,
    },
  ];
}

function periodCard(days: readonly number[], opener: PeriodOpener) {
  return {
    title: opener,
    fact: (period: Period) =>
      [
        timeRange(period),
        KIND_LABEL[period.kind](),
        daysLabel(period.weekdays, days),
      ]
        .filter(Boolean)
        .join(" · "),
    status: (period: Period) =>
      period.official ? (
        <StatusText tone="info">{m.periodsOfficialBadge()}</StatusText>
      ) : null,
  };
}

interface PeriodsTableProps {
  data: PeriodsData;
}

/**
 * The periods of the school day as they stand on the day read, earliest
 * first, each opened and saved on its own from a date.
 */
function PeriodsTable({ data }: PeriodsTableProps) {
  const [sheet, setSheet] = useState<{
    period: Period | null;
    removing: boolean;
    key: number;
    open: boolean;
  } | null>(null);
  const open = (period: Period | null, removing = false) =>
    setSheet((current) => ({
      period,
      removing,
      key: (current?.key ?? 0) + 1,
      open: true,
    }));
  const close = () =>
    setSheet((current) => current && { ...current, open: false });
  const opener: PeriodOpener = (period) =>
    data.canEdit ? (
      <RowButton onClick={() => open(period)}>
        <span dir="auto">{periodName(period)}</span>
      </RowButton>
    ) : (
      <span dir="auto" className="font-medium">
        {periodName(period)}
      </span>
    );
  const add = (variant: "default" | "outline") =>
    data.canEdit ? (
      <Button
        type="button"
        variant={variant}
        className="max-md:h-10"
        onClick={() => open(null)}
      >
        <Plus aria-hidden />
        {m.periodsAdd()}
      </Button>
    ) : undefined;
  const rowActions = data.canEdit
    ? (period: Period): RowAction[] => [
        { label: m.recordEdit(), icon: Pencil, onSelect: () => open(period) },
        {
          label: m.periodsRemoveAction(),
          icon: Trash2,
          onSelect: () => open(period, true),
        },
      ]
    : undefined;
  return (
    <>
      <DataTable
        caption={m.periodsTable()}
        rows={data.periods.toSorted((a, b) =>
          a.startTime.localeCompare(b.startTime),
        )}
        columns={periodColumns(data.days, opener)}
        rowLabel={periodName}
        rowActions={rowActions}
        actions={add("outline")}
        card={periodCard(data.days, opener)}
        empty={{
          icon: Clock,
          title: m.periodsNone(),
          action: add("default"),
        }}
      />
      {sheet?.removing && sheet.period ? (
        <RemovePeriodSheet
          key={sheet.key}
          data={data}
          period={sheet.period}
          open={sheet.open}
          onClose={close}
        />
      ) : sheet ? (
        <PeriodSheet
          key={sheet.key}
          data={data}
          period={sheet.period}
          open={sheet.open}
          onClose={close}
        />
      ) : null}
    </>
  );
}

export interface YearPeriodsProps {
  yearId: string;
  on: string;
}

/**
 * A year's school day: its periods with their times and days, as they stand
 * on the day being read, and the dates the day changes shape on.
 */
export function YearPeriods({ yearId, on }: YearPeriodsProps) {
  const data = useSuspenseQuery(yearPeriodsQuery(yearId, on)).data;
  const segment = segmentOf(data);
  const lessons = Math.max(
    0,
    ...data.days.map(
      (day) =>
        data.periods.filter(
          (period) => period.kind === "lesson" && period.weekdays.includes(day),
        ).length,
    ),
  );
  return (
    <RecordColumns
      main={
        <>
          <RecordSection
            title={m.periodsTitle()}
            description={
              <>
                {m.periodsHint()}{" "}
                <span className="font-medium text-foreground">
                  {m.accessDuring({
                    from: formatDate(segment.from),
                    to: formatDate(addDays(segment.until, -1)),
                  })}
                </span>
              </>
            }
          >
            <PeriodsTable data={data} />
          </RecordSection>
          <BellSchedules data={data} />
        </>
      }
      aside={
        <>
          <RecordSection title={m.periodsSchoolDays()}>
            <Facts>
              <Fact label={m.periodsDays()}>
                {formatList(data.days.map((day) => formatWeekday(day)))}
              </Fact>
              <Fact label={m.periodsLessons()}>
                <span className="tabular-nums">{formatNumber(lessons)}</span>
              </Fact>
            </Facts>
            <p className="mt-4 text-[13px] leading-[18px] text-muted-foreground">
              {m.periodsSchoolDaysHint()}
            </p>
          </RecordSection>
          {data.changes.length > 1 ? (
            <RecordSection title={m.periodsVersions()}>
              <RecordList>
                {data.changes.map((day) => {
                  const shown = day === segment.from;
                  return (
                    <li key={day} className="py-3">
                      <Link
                        to="/years/$yearId"
                        params={{ yearId }}
                        search={{ tab: "periods", on: day }}
                        aria-current={shown ? "page" : undefined}
                        className={cn(
                          "text-sm leading-5 hover:text-primary hover:underline",
                          shown && "font-medium text-primary",
                          phoneLink,
                        )}
                      >
                        {formatDate(day)}
                      </Link>
                    </li>
                  );
                })}
              </RecordList>
            </RecordSection>
          ) : null}
        </>
      }
    />
  );
}
