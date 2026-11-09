import type { PeriodKind } from "@faridalms/domain/timetable";
import type { GridColumn, GridIssue } from "@faridalms/ui/system/data-grid";

import { addDays } from "@faridalms/domain/school";
import { PERIOD_KINDS, savePeriodsSchema } from "@faridalms/domain/timetable";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { cn } from "@faridalms/ui/cn";
import {
  DataGrid,
  GridAddButton,
  GridRemoveButton,
  SelectCell,
  TextCell,
  TimeCell,
  useFocusAfterRender,
} from "@faridalms/ui/system/data-grid";
import { TextField } from "@faridalms/ui/system/form-field";
import {
  Fact,
  Facts,
  phoneLink,
  RecordColumns,
  RecordEmpty,
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
import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

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
  key: number;
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

type Field = "from" | "periods" | `${number}.${string}`;

const draftOf = (period: Period, key: number): Draft => ({
  key,
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

interface OtherTimesProps {
  draft: Draft;
  legend: string;
  days: readonly number[];
  onChange: (dayTimes: DayTimesDraft[]) => void;
}

/**
 * The days a period keeps other times on, each set of days with its own
 * start and end on one line; only the days the period runs on can be
 * chosen.
 */
function OtherTimes({ draft, legend, days, onChange }: OtherTimesProps) {
  const runs = days.filter((day) => draft.weekdays.includes(day));
  const change = (key: number, next: Partial<DayTimesDraft>) =>
    onChange(
      draft.dayTimes.map((entry) =>
        entry.key === key ? { ...entry, ...next } : entry,
      ),
    );
  return (
    <div className="grid justify-items-start gap-2">
      {draft.dayTimes.map((entry) => (
        <div
          key={entry.key}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-muted/40 px-2 py-1.5"
        >
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {m.periodsOtherTimes()}
          </span>
          <DayChoices
            id={`period-other-days-${draft.key}-${entry.key}`}
            legend={legend}
            days={runs}
            value={entry.weekdays}
            onChange={(weekdays) => change(entry.key, { weekdays })}
          />
          <TimeCell
            id={`period-other-starts-${draft.key}-${entry.key}`}
            label={m.periodsOtherStartsOf({ name: legend })}
            value={entry.startTime}
            onChange={(startTime) => change(entry.key, { startTime })}
          />
          <TimeCell
            id={`period-other-ends-${draft.key}-${entry.key}`}
            label={m.periodsOtherEndsOf({ name: legend })}
            min={entry.startTime || undefined}
            value={entry.endTime}
            onChange={(endTime) => change(entry.key, { endTime })}
          />
          <GridRemoveButton
            label={m.periodsOtherTimesRemove({ name: legend })}
            onRemove={() =>
              onChange(draft.dayTimes.filter((one) => one.key !== entry.key))
            }
          />
        </div>
      ))}
      {runs.length > 1 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ms-2 max-md:h-10"
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
      ) : null}
    </div>
  );
}

interface DayChoicesProps {
  /** The first day's id, so a problem with the days can lead to it. */
  id: string;
  legend: string;
  days: readonly number[];
  value: readonly number[];
  onChange: (next: number[]) => void;
}

function DayChoices({ id, legend, days, value, onChange }: DayChoicesProps) {
  return (
    <fieldset className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <legend className="sr-only">{m.periodsDaysOf({ name: legend })}</legend>
      {days.map((day, index) => {
        const dayId = index === 0 ? id : `${id}-${day}`;
        return (
          <label
            key={day}
            htmlFor={dayId}
            className="flex min-h-8 items-center gap-2 text-sm leading-5 max-md:min-h-10"
          >
            <Checkbox
              id={dayId}
              aria-label={formatWeekday(day)}
              checked={value.includes(day)}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...value.filter((one) => one !== day), day]
                    : value.filter((one) => one !== day),
                )
              }
            />
            <span aria-hidden>{formatWeekday(day, "short")}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

const legendOf = (draft: Draft, index: number) =>
  inLocale(draft.nameEn || null, draft.nameAr || null) ||
  m.periodsNumber({ number: formatNumber(index + 1) });

/** The cell each field's problem is shown on and leads to. */
function periodTarget(draft: Draft, field: string) {
  switch (field) {
    case "nameEn":
      return `period-name-en-${draft.key}`;
    case "startTime":
      return `period-starts-${draft.key}`;
    case "endTime":
      return `period-ends-${draft.key}`;
    case "kind":
      return `period-kind-${draft.key}`;
    case "dayTimes": {
      const first = draft.dayTimes[0];
      return first
        ? `period-other-starts-${draft.key}-${first.key}`
        : `period-days-${draft.key}`;
    }
    case "weekdays":
      return `period-days-${draft.key}`;
    default:
      return `period-name-ar-${draft.key}`;
  }
}

function periodIssues(
  drafts: readonly Draft[],
  errors: Partial<Record<Field, string>>,
): GridIssue[] {
  return Object.entries(errors).flatMap(([key, message]) => {
    const [at, field] = key.split(".");
    const draft = drafts[Number(at)];
    if (!draft || !field || !message) return [];
    return [
      {
        target: periodTarget(draft, field),
        label: legendOf(draft, Number(at)),
        message,
      },
    ];
  });
}

interface PeriodGridOptions {
  drafts: Draft[];
  days: readonly number[];
  change: (key: number, next: Partial<Draft>) => void;
  remove: (key: number) => void;
}

// Built per render: headers read the request's locale.
function periodGrid({ drafts, days, change, remove }: PeriodGridOptions) {
  const legend = (draft: Draft) => legendOf(draft, drafts.indexOf(draft));
  const rowHeader = {
    header: m.periodsColEnglish(),
    cell: (draft: Draft) => (
      <TextCell
        id={`period-name-en-${draft.key}`}
        label={m.periodsNameEnglishOf({ name: legend(draft) })}
        dir="ltr"
        maxLength={60}
        value={draft.nameEn}
        onChange={(nameEn) => change(draft.key, { nameEn })}
      />
    ),
  };
  const columns: GridColumn<Draft>[] = [
    {
      id: "ar",
      header: m.periodsColArabic(),
      cell: (draft) => (
        <TextCell
          id={`period-name-ar-${draft.key}`}
          label={m.periodsNameArabicOf({ name: legend(draft) })}
          lang="ar"
          maxLength={60}
          value={draft.nameAr}
          onChange={(nameAr) => change(draft.key, { nameAr })}
        />
      ),
    },
    {
      id: "starts",
      header: m.periodsStarts(),
      cell: (draft) => (
        <TimeCell
          id={`period-starts-${draft.key}`}
          label={m.periodsStartsOf({ name: legend(draft) })}
          value={draft.startTime}
          onChange={(startTime) => change(draft.key, { startTime })}
        />
      ),
    },
    {
      id: "ends",
      header: m.periodsEnds(),
      cell: (draft) => (
        <TimeCell
          id={`period-ends-${draft.key}`}
          label={m.periodsEndsOf({ name: legend(draft) })}
          min={draft.startTime || undefined}
          value={draft.endTime}
          onChange={(endTime) => change(draft.key, { endTime })}
        />
      ),
    },
  ];
  const rowEnd = (draft: Draft) => (
    <GridRemoveButton
      label={m.periodsRemove({ name: legend(draft) })}
      onRemove={() => remove(draft.key)}
    />
  );
  const rowDetail = (draft: Draft) => (
    <div className="grid gap-1.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="w-32">
          <SelectCell
            id={`period-kind-${draft.key}`}
            label={m.periodsKindOf({ name: legend(draft) })}
            value={draft.kind}
            options={PERIOD_KINDS.map((kind) => ({
              value: kind,
              label: KIND_LABEL[kind](),
            }))}
            onChange={(kind) => change(draft.key, { kind })}
          />
        </span>
        <DayChoices
          id={`period-days-${draft.key}`}
          legend={legend(draft)}
          days={days}
          value={draft.weekdays}
          onChange={(weekdays) => change(draft.key, { weekdays })}
        />
        {draft.kind === "break" ? null : (
          <label className="flex min-h-8 items-center gap-2 text-sm leading-5 max-md:min-h-10">
            <Checkbox
              aria-label={m.periodsOfficialOf({ name: legend(draft) })}
              checked={draft.official}
              onCheckedChange={(official) => change(draft.key, { official })}
            />
            {m.periodsOfficial()}
          </label>
        )}
      </div>
      <OtherTimes
        draft={draft}
        legend={legend(draft)}
        days={days}
        onChange={(dayTimes) => change(draft.key, { dayTimes })}
      />
    </div>
  );
  return { rowHeader, columns, rowEnd, rowDetail };
}

const fieldOf = (key: string, path: readonly unknown[]): Field | undefined => {
  if (key === "from") return "from";
  if (key !== "periods") return undefined;
  const [, index, field] = path;
  return typeof index === "number" && typeof field === "string"
    ? `${index}.${field}`
    : "periods";
};

interface PeriodsSheetProps {
  data: PeriodsData;
  open: boolean;
  onClose: () => void;
}

function PeriodsSheet({ data, open, onClose }: PeriodsSheetProps) {
  const queryClient = useQueryClient();
  const segment = segmentOf(data);
  const lastDay = addDays(segment.until, -1);
  const nextKey = useRef(data.periods.length + 1);
  const focusLater = useFocusAfterRender();
  const [from, setFrom] = useState(() =>
    clamp(data.today, segment.from, lastDay),
  );
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    data.periods.map((period, index) => draftOf(period, index + 1)),
  );
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const payload = {
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
  };
  const mutation = useMutation({
    mutationFn: () => saveYearPeriods({ data: payload }),
    meta: { inlineError: true },
  });
  const change = (key: number, next: Partial<Draft>) => {
    setErrors({});
    setDrafts((current) =>
      current.map((draft) =>
        draft.key === key ? { ...draft, ...next } : draft,
      ),
    );
  };
  const refusal = refusalOf(mutation.error, {});
  const code = mutation.error?.message ?? "";
  const onFrom =
    code.startsWith(PERIOD_REGISTERS_AFTER) ||
    code.startsWith(PERIOD_COVER_AFTER) ||
    code === "class_period.outside_year";
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={m.periodsEdit()}
      pending={mutation.isPending}
      error={refusal && !onFrom ? refusal.message : (errors.periods ?? null)}
      onSubmit={async () => {
        const found = schemaErrors(savePeriodsSchema, payload, fieldOf);
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        try {
          await mutation.mutateAsync();
        } catch {
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ["years"] });
        await queryClient.invalidateQueries({ queryKey: ["timetable"] });
        toast.success(m.periodsSaved());
        onClose();
      }}
    >
      <TextField
        id="periods-from"
        label={m.periodsFrom()}
        hint={m.periodsFromHint()}
        type="date"
        width="date"
        min={segment.from}
        max={lastDay}
        value={from}
        onChange={(event) => {
          mutation.reset();
          setErrors({});
          setFrom(event.target.value);
        }}
        errors={
          errors.from
            ? [errors.from]
            : onFrom && refusal
              ? [refusal.message]
              : undefined
        }
      />
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {m.periodsOfficialHint()}
      </p>
      <DataGrid<Draft>
        caption={m.periodsTable()}
        editing
        surface="sheet"
        {...periodGrid({
          drafts,
          days: data.days,
          change,
          remove: (key) => {
            setErrors({});
            setDrafts((current) => current.filter((item) => item.key !== key));
          },
        })}
        groups={[{ id: "periods", title: "", rows: drafts }]}
        rowKey={(draft) => String(draft.key)}
        issues={periodIssues(drafts, errors)}
        footer={
          <GridAddButton
            label={m.periodsAdd()}
            onAdd={() => {
              const key = nextKey.current;
              nextKey.current += 1;
              const last = drafts.at(-1);
              setErrors({});
              setDrafts([
                ...drafts,
                {
                  key,
                  nameEn: "",
                  nameAr: "",
                  kind: "lesson",
                  startTime: last?.endTime ?? "",
                  endTime: "",
                  official: false,
                  weekdays: [...data.days],
                  dayTimes: [],
                },
              ]);
              focusLater(`period-name-en-${key}`);
            }}
          />
        }
      />
    </SheetForm>
  );
}

interface PeriodListProps {
  data: PeriodsData;
}

function PeriodList({ data }: PeriodListProps) {
  if (data.periods.length === 0)
    return <RecordEmpty>{m.periodsNone()}</RecordEmpty>;
  return (
    <RecordList>
      {data.periods.map((period) => (
        <li
          key={period.id}
          className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3"
        >
          <div className="grid min-w-0 gap-0.5">
            <span className="flex flex-wrap items-center gap-x-3 text-sm leading-5 font-medium">
              <span dir="auto">{inLocale(period.nameEn, period.nameAr)}</span>
              {period.official ? (
                <StatusText tone="info">{m.periodsOfficialBadge()}</StatusText>
              ) : null}
            </span>
            <span className="text-[13px] leading-[18px] text-muted-foreground">
              {KIND_LABEL[period.kind]()}
              <span aria-hidden> · </span>
              {daysLabel(period.weekdays, data.days)}
            </span>
            {otherTimesLabel(period).map((line) => (
              <span
                key={line}
                className="text-[13px] leading-[18px] text-muted-foreground tabular-nums"
              >
                {line}
              </span>
            ))}
          </div>
          <span className="text-sm leading-5 text-muted-foreground tabular-nums">
            <bdi dir="ltr">{timeRange(period)}</bdi>
          </span>
        </li>
      ))}
    </RecordList>
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
  const [sheet, setSheet] = useState({ open: false, key: 0 });
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
    <>
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
              edit={
                data.canEdit
                  ? {
                      label: m.periodsEdit(),
                      onClick: () =>
                        setSheet((current) => ({
                          open: true,
                          key: current.key + 1,
                        })),
                    }
                  : undefined
              }
            >
              <PeriodList data={data} />
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
      {sheet.open ? (
        <PeriodsSheet
          key={sheet.key}
          data={data}
          open
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
        />
      ) : null}
    </>
  );
}
