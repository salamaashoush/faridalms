import { saveBellScheduleSchema } from "@faridalms/domain/timetable";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import { TextField } from "@faridalms/ui/system/form-field";
import {
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import type { yearPeriodsQuery } from "~/queries/years";
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

type Field = "nameAr" | "times";

const fieldOf = (key: string): Field | undefined =>
  key === "nameAr" || key === "nameEn"
    ? "nameAr"
    : key === "times"
      ? "times"
      : undefined;

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
        save.error ? getMessageFromError(save.error) : (errors.times ?? null)
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
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-3">
      <div className="grid min-w-0 gap-0.5">
        <span dir="auto" className="text-sm leading-5 font-medium">
          {name}
        </span>
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {formatList(
            schedule.times.map(
              (row) =>
                `${nameOf(row.code)} ${m.ttTimeRange({
                  from: formatTime(row.startTime),
                  to: formatTime(row.endTime),
                })}`,
            ),
          )}
        </span>
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
