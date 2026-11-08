import type { PeriodKind } from "@faridalms/domain/timetable";

import {
  MAX_EXTRA_PERIODS,
  PERIOD_KINDS,
  saveBellScheduleSchema,
} from "@faridalms/domain/timetable";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import {
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useId, useRef, useState } from "react";
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

interface ScheduleSheetProps {
  data: PeriodsData;
  schedule: Schedule | null;
  onClose: () => void;
}

function ScheduleSheet({ data, schedule, onClose }: ScheduleSheetProps) {
  const queryClient = useQueryClient();
  const id = useId();
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
        {rows.map((row) => (
          <div
            key={row.code}
            className="grid items-end gap-3 rounded-md border p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
          >
            <label
              htmlFor={`${id}-${row.code}`}
              className="flex min-h-9 items-center gap-2 text-sm leading-5 font-medium"
            >
              <Checkbox
                id={`${id}-${row.code}`}
                checked={row.held}
                onCheckedChange={(held) => change(row.code, { held })}
              />
              <span dir="auto">{row.name}</span>
            </label>
            {row.held ? (
              <>
                <TextField
                  id={`${id}-${row.code}-starts`}
                  label={m.periodsStarts()}
                  type="time"
                  width="date"
                  value={row.startTime}
                  onChange={(event) =>
                    change(row.code, { startTime: event.target.value })
                  }
                />
                <TextField
                  id={`${id}-${row.code}-ends`}
                  label={m.periodsEnds()}
                  type="time"
                  width="date"
                  min={row.startTime || undefined}
                  value={row.endTime}
                  onChange={(event) =>
                    change(row.code, { endTime: event.target.value })
                  }
                />
              </>
            ) : (
              <p className="text-[13px] leading-9 text-muted-foreground sm:col-span-2">
                {m.schedulesNotHeld()}
              </p>
            )}
          </div>
        ))}
      </fieldset>
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm leading-5 font-medium">
          {m.schedulesExtrasLegend()}
        </legend>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.schedulesExtrasHint()}
        </p>
        {extras.map((extra) => (
          <fieldset
            key={extra.key}
            className="relative grid gap-3 rounded-md border p-3 pe-12 sm:grid-cols-2"
          >
            <legend className="sr-only">{extraName(extra)}</legend>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute end-2 top-2 max-md:size-10"
              aria-label={m.schedulesExtraRemove({ name: extraName(extra) })}
              onClick={() => {
                setErrors({});
                setExtras((current) =>
                  current.filter((item) => item.key !== extra.key),
                );
              }}
            >
              <X aria-hidden />
            </Button>
            <TextField
              id={`${id}-extra-${extra.key}-name-ar`}
              label={m.periodsNameArabic()}
              dir="rtl"
              maxLength={60}
              autoComplete="off"
              value={extra.nameAr}
              onChange={(event) =>
                changeExtra(extra.key, { nameAr: event.target.value })
              }
            />
            <TextField
              id={`${id}-extra-${extra.key}-name-en`}
              label={m.periodsNameEnglish()}
              dir="ltr"
              maxLength={60}
              autoComplete="off"
              value={extra.nameEn}
              onChange={(event) =>
                changeExtra(extra.key, { nameEn: event.target.value })
              }
            />
            <TextField
              id={`${id}-extra-${extra.key}-code`}
              label={m.schedulesExtraCode()}
              hint={m.schedulesExtraCodeHint()}
              dir="ltr"
              maxLength={20}
              autoComplete="off"
              value={extra.code}
              onChange={(event) =>
                changeExtra(extra.key, { code: event.target.value })
              }
            />
            <SelectField
              id={`${id}-extra-${extra.key}-kind`}
              label={m.periodsKind()}
              value={extra.kind}
              options={PERIOD_KINDS.map((kind) => ({
                value: kind,
                label: KIND_LABEL[kind](),
              }))}
              onChange={(kind) => changeExtra(extra.key, { kind })}
            />
            <TextField
              id={`${id}-extra-${extra.key}-starts`}
              label={m.periodsStarts()}
              type="time"
              width="date"
              value={extra.startTime}
              onChange={(event) =>
                changeExtra(extra.key, { startTime: event.target.value })
              }
            />
            <TextField
              id={`${id}-extra-${extra.key}-ends`}
              label={m.periodsEnds()}
              type="time"
              width="date"
              min={extra.startTime || undefined}
              value={extra.endTime}
              onChange={(event) =>
                changeExtra(extra.key, { endTime: event.target.value })
              }
            />
          </fieldset>
        ))}
        {extras.length < MAX_EXTRA_PERIODS ? (
          <Button
            type="button"
            variant="outline"
            className="justify-self-start max-md:h-10"
            onClick={() => {
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
            }}
          >
            <Plus aria-hidden />
            {m.schedulesExtraAdd()}
          </Button>
        ) : null}
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
