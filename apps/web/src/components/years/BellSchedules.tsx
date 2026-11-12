import type { PeriodKind } from "@faridalms/domain/timetable";
import type { Column, RowAction } from "@faridalms/ui/system/data-table";
import type { ReactNode } from "react";

import {
  MAX_EXTRA_PERIODS,
  PERIOD_KINDS,
  saveBellScheduleSchema,
} from "@faridalms/domain/timetable";
import { Button } from "@faridalms/ui/button";
import { DataTable, RowButton } from "@faridalms/ui/system/data-table";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { RecordSection } from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { SheetPanel } from "@faridalms/ui/system/sheet-panel";
import { Value } from "@faridalms/ui/system/value";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { yearPeriodsQuery } from "~/queries/periods";

import { CheckboxRow } from "~/components/people/fields";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { removeBellSchedule, saveBellSchedule } from "~/server/periods";
import { formatList, formatNumber, formatTime } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";
import { schemaErrors } from "~/utils/validation";

type PeriodsData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof yearPeriodsQuery>["queryFn"]>>
>;
type Schedule = PeriodsData["schedules"][number];

/** A period of the day as a schedule holds it: at other times, or not at all. */
interface TimesRow {
  id: string;
  code: string;
  name: string;
  held: boolean;
  startTime: string;
  endTime: string;
}

/** A period of the schedule's own. */
interface Extra {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  kind: PeriodKind;
  startTime: string;
  endTime: string;
}

type Field = "nameAr" | "times" | "extras";

const fieldOf = (key: string): Field | undefined =>
  key === "nameAr" || key === "nameEn"
    ? "nameAr"
    : key === "times" || key === "extras"
      ? key
      : undefined;

const KIND_LABEL: Record<PeriodKind, () => string> = {
  lesson: m.periodsKindLesson,
  registration: m.periodsKindRegistration,
  break: m.periodsKindBreak,
  other: m.periodsKindOther,
};

const scheduleName = (schedule: Pick<Schedule, "nameEn" | "nameAr">) =>
  inLocale(schedule.nameEn, schedule.nameAr);

const extraName = (extra: Pick<Extra, "nameEn" | "nameAr" | "code">) =>
  inLocale(extra.nameEn || null, extra.nameAr || null) ||
  extra.code ||
  m.schedulesExtraNew();

const timeRange = (row: { startTime: string; endTime: string }) =>
  m.ttTimeRange({
    from: formatTime(row.startTime),
    to: formatTime(row.endTime),
  });

/**
 * The schedule's periods as the editor lists them: every period of the day
 * being read, held with the schedule's time or not held, and any period the
 * schedule names that the day no longer has, kept as it is.
 */
function rowsOf(data: PeriodsData, schedule: Schedule | null): TimesRow[] {
  const known = new Set(data.periods.map((period) => period.code));
  return [
    ...data.periods.map((period) => {
      const times = schedule?.times.find((row) => row.code === period.code);
      return {
        id: period.code,
        code: period.code,
        name: inLocale(period.nameEn, period.nameAr),
        held: schedule ? times !== undefined : true,
        startTime: times?.startTime ?? period.startTime,
        endTime: times?.endTime ?? period.endTime,
      };
    }),
    ...(schedule?.times ?? [])
      .filter((row) => !known.has(row.code))
      .map((row) => ({
        id: row.code,
        code: row.code,
        name: row.code,
        held: true,
        startTime: row.startTime,
        endTime: row.endTime,
      })),
  ];
}

const extrasOf = (schedule: Schedule | null): Extra[] =>
  (schedule?.extras ?? []).map((extra) => ({
    id: extra.code,
    code: extra.code,
    kind: extra.kind,
    startTime: extra.startTime,
    endTime: extra.endTime,
    nameEn: extra.nameEn ?? "",
    nameAr: extra.nameAr ?? "",
  }));

interface ScheduleValues {
  nameEn: string;
  nameAr: string;
  rows: TimesRow[];
  extras: Extra[];
}

/** What a schedule saves as, from its values. */
function payloadOf(
  data: PeriodsData,
  schedule: Schedule | null,
  values: ScheduleValues,
) {
  return {
    yearId: data.year.id,
    ...(schedule ? { id: schedule.id, version: schedule.version } : {}),
    nameEn: values.nameEn,
    nameAr: values.nameAr,
    times: values.rows
      .filter((row) => row.held)
      .map((row) => ({
        code: row.code,
        startTime: row.startTime,
        endTime: row.endTime,
      })),
    extras: values.extras.map(({ id: _id, ...extra }) => extra),
  };
}

const valuesOf = (data: PeriodsData, schedule: Schedule): ScheduleValues => ({
  nameEn: schedule.nameEn ?? "",
  nameAr: schedule.nameAr ?? "",
  rows: rowsOf(data, schedule),
  extras: extrasOf(schedule),
});

/** Saves one change to a schedule, the rest as it is saved. */
function useScheduleSave(data: PeriodsData, schedule: Schedule | null) {
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const mutation = useMutation({
    mutationFn: (payload: ReturnType<typeof payloadOf>) =>
      saveBellSchedule({ data: payload }),
    meta: { inlineError: true },
  });
  return {
    errors,
    mutation,
    clear: () => {
      setErrors({});
      mutation.reset();
    },
    error: mutation.error
      ? getMessageFromError(mutation.error)
      : (errors.times ?? errors.extras ?? null),
    /** The saved schedule's id, or null when it was refused. */
    save: async (values: ScheduleValues) => {
      const payload = payloadOf(data, schedule, values);
      const found = schemaErrors(saveBellScheduleSchema, payload, fieldOf);
      setErrors(found);
      if (Object.keys(found).length > 0) return null;
      let saved: { id: string };
      try {
        saved = await mutation.mutateAsync(payload);
      } catch {
        return null;
      }
      await queryClient.invalidateQueries({ queryKey: ["years"] });
      await queryClient.invalidateQueries({ queryKey: ["timetable"] });
      toast.success(m.schedulesSaved());
      return saved.id;
    },
  };
}

const endsAfter = (row: { startTime: string; endTime: string }) =>
  Boolean(row.startTime && row.endTime && row.endTime > row.startTime);

interface NamesSheetProps {
  data: PeriodsData;
  /** The schedule being renamed; none to add one. */
  schedule: Schedule | null;
  open: boolean;
  onSaved: (id: string) => void;
  onClose: () => void;
}

/**
 * A schedule's names. A new one starts with every period at its own times,
 * which its rows then change one at a time.
 */
function NamesSheet({
  data,
  schedule,
  open,
  onSaved,
  onClose,
}: NamesSheetProps) {
  const [nameEn, setNameEn] = useState(schedule?.nameEn ?? "");
  const [nameAr, setNameAr] = useState(schedule?.nameAr ?? "");
  const save = useScheduleSave(data, schedule);
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        schedule
          ? m.schedulesRename({ name: scheduleName(schedule) })
          : m.schedulesAdd()
      }
      submitLabel={schedule ? m.schedulesSaveNames() : m.schedulesAdd()}
      pending={save.mutation.isPending}
      error={save.error}
      onSubmit={async () => {
        const id = await save.save({
          nameEn,
          nameAr,
          rows: rowsOf(data, schedule),
          extras: extrasOf(schedule),
        });
        if (!id) return;
        onClose();
        onSaved(id);
      }}
    >
      <TextField
        id="schedule-name-ar"
        label={m.periodsNameArabic()}
        dir="rtl"
        maxLength={60}
        autoComplete="off"
        value={nameAr}
        onChange={(event) => {
          save.clear();
          setNameAr(event.target.value);
        }}
        errors={save.errors.nameAr ? [save.errors.nameAr] : undefined}
      />
      <TextField
        id="schedule-name-en"
        label={m.periodsNameEnglish()}
        dir="ltr"
        maxLength={60}
        autoComplete="off"
        value={nameEn}
        onChange={(event) => {
          save.clear();
          setNameEn(event.target.value);
        }}
      />
      {schedule ? null : (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.schedulesStartsHint()}
        </p>
      )}
    </SheetForm>
  );
}

interface TimesSheetProps {
  data: PeriodsData;
  schedule: Schedule;
  row: TimesRow;
  open: boolean;
  onClose: () => void;
}

/** One period of the day on this schedule: held at other times, or not. */
function TimesSheet({ data, schedule, row, open, onClose }: TimesSheetProps) {
  const [held, setHeld] = useState(row.held);
  const [startTime, setStartTime] = useState(row.startTime);
  const [endTime, setEndTime] = useState(row.endTime);
  const [tried, setTried] = useState(false);
  const save = useScheduleSave(data, schedule);
  const backwards = held && tried && !endsAfter({ startTime, endTime });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={m.schedulesTimesOf({
        period: row.name,
        schedule: scheduleName(schedule),
      })}
      submitLabel={m.schedulesSaveTimes()}
      pending={save.mutation.isPending}
      error={save.error}
      onSubmit={async () => {
        setTried(true);
        if (held && !endsAfter({ startTime, endTime })) return;
        const values = valuesOf(data, schedule);
        const id = await save.save({
          ...values,
          rows: values.rows.map((other) =>
            other.code === row.code
              ? Object.assign({}, other, { held, startTime, endTime })
              : other,
          ),
        });
        if (id) onClose();
      }}
    >
      <CheckboxRow
        label={m.schedulesHeld()}
        hint={m.schedulesPeriodsHint()}
        checked={held}
        onChange={(next) => {
          save.clear();
          setHeld(next);
        }}
      />
      {held ? (
        <div className="flex flex-wrap gap-4">
          <TextField
            id="schedule-starts"
            label={m.periodsStarts()}
            type="time"
            width="date"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
          <TextField
            id="schedule-ends"
            label={m.periodsEnds()}
            type="time"
            width="date"
            min={startTime || undefined}
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
            errors={backwards ? [m.validationEndTime()] : undefined}
          />
        </div>
      ) : null}
    </SheetForm>
  );
}

interface ExtraSheetProps {
  data: PeriodsData;
  schedule: Schedule;
  /** The period being changed; none to add one. */
  extra: Extra | null;
  open: boolean;
  onClose: () => void;
}

/** A period of the schedule's own: its names, code, kind and times. */
function ExtraSheet({ data, schedule, extra, open, onClose }: ExtraSheetProps) {
  const [draft, setDraft] = useState<Extra>(
    () =>
      extra ?? {
        id: "",
        code: "",
        nameEn: "",
        nameAr: "",
        kind: "registration",
        startTime: "",
        endTime: "",
      },
  );
  const [tried, setTried] = useState(false);
  const save = useScheduleSave(data, schedule);
  const set = (change: Partial<Extra>) => {
    save.clear();
    setDraft((current) => ({ ...current, ...change }));
  };
  const backwards = tried && !endsAfter(draft);
  const codeless = tried && !draft.code.trim();
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        extra
          ? m.schedulesExtraEdit({ name: extraName(extra) })
          : m.schedulesExtraAdd()
      }
      submitLabel={extra ? m.schedulesExtraSave() : m.schedulesExtraAdd()}
      pending={save.mutation.isPending}
      error={save.error}
      onSubmit={async () => {
        setTried(true);
        if (!endsAfter(draft) || !draft.code.trim()) return;
        const values = valuesOf(data, schedule);
        const id = await save.save({
          ...values,
          extras: extra
            ? values.extras.map((other) =>
                other.id === extra.id ? draft : other,
              )
            : [...values.extras, draft],
        });
        if (id) onClose();
      }}
    >
      <TextField
        id="extra-name-en"
        label={m.periodsNameEnglish()}
        dir="ltr"
        maxLength={60}
        autoComplete="off"
        value={draft.nameEn}
        onChange={(event) => set({ nameEn: event.target.value })}
      />
      <TextField
        id="extra-name-ar"
        label={m.periodsNameArabic()}
        lang="ar"
        dir="rtl"
        maxLength={60}
        autoComplete="off"
        value={draft.nameAr}
        onChange={(event) => set({ nameAr: event.target.value })}
      />
      <TextField
        id="extra-code"
        label={m.schedulesExtraCode()}
        hint={m.schedulesExtraCodeHint()}
        dir="ltr"
        width="code"
        maxLength={20}
        autoComplete="off"
        value={draft.code}
        onChange={(event) => set({ code: event.target.value })}
        errors={codeless ? [m.schedulesExtraCodeNeeded()] : undefined}
      />
      <SelectField
        id="extra-kind"
        label={m.periodsKind()}
        value={draft.kind}
        options={PERIOD_KINDS.map((kind) => ({
          value: kind,
          label: KIND_LABEL[kind](),
        }))}
        onChange={(kind) => set({ kind })}
        width="date"
      />
      <div className="flex flex-wrap gap-4">
        <TextField
          id="extra-starts"
          label={m.periodsStarts()}
          type="time"
          width="date"
          value={draft.startTime}
          onChange={(event) => set({ startTime: event.target.value })}
        />
        <TextField
          id="extra-ends"
          label={m.periodsEnds()}
          type="time"
          width="date"
          min={draft.startTime || undefined}
          value={draft.endTime}
          onChange={(event) => set({ endTime: event.target.value })}
          errors={backwards ? [m.validationEndTime()] : undefined}
        />
      </div>
    </SheetForm>
  );
}

type TimesOpener = (row: TimesRow) => ReactNode;

// Built per render: headers read the request's locale.
function timesColumns(opener: TimesOpener): Column<TimesRow>[] {
  return [
    {
      id: "period",
      header: m.schedulesTimesPeriod(),
      primary: true,
      cell: opener,
    },
    {
      id: "time",
      header: m.periodsTime(),
      cell: (row) =>
        row.held ? (
          <bdi>{timeRange(row)}</bdi>
        ) : (
          <Value absent={m.schedulesNotHeld()} />
        ),
    },
  ];
}

type ExtraOpener = (extra: Extra) => ReactNode;

// Built per render: headers read the request's locale.
function extraColumns(opener: ExtraOpener): Column<Extra>[] {
  return [
    {
      id: "name",
      header: m.schedulesTimesPeriod(),
      primary: true,
      cell: opener,
    },
    {
      id: "code",
      header: m.schedulesExtraCode(),
      cell: (extra) => (
        <span dir="ltr" className="font-mono text-[13px] leading-[18px]">
          {extra.code}
        </span>
      ),
    },
    {
      id: "kind",
      header: m.periodsKind(),
      cell: (extra) => KIND_LABEL[extra.kind](),
    },
    {
      id: "time",
      header: m.periodsTime(),
      cell: (extra) => <bdi>{timeRange(extra)}</bdi>,
    },
  ];
}

interface PanelSheet {
  kind: "times" | "extra";
  row: TimesRow | null;
  extra: Extra | null;
  key: number;
  open: boolean;
}

interface SchedulePanelProps {
  data: PeriodsData;
  schedule: Schedule;
  open: boolean;
  onClose: () => void;
}

/**
 * A bell schedule's day: each period of the day at the schedule's times or
 * not held, and the periods of its own, each changed and saved on its own.
 */
function SchedulePanel({ data, schedule, open, onClose }: SchedulePanelProps) {
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState<PanelSheet | null>(null);
  const show = (next: Omit<PanelSheet, "key" | "open">) =>
    setSheet((current) => ({
      ...next,
      key: (current?.key ?? 0) + 1,
      open: true,
    }));
  const close = () =>
    setSheet((current) => current && { ...current, open: false });
  const rows = rowsOf(data, schedule);
  const extras = extrasOf(schedule);
  const timesOpener: TimesOpener = (row) =>
    data.canEdit ? (
      <RowButton onClick={() => show({ kind: "times", row, extra: null })}>
        {row.name}
      </RowButton>
    ) : (
      <span dir="auto" className="font-medium">
        {row.name}
      </span>
    );
  const extraOpener: ExtraOpener = (extra) =>
    data.canEdit ? (
      <RowButton onClick={() => show({ kind: "extra", row: null, extra })}>
        {extraName(extra)}
      </RowButton>
    ) : (
      <span dir="auto" className="font-medium">
        {extraName(extra)}
      </span>
    );
  const addExtra =
    data.canEdit && extras.length < MAX_EXTRA_PERIODS ? (
      <Button
        type="button"
        variant="outline"
        className="max-md:h-10"
        onClick={() => show({ kind: "extra", row: null, extra: null })}
      >
        <Plus aria-hidden />
        {m.schedulesExtraAdd()}
      </Button>
    ) : undefined;
  const removeExtra = async (extra: Extra) => {
    const values = valuesOf(data, schedule);
    await saveBellSchedule({
      data: payloadOf(data, schedule, {
        ...values,
        extras: values.extras.filter((other) => other.id !== extra.id),
      }),
    });
    await queryClient.invalidateQueries({ queryKey: ["years"] });
    await queryClient.invalidateQueries({ queryKey: ["timetable"] });
    toast.success(m.schedulesSaved());
  };
  return (
    <>
      <SheetPanel
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        title={scheduleName(schedule)}
        description={m.schedulesHint()}
      >
        <section aria-labelledby="schedule-times" className="grid gap-2">
          <h3 id="schedule-times" className="text-sm leading-5 font-medium">
            {m.schedulesTimesLegend()}
          </h3>
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {m.schedulesPeriodsHint()}
          </p>
          <DataTable
            caption={m.schedulesTimesLegend()}
            rows={rows}
            columns={timesColumns(timesOpener)}
            rowLabel={(row) => row.name}
            rowActions={
              data.canEdit
                ? (row) => [
                    {
                      label: m.recordEdit(),
                      icon: Pencil,
                      onSelect: () => show({ kind: "times", row, extra: null }),
                    },
                  ]
                : undefined
            }
            card={{
              title: timesOpener,
              fact: (row) => (row.held ? timeRange(row) : m.schedulesNotHeld()),
            }}
            empty={{ icon: Clock, title: m.periodsNone() }}
          />
        </section>
        <section aria-labelledby="schedule-extras" className="grid gap-2">
          <h3 id="schedule-extras" className="text-sm leading-5 font-medium">
            {m.schedulesExtrasLegend()}
          </h3>
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {m.schedulesExtrasHint()}
          </p>
          <DataTable
            caption={m.schedulesExtrasLegend()}
            rows={extras}
            columns={extraColumns(extraOpener)}
            rowLabel={extraName}
            rowActions={
              data.canEdit
                ? (extra): RowAction[] => [
                    {
                      label: m.recordEdit(),
                      icon: Pencil,
                      onSelect: () => show({ kind: "extra", row: null, extra }),
                    },
                    {
                      label: m.schedulesExtraRemoveAction(),
                      icon: Trash2,
                      destructive: true,
                      confirm: {
                        title: m.schedulesExtraRemoveTitle({
                          name: extraName(extra),
                        }),
                        body: m.schedulesExtraRemoveBody(),
                        label: m.schedulesExtraRemoveAction(),
                      },
                      onSelect: () => removeExtra(extra),
                    },
                  ]
                : undefined
            }
            actions={addExtra}
            card={{
              title: extraOpener,
              fact: (extra) =>
                `${KIND_LABEL[extra.kind]()} · ${timeRange(extra)}`,
            }}
            empty={{ title: m.schedulesExtrasNone(), action: addExtra }}
          />
        </section>
      </SheetPanel>
      {sheet?.kind === "times" && sheet.row ? (
        <TimesSheet
          key={sheet.key}
          data={data}
          schedule={schedule}
          row={sheet.row}
          open={sheet.open}
          onClose={close}
        />
      ) : sheet?.kind === "extra" ? (
        <ExtraSheet
          key={sheet.key}
          data={data}
          schedule={schedule}
          extra={sheet.extra}
          open={sheet.open}
          onClose={close}
        />
      ) : null}
    </>
  );
}

type ScheduleOpener = (schedule: Schedule) => ReactNode;

// Built per render: headers read the request's locale.
function scheduleColumns(
  data: PeriodsData,
  opener: ScheduleOpener,
): Column<Schedule>[] {
  return [
    {
      id: "name",
      header: m.schedulesSchedule(),
      primary: true,
      cell: (schedule) => (
        <span className="grid gap-0.5 py-1.5">
          {opener(schedule)}
          {schedule.extras.length > 0 ? (
            <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
              {m.schedulesExtrasOwn({
                names: formatList(
                  schedule.extras.map(
                    (row) => inLocale(row.nameEn, row.nameAr) || row.code,
                  ),
                ),
              })}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: "held",
      header: m.schedulesHeldColumn(),
      align: "end",
      cell: (schedule) =>
        m.schedulesHeldCount({
          held: formatNumber(schedule.times.length),
          total: formatNumber(data.periods.length),
        }),
    },
  ];
}

export interface BellSchedulesProps {
  data: PeriodsData;
}

/**
 * The year's other days: bell schedules giving the periods other times on
 * the days that choose them, such as a late start or Ramadan hours. Each
 * schedule opens to its periods, each changed on its own.
 */
export function BellSchedules({ data }: BellSchedulesProps) {
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<{
    id: string;
    key: number;
    open: boolean;
  } | null>(null);
  const [names, setNames] = useState<{
    schedule: Schedule | null;
    key: number;
    open: boolean;
  } | null>(null);
  const openPanel = (id: string) =>
    setPanel((current) => ({ id, key: (current?.key ?? 0) + 1, open: true }));
  const openNames = (schedule: Schedule | null) =>
    setNames((current) => ({
      schedule,
      key: (current?.key ?? 0) + 1,
      open: true,
    }));
  const shown = panel
    ? data.schedules.find((schedule) => schedule.id === panel.id)
    : undefined;
  const opener: ScheduleOpener = (schedule) => (
    <RowButton onClick={() => openPanel(schedule.id)}>
      {scheduleName(schedule)}
    </RowButton>
  );
  const add = (variant: "default" | "outline") =>
    data.canEdit && data.periods.length > 0 ? (
      <Button
        type="button"
        variant={variant}
        className="max-md:h-10"
        onClick={() => openNames(null)}
      >
        <Plus aria-hidden />
        {m.schedulesAdd()}
      </Button>
    ) : undefined;
  const rowActions = (schedule: Schedule): RowAction[] => [
    {
      label: m.schedulesChangeTimes(),
      icon: CalendarClock,
      onSelect: () => openPanel(schedule.id),
    },
    ...(data.canEdit
      ? [
          {
            label: m.schedulesRenameAction(),
            icon: Pencil,
            onSelect: () => openNames(schedule),
          },
          {
            label: m.schedulesRemoveConfirm(),
            icon: Trash2,
            destructive: true as const,
            confirm: {
              title: m.schedulesRemoveTitle(),
              body: m.schedulesRemoveBody(),
              label: m.schedulesRemoveConfirm(),
            },
            onSelect: async () => {
              await removeBellSchedule({
                data: { id: schedule.id, version: schedule.version },
              });
              await queryClient.invalidateQueries({ queryKey: ["years"] });
              await queryClient.invalidateQueries({ queryKey: ["timetable"] });
              toast.success(m.schedulesRemoved());
            },
          },
        ]
      : []),
  ];
  return (
    <RecordSection title={m.schedulesTitle()} description={m.schedulesHint()}>
      <DataTable
        caption={m.schedulesTitle()}
        rows={data.schedules}
        columns={scheduleColumns(data, opener)}
        rowLabel={scheduleName}
        rowActions={rowActions}
        actions={add("outline")}
        card={{
          title: opener,
          fact: (schedule) =>
            m.schedulesHeldCount({
              held: formatNumber(schedule.times.length),
              total: formatNumber(data.periods.length),
            }),
        }}
        empty={{ title: m.schedulesNone(), action: add("outline") }}
      />
      {names ? (
        <NamesSheet
          key={names.key}
          data={data}
          schedule={names.schedule}
          open={names.open}
          onSaved={(id) => {
            if (!names.schedule) openPanel(id);
          }}
          onClose={() =>
            setNames((current) => current && { ...current, open: false })
          }
        />
      ) : null}
      {panel && shown ? (
        <SchedulePanel
          key={panel.key}
          data={data}
          schedule={shown}
          open={panel.open}
          onClose={() =>
            setPanel((current) => current && { ...current, open: false })
          }
        />
      ) : null}
    </RecordSection>
  );
}
