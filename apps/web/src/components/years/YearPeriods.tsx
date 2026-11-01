import type { PeriodKind } from "@faridalms/domain/timetable";

import { addDays } from "@faridalms/domain/school";
import { PERIOD_KINDS, savePeriodsSchema } from "@faridalms/domain/timetable";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { cn } from "@faridalms/ui/cn";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { CheckboxRow } from "~/components/people/fields";
import { SelectField, TextField } from "~/components/system/field";
import {
  Fact,
  Facts,
  phoneLink,
  RecordColumns,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "~/components/system/RecordPage";
import { SheetForm } from "~/components/system/SheetForm";
import { StatusText } from "~/components/system/status";
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
});

function DayChoices({
  legend,
  days,
  value,
  onChange,
  error,
}: {
  legend: string;
  days: readonly number[];
  value: readonly number[];
  onChange: (next: number[]) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <fieldset
      className="grid gap-2 sm:col-span-2"
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <legend className="mb-2 text-sm leading-5 font-medium">
        <span aria-hidden>{m.periodsDays()}</span>
        <span className="sr-only">{m.periodsDaysOf({ name: legend })}</span>
      </legend>
      <div className="flex flex-wrap gap-x-5 gap-y-3">
        {days.map((day) => (
          <label
            key={day}
            htmlFor={`${id}-${day}`}
            className="flex items-center gap-2 text-sm leading-5"
          >
            <Checkbox
              id={`${id}-${day}`}
              checked={value.includes(day)}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...value.filter((one) => one !== day), day]
                    : value.filter((one) => one !== day),
                )
              }
            />
            {formatWeekday(day)}
          </label>
        ))}
      </div>
      {error ? (
        <p
          id={`${id}-error`}
          className="text-[13px] leading-[18px] text-destructive"
        >
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

const fieldOf = (key: string, path: readonly unknown[]): Field | undefined => {
  if (key === "from") return "from";
  if (key !== "periods") return undefined;
  const [, index, field] = path;
  return typeof index === "number" && typeof field === "string"
    ? `${index}.${field}`
    : "periods";
};

function PeriodsSheet({
  data,
  open,
  onClose,
}: {
  data: PeriodsData;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const segment = segmentOf(data);
  const lastDay = addDays(segment.until, -1);
  const nextKey = useRef(data.periods.length + 1);
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
  const error = (index: number, field: string) => {
    const found = errors[`${index}.${field}`];
    return found ? [found] : undefined;
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
      {drafts.map((draft, index) => {
        const legend =
          inLocale(draft.nameEn || null, draft.nameAr || null) ||
          m.periodsNumber({ number: formatNumber(index + 1) });
        return (
          <fieldset
            key={draft.key}
            className="relative grid gap-4 rounded-lg border p-4 pt-6 sm:grid-cols-2"
          >
            <legend className="px-1 text-sm leading-5 font-semibold">
              {legend}
            </legend>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute end-2 top-2 max-md:size-10"
              aria-label={m.periodsRemove({ name: legend })}
              onClick={() => {
                setErrors({});
                setDrafts((current) =>
                  current.filter((item) => item.key !== draft.key),
                );
              }}
            >
              <X aria-hidden />
            </Button>
            <TextField
              id={`period-name-ar-${draft.key}`}
              label={m.periodsNameArabic()}
              dir="rtl"
              maxLength={60}
              autoComplete="off"
              value={draft.nameAr}
              onChange={(event) =>
                change(draft.key, { nameAr: event.target.value })
              }
              errors={error(index, "nameAr")}
            />
            <TextField
              id={`period-name-en-${draft.key}`}
              label={m.periodsNameEnglish()}
              dir="ltr"
              maxLength={60}
              autoComplete="off"
              value={draft.nameEn}
              onChange={(event) =>
                change(draft.key, { nameEn: event.target.value })
              }
            />
            <SelectField
              id={`period-kind-${draft.key}`}
              label={m.periodsKind()}
              value={draft.kind}
              options={PERIOD_KINDS.map((kind) => ({
                value: kind,
                label: KIND_LABEL[kind](),
              }))}
              onChange={(kind) => change(draft.key, { kind })}
              className="sm:col-span-2"
            />
            <TextField
              id={`period-starts-${draft.key}`}
              label={m.periodsStarts()}
              type="time"
              width="date"
              value={draft.startTime}
              onChange={(event) =>
                change(draft.key, { startTime: event.target.value })
              }
              errors={error(index, "startTime")}
            />
            <TextField
              id={`period-ends-${draft.key}`}
              label={m.periodsEnds()}
              type="time"
              width="date"
              min={draft.startTime || undefined}
              value={draft.endTime}
              onChange={(event) =>
                change(draft.key, { endTime: event.target.value })
              }
              errors={error(index, "endTime")}
            />
            <DayChoices
              legend={legend}
              days={data.days}
              value={draft.weekdays}
              onChange={(weekdays) => change(draft.key, { weekdays })}
              error={error(index, "weekdays")?.[0]}
            />
            {draft.kind === "break" ? null : (
              <div className="sm:col-span-2">
                <CheckboxRow
                  label={m.periodsOfficial()}
                  hint={m.periodsOfficialHint()}
                  checked={draft.official}
                  onChange={(official) => change(draft.key, { official })}
                />
              </div>
            )}
          </fieldset>
        );
      })}
      <Button
        type="button"
        variant="outline"
        className="justify-self-start max-md:h-10"
        onClick={() => {
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
            },
          ]);
        }}
      >
        <Plus aria-hidden />
        {m.periodsAdd()}
      </Button>
    </SheetForm>
  );
}

function PeriodList({ data }: { data: PeriodsData }) {
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
          </div>
          <span className="text-sm leading-5 text-muted-foreground tabular-nums">
            <bdi dir="ltr">{timeRange(period)}</bdi>
          </span>
        </li>
      ))}
    </RecordList>
  );
}

/**
 * A year's school day: its periods with their times and days, as they stand
 * on the day being read, and the dates the day changes shape on.
 */
export function YearPeriods({ yearId, on }: { yearId: string; on: string }) {
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
