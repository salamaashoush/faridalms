import type { PeriodKind } from "@faridalms/domain/timetable";
import type { GridColumn } from "@faridalms/ui/system/data-grid";

import {
  MAX_EXTRA_PERIODS,
  PERIOD_KINDS,
  saveBellScheduleSchema,
} from "@faridalms/domain/timetable";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
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
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { yearPeriodsQuery } from "~/queries/years";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { removeBellSchedule, saveBellSchedule } from "~/server/years";
import { formatList, formatTime } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";
import { schemaErrors } from "~/utils/validation";

type PeriodsData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof yearPeriodsQuery>["queryFn"]>>
>;
type Schedule = PeriodsData["schedules"][number];

interface Row {
  code: string;
  name: string;
  held: boolean;
  startTime: string;
  endTime: string;
}

/** A period of the schedule's own as the editor holds it. */
interface Extra {
  key: number;
  id?: string;
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

const extraName = (extra: Extra) =>
  inLocale(extra.nameEn || null, extra.nameAr || null) ||
  extra.code ||
  m.schedulesExtraNew();

const scheduleName = (schedule: Schedule) =>
  inLocale(schedule.nameEn, schedule.nameAr);

/**
 * The schedule's periods as the editor lists them: every period of the day
 * being read, held with the schedule's time or not held, and any period the
 * schedule names that the day no longer has, kept as it is.
 */
function rowsOf(data: PeriodsData, schedule: Schedule | null): Row[] {
  const known = new Set(data.periods.map((period) => period.code));
  return [
    ...data.periods.map((period) => {
      const times = schedule?.times.find((row) => row.code === period.code);
      return {
        code: period.code,
        name: inLocale(period.nameEn, period.nameAr),
        held: schedule ? times !== undefined : true,
        startTime: times?.startTime ?? period.startTime,
        endTime: times?.endTime ?? period.endTime,
      };
    }),
    ...(schedule?.times ?? [])
      .filter((row) => !known.has(row.code))
      .map((row) => ({ ...row, name: row.code, held: true })),
  ];
}

interface TimesGridOptions {
  change: (code: string, next: Partial<Row>) => void;
}

// Built per render: headers read the request's locale.
function timesGrid({ change }: TimesGridOptions) {
  const rowHeader = {
    header: m.schedulesTimesPeriod(),
    cell: (row: Row) => (
      <label className="flex min-h-8 items-center gap-2 font-medium max-md:min-h-10">
        <Checkbox
          checked={row.held}
          aria-label={row.name}
          onCheckedChange={(held) => change(row.code, { held })}
        />
        <span dir="auto" aria-hidden>
          {row.name}
        </span>
      </label>
    ),
  };
  const columns: GridColumn<Row>[] = [
    {
      id: "starts",
      header: m.periodsStarts(),
      cell: (row) =>
        row.held ? (
          <TimeCell
            id={`schedule-${row.code}-starts`}
            label={m.periodsStartsOf({ name: row.name })}
            value={row.startTime}
            onChange={(startTime) => change(row.code, { startTime })}
          />
        ) : (
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {m.schedulesNotHeld()}
          </span>
        ),
    },
    {
      id: "ends",
      header: m.periodsEnds(),
      cell: (row) =>
        row.held ? (
          <TimeCell
            id={`schedule-${row.code}-ends`}
            label={m.periodsEndsOf({ name: row.name })}
            min={row.startTime || undefined}
            value={row.endTime}
            onChange={(endTime) => change(row.code, { endTime })}
          />
        ) : null,
    },
  ];
  return { rowHeader, columns };
}

interface ExtrasGridOptions {
  change: (key: number, next: Partial<Extra>) => void;
  remove: (key: number) => void;
}

// Built per render: headers read the request's locale.
function extrasGrid({ change, remove }: ExtrasGridOptions) {
  const rowHeader = {
    header: m.periodsColEnglish(),
    cell: (extra: Extra) => (
      <TextCell
        id={`extra-${extra.key}-name-en`}
        label={m.periodsNameEnglishOf({ name: extraName(extra) })}
        dir="ltr"
        maxLength={60}
        value={extra.nameEn}
        onChange={(nameEn) => change(extra.key, { nameEn })}
      />
    ),
  };
  const columns: GridColumn<Extra>[] = [
    {
      id: "ar",
      header: m.periodsColArabic(),
      cell: (extra) => (
        <TextCell
          id={`extra-${extra.key}-name-ar`}
          label={m.periodsNameArabicOf({ name: extraName(extra) })}
          lang="ar"
          maxLength={60}
          value={extra.nameAr}
          onChange={(nameAr) => change(extra.key, { nameAr })}
        />
      ),
    },
    {
      id: "starts",
      header: m.periodsStarts(),
      cell: (extra) => (
        <TimeCell
          id={`extra-${extra.key}-starts`}
          label={m.periodsStartsOf({ name: extraName(extra) })}
          value={extra.startTime}
          onChange={(startTime) => change(extra.key, { startTime })}
        />
      ),
    },
    {
      id: "ends",
      header: m.periodsEnds(),
      cell: (extra) => (
        <TimeCell
          id={`extra-${extra.key}-ends`}
          label={m.periodsEndsOf({ name: extraName(extra) })}
          min={extra.startTime || undefined}
          value={extra.endTime}
          onChange={(endTime) => change(extra.key, { endTime })}
        />
      ),
    },
  ];
  const rowEnd = (extra: Extra) => (
    <GridRemoveButton
      label={m.schedulesExtraRemove({ name: extraName(extra) })}
      onRemove={() => remove(extra.key)}
    />
  );
  const rowDetail = (extra: Extra) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="w-32">
        <TextCell
          id={`extra-${extra.key}-code`}
          label={m.schedulesExtraCodeOf({ name: extraName(extra) })}
          dir="ltr"
          maxLength={20}
          placeholder={m.schedulesExtraCode()}
          value={extra.code}
          onChange={(code) => change(extra.key, { code })}
        />
      </span>
      <span className="w-32">
        <SelectCell
          id={`extra-${extra.key}-kind`}
          label={m.periodsKindOf({ name: extraName(extra) })}
          value={extra.kind}
          options={PERIOD_KINDS.map((kind) => ({
            value: kind,
            label: KIND_LABEL[kind](),
          }))}
          onChange={(kind) => change(extra.key, { kind })}
        />
      </span>
    </div>
  );
  return { rowHeader, columns, rowEnd, rowDetail };
}

interface ScheduleSheetProps {
  data: PeriodsData;
  schedule: Schedule | null;
  onClose: () => void;
}

function ScheduleSheet({ data, schedule, onClose }: ScheduleSheetProps) {
  const queryClient = useQueryClient();
  const [nameEn, setNameEn] = useState(schedule?.nameEn ?? "");
  const [nameAr, setNameAr] = useState(schedule?.nameAr ?? "");
  const [rows, setRows] = useState(() => rowsOf(data, schedule));
  const [extras, setExtras] = useState<Extra[]>(() =>
    (schedule?.extras ?? []).map((extra, key) => ({
      ...extra,
      key,
      nameEn: extra.nameEn ?? "",
      nameAr: extra.nameAr ?? "",
    })),
  );
  const nextKey = useRef(extras.length);
  const focusLater = useFocusAfterRender();
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const payload = {
    yearId: data.year.id,
    ...(schedule ? { id: schedule.id, version: schedule.version } : {}),
    nameEn,
    nameAr,
    times: rows
      .filter((row) => row.held)
      .map((row) => ({
        code: row.code,
        startTime: row.startTime,
        endTime: row.endTime,
      })),
    extras: extras.map(({ key: _key, ...extra }) => extra),
  };
  const save = useMutation({
    mutationFn: () => saveBellSchedule({ data: payload }),
    meta: { inlineError: true },
  });
  const change = (code: string, next: Partial<Row>) => {
    setErrors({});
    setRows((current) =>
      current.map((row) => (row.code === code ? { ...row, ...next } : row)),
    );
  };
  const addExtra =
    extras.length < MAX_EXTRA_PERIODS ? (
      <GridAddButton
        label={m.schedulesExtraAdd()}
        onAdd={() => {
          const key = nextKey.current;
          nextKey.current += 1;
          setErrors({});
          setExtras((current) => [
            ...current,
            {
              key,
              code: "",
              nameEn: "",
              nameAr: "",
              kind: "registration",
              startTime: "",
              endTime: "",
            },
          ]);
          focusLater(`extra-${key}-name-en`);
        }}
      />
    ) : null;
  const changeExtra = (key: number, next: Partial<Extra>) => {
    setErrors({});
    setExtras((current) =>
      current.map((extra) =>
        extra.key === key ? { ...extra, ...next } : extra,
      ),
    );
  };
  return (
    <SheetForm
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        schedule
          ? m.schedulesEdit({ name: scheduleName(schedule) })
          : m.schedulesAdd()
      }
      pending={save.isPending}
      error={
        save.error
          ? getMessageFromError(save.error)
          : (errors.times ?? errors.extras ?? null)
      }
      onSubmit={async () => {
        const found = schemaErrors(saveBellScheduleSchema, payload, fieldOf);
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        try {
          await save.mutateAsync();
        } catch {
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ["years"] });
        await queryClient.invalidateQueries({ queryKey: ["timetable"] });
        toast.success(m.schedulesSaved());
        onClose();
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
          setErrors({});
          setNameAr(event.target.value);
        }}
        errors={errors.nameAr ? [errors.nameAr] : undefined}
      />
      <TextField
        id="schedule-name-en"
        label={m.periodsNameEnglish()}
        dir="ltr"
        maxLength={60}
        autoComplete="off"
        value={nameEn}
        onChange={(event) => {
          setErrors({});
          setNameEn(event.target.value);
        }}
      />
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm leading-5 font-medium">
          {m.schedulesTimesLegend()}
        </legend>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.schedulesPeriodsHint()}
        </p>
        <DataGrid<Row>
          caption={m.schedulesTimesLegend()}
          editing
          surface="sheet"
          {...timesGrid({ change })}
          groups={[{ id: "times", title: "", rows }]}
          rowKey={(row) => row.code}
        />
      </fieldset>
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm leading-5 font-medium">
          {m.schedulesExtrasLegend()}
        </legend>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.schedulesExtrasHint()}
        </p>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.schedulesExtraCodeHint()}
        </p>
        {extras.length ? (
          <DataGrid<Extra>
            caption={m.schedulesExtrasLegend()}
            editing
            surface="sheet"
            {...extrasGrid({
              change: changeExtra,
              remove: (key) => {
                setErrors({});
                setExtras((current) =>
                  current.filter((item) => item.key !== key),
                );
              },
            })}
            groups={[{ id: "extras", title: "", rows: extras }]}
            rowKey={(extra) => String(extra.key)}
            footer={addExtra}
          />
        ) : (
          <div>{addExtra}</div>
        )}
      </fieldset>
    </SheetForm>
  );
}

interface ScheduleItemProps {
  data: PeriodsData;
  schedule: Schedule;
  onEdit: () => void;
  onRemove: () => void;
}

function ScheduleItem({ data, schedule, onEdit, onRemove }: ScheduleItemProps) {
  const nameOf = (code: string) => {
    const period = data.periods.find((row) => row.code === code);
    return period ? inLocale(period.nameEn, period.nameAr) : code;
  };
  const name = scheduleName(schedule);
  const held = [
    ...schedule.times.map((row) => ({ ...row, name: nameOf(row.code) })),
    ...schedule.extras.map((row) => ({
      ...row,
      name: inLocale(row.nameEn, row.nameAr) || row.code,
    })),
  ].toSorted((a, b) => a.startTime.localeCompare(b.startTime));
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-3">
      <div className="grid min-w-0 gap-0.5">
        <span dir="auto" className="text-sm leading-5 font-medium">
          {name}
        </span>
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {formatList(
            held.map(
              (row) =>
                `${row.name} ${m.ttTimeRange({
                  from: formatTime(row.startTime),
                  to: formatTime(row.endTime),
                })}`,
            ),
          )}
        </span>
        {schedule.extras.length > 0 ? (
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {m.schedulesExtrasOwn({
              names: formatList(
                schedule.extras.map(
                  (row) => inLocale(row.nameEn, row.nameAr) || row.code,
                ),
              ),
            })}
          </span>
        ) : null}
      </div>

      {data.canEdit ? (
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="max-md:size-10"
            aria-label={m.schedulesEdit({ name })}
            onClick={onEdit}
          >
            <Pencil aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="max-md:size-10"
            aria-label={m.schedulesRemove({ name })}
            onClick={onRemove}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      ) : null}
    </li>
  );
}

export interface BellSchedulesProps {
  data: PeriodsData;
}

/**
 * The year's other days: bell schedules giving the periods other times on
 * the days that choose them, such as a late start or Ramadan hours.
 */
export function BellSchedules({ data }: BellSchedulesProps) {
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState<{
    schedule: Schedule | null;
    key: number;
  } | null>(null);
  const [removing, setRemoving] = useState<Schedule | null>(null);
  const remove = useMutation({
    mutationFn: (schedule: Schedule) =>
      removeBellSchedule({
        data: { id: schedule.id, version: schedule.version },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["years"] });
      await queryClient.invalidateQueries({ queryKey: ["timetable"] });
      toast.success(m.schedulesRemoved());
      setRemoving(null);
    },
  });
  const open = (schedule: Schedule | null) =>
    setSheet((current) => ({ schedule, key: (current?.key ?? 0) + 1 }));
  return (
    <RecordSection
      title={m.schedulesTitle()}
      description={m.schedulesHint()}
      action={
        data.canEdit && data.periods.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={() => open(null)}
          >
            <Plus aria-hidden />
            {m.schedulesAdd()}
          </Button>
        ) : undefined
      }
    >
      {data.schedules.length === 0 ? (
        <RecordEmpty>{m.schedulesNone()}</RecordEmpty>
      ) : (
        <RecordList>
          {data.schedules.map((schedule) => (
            <ScheduleItem
              key={schedule.id}
              data={data}
              schedule={schedule}
              onEdit={() => open(schedule)}
              onRemove={() => {
                remove.reset();
                setRemoving(schedule);
              }}
            />
          ))}
        </RecordList>
      )}
      {sheet ? (
        <ScheduleSheet
          key={sheet.key}
          data={data}
          schedule={sheet.schedule}
          onClose={() => setSheet(null)}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={m.schedulesRemoveTitle()}
        body={m.schedulesRemoveBody()}
        confirmLabel={m.schedulesRemoveConfirm()}
        pending={remove.isPending}
        error={remove.error ? getMessageFromError(remove.error) : undefined}
        onConfirm={() => {
          if (removing) remove.mutate(removing);
        }}
        onCancel={() => setRemoving(null)}
      />
    </RecordSection>
  );
}
