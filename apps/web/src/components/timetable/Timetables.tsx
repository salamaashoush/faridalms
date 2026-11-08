import type { CycleKind, TimetableStart } from "@faridalms/domain/timetable";

import { addDays } from "@faridalms/domain/school";
import {
  MAX_CYCLE_DAYS,
  MAX_CYCLE_WEEKS,
  MIN_CYCLE_DAYS,
  TIMETABLE_STARTS,
} from "@faridalms/domain/timetable";
import { Button } from "@faridalms/ui/button";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { RecordEmpty, RecordList } from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CheckboxRow } from "~/components/people/fields";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { timetablesQuery } from "~/queries/timetable";
import { removeTimetable, saveTimetable } from "~/server/timetable";
import { formatDate, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { cycleDayLabel, cycleName, weekLetter } from "./cycle";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof timetablesQuery>["queryFn"]>>
>;
type Row = Data["timetables"][number];

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index);

const LENGTHS: Record<CycleKind, number[]> = {
  weeks: range(1, MAX_CYCLE_WEEKS),
  days: range(MIN_CYCLE_DAYS, MAX_CYCLE_DAYS),
};

const KIND_LABEL: Record<CycleKind, () => string> = {
  weeks: m.ttCycleKindWeeks,
  days: m.ttCycleKindDays,
};

const START_LABEL: Record<TimetableStart, () => string> = {
  copy: m.ttTimetableStartCopy,
  empty: m.ttTimetableStartEmpty,
};

export function timetableTitle(row: Row) {
  return (
    inLocale(row.nameEn, row.nameAr) ||
    (row.first
      ? m.ttTimetableFirst()
      : m.ttTimetableFrom({ date: formatDate(row.from) }))
  );
}

const firstPlace = (kind: CycleKind, place: number) =>
  kind === "weeks"
    ? m.ttWeekOfCycle({ week: weekLetter(place - 1) })
    : cycleDayLabel({ kind, length: place }, place);

interface TimetableSheetProps {
  data: Data;
  row: Row | null;
  onClose: () => void;
}

/**
 * A timetable's name, first day and cycle. One already followed that
 * places lessons keeps its cycle and first day; a new one starts after the
 * year's first and no earlier than today.
 */
function TimetableSheet({ data, row, onClose }: TimetableSheetProps) {
  const queryClient = useQueryClient();
  const afterFirst = addDays(data.timetables[0]?.from ?? data.year.startsOn, 1);
  const earliest = data.today > afterFirst ? data.today : afterFirst;
  const [form, setForm] = useState({
    nameEn: row?.nameEn ?? "",
    nameAr: row?.nameAr ?? "",
    startsOn: row?.startsOn ?? earliest,
    kind: row?.kind ?? "weeks",
    length: row?.length ?? 2,
    firstDay: row?.firstDay ?? 1,
    closuresMove: row?.closuresMove ?? false,
    start: "copy" as TimetableStart,
  });
  const fixedCycle = row !== null && row.lessons > 0;
  const fixedStart =
    row !== null && (row.first || (row.started && row.lessons > 0));
  const save = useMutation({
    mutationFn: () =>
      saveTimetable({
        data: {
          yearId: data.year.id,
          ...(row ? { id: row.id, version: row.version } : {}),
          ...form,
        },
      }),
    meta: { inlineError: true },
  });
  const patch = (next: Partial<typeof form>) => {
    save.reset();
    setForm((current) => {
      const merged = { ...current, ...next };
      const lengths = LENGTHS[merged.kind];
      const length = lengths.includes(merged.length)
        ? merged.length
        : (lengths[0] ?? 1);
      return {
        ...merged,
        length,
        firstDay: Math.min(merged.firstDay, length),
      };
    });
  };
  return (
    <SheetForm
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        row
          ? m.ttTimetableEditOf({ name: timetableTitle(row) })
          : m.ttTimetableAdd()
      }
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={async () => {
        try {
          const saved = await save.mutateAsync();
          await queryClient.invalidateQueries({ queryKey: ["timetable"] });
          await queryClient.invalidateQueries({ queryKey: ["attendance"] });
          toast.success(
            saved.copied > 0
              ? m.ttTimetableSavedCopied({ count: formatNumber(saved.copied) })
              : m.ttTimetableSaved(),
          );
          onClose();
        } catch {
          return;
        }
      }}
    >
      <TextField
        id="timetable-name-ar"
        label={m.periodsNameArabic()}
        optional
        dir="rtl"
        maxLength={60}
        autoComplete="off"
        value={form.nameAr}
        onChange={(event) => patch({ nameAr: event.target.value })}
      />
      <TextField
        id="timetable-name-en"
        label={m.periodsNameEnglish()}
        optional
        dir="ltr"
        maxLength={60}
        autoComplete="off"
        value={form.nameEn}
        onChange={(event) => patch({ nameEn: event.target.value })}
      />
      <TextField
        id="timetable-starts"
        label={m.ttTimetableStarts()}
        hint={row?.first ? m.ttTimetableFirstHint() : m.ttTimetableStartsHint()}
        type="date"
        width="date"
        min={earliest}
        max={data.year.lastDay}
        disabled={fixedStart}
        value={row?.first ? data.year.startsOn : form.startsOn}
        onChange={(event) => patch({ startsOn: event.target.value })}
      />
      <SelectField
        id="timetable-kind"
        label={m.ttCycleKind()}
        hint={fixedCycle ? m.ttCycleFixedHint() : undefined}
        disabled={fixedCycle}
        value={form.kind}
        options={(["weeks", "days"] as const).map((kind) => ({
          value: kind,
          label: KIND_LABEL[kind](),
        }))}
        onChange={(kind) => patch({ kind })}
      />
      <SelectField
        id="timetable-length"
        label={
          form.kind === "weeks" ? m.ttCycleWeeksLength() : m.ttCycleDaysLength()
        }
        disabled={fixedCycle}
        value={String(form.length)}
        options={LENGTHS[form.kind].map((length) => ({
          value: String(length),
          label: cycleName({ kind: form.kind, length }),
        }))}
        onChange={(length) => patch({ length: Number(length) })}
      />
      {form.length > 1 ? (
        <SelectField
          id="timetable-first"
          label={
            form.kind === "weeks" ? m.ttCycleFirstWeek() : m.ttCycleFirstDay()
          }
          hint={m.ttCycleFirstHint()}
          disabled={fixedStart}
          value={String(form.firstDay)}
          options={range(1, form.length).map((place) => ({
            value: String(place),
            label: firstPlace(form.kind, place),
          }))}
          onChange={(place) => patch({ firstDay: Number(place) })}
        />
      ) : null}
      {form.length > 1 ? (
        <CheckboxRow
          label={m.ttClosuresMove()}
          hint={m.ttClosuresMoveHint()}
          checked={form.closuresMove}
          disabled={fixedStart}
          onChange={(closuresMove) => patch({ closuresMove })}
        />
      ) : null}
      {row ? null : (
        <SelectField
          id="timetable-start"
          label={m.ttTimetableStart()}
          value={form.start}
          options={TIMETABLE_STARTS.map((start) => ({
            value: start,
            label: START_LABEL[start](),
          }))}
          onChange={(start) => patch({ start })}
        />
      )}
    </SheetForm>
  );
}

interface TimetableItemProps {
  row: Row;
  canEdit: boolean;
  onEdit: () => void;
  onRemove: () => void;
}

function TimetableItem({ row, canEdit, onEdit, onRemove }: TimetableItemProps) {
  const title = timetableTitle(row);
  const lastDay = addDays(row.until, -1);
  const removable = !row.first && !(row.started && row.lessons > 0);
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-3">
      <div className="grid min-w-0 gap-0.5">
        <span className="flex flex-wrap items-center gap-x-3 text-sm leading-5 font-medium">
          <span dir="auto">{title}</span>
          {row.started ? null : (
            <StatusText tone="info">{m.ttTimetableUpcoming()}</StatusText>
          )}
        </span>
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {m.accessDuring({
            from: formatDate(row.from),
            to: formatDate(lastDay),
          })}
        </span>
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {[
            cycleName(row),
            row.length > 1
              ? row.closuresMove
                ? m.ttClosuresMoved()
                : m.ttClosuresKept()
              : null,
            m.ttTimetableLessons({ count: formatNumber(row.lessons) }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      {canEdit ? (
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="max-md:size-10"
            aria-label={m.ttTimetableEditOf({ name: title })}
            onClick={onEdit}
          >
            <Pencil aria-hidden />
          </Button>
          {removable ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="max-md:size-10"
              aria-label={m.ttTimetableRemove({ name: title })}
              onClick={onRemove}
            >
              <Trash2 aria-hidden />
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export interface TimetablesProps {
  yearId: string;
}

/**
 * A year's timetables in the order they are followed: each from its first
 * day until the next starts, with how its lessons repeat.
 */
export function Timetables({ yearId }: TimetablesProps) {
  const data = useSuspenseQuery(timetablesQuery(yearId)).data;
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState<{ row: Row | null; key: number } | null>(
    null,
  );
  const [removing, setRemoving] = useState<Row | null>(null);
  const remove = useMutation({
    mutationFn: (row: Row) =>
      removeTimetable({ data: { id: row.id, version: row.version } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["timetable"] });
      await queryClient.invalidateQueries({ queryKey: ["attendance"] });
      toast.success(m.ttTimetableRemoved());
      setRemoving(null);
    },
  });
  const open = (row: Row | null) =>
    setSheet((current) => ({ row, key: (current?.key ?? 0) + 1 }));
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-[13px] leading-[18px] text-muted-foreground">
          {m.ttTimetablesHint()}
        </p>
        {data.canEdit ? (
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={() => open(null)}
          >
            <Plus aria-hidden />
            {m.ttTimetableAdd()}
          </Button>
        ) : null}
      </div>
      {data.timetables.length === 0 ? (
        <RecordEmpty>{m.ttTimetablesNone()}</RecordEmpty>
      ) : null}
      <RecordList>
        {data.timetables.map((row) => (
          <TimetableItem
            key={row.id}
            row={row}
            canEdit={data.canEdit}
            onEdit={() => open(row)}
            onRemove={() => {
              remove.reset();
              setRemoving(row);
            }}
          />
        ))}
      </RecordList>
      {sheet ? (
        <TimetableSheet
          key={sheet.key}
          data={data}
          row={sheet.row}
          onClose={() => setSheet(null)}
        />
      ) : null}
      <ConfirmDialog
        open={removing !== null}
        title={m.ttTimetableRemoveTitle()}
        body={m.ttTimetableRemoveBody()}
        confirmLabel={m.ttTimetableRemoveConfirm()}
        pending={remove.isPending}
        error={remove.error ? getMessageFromError(remove.error) : undefined}
        onConfirm={() => {
          if (removing) remove.mutate(removing);
        }}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
