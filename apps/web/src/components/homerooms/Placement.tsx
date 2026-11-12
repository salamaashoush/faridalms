import type { OpenSpan } from "@faridalms/domain/school";

import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import {
  clamp,
  eachInTurn,
  lastOf,
  outsideSpan,
  useRefresh,
} from "~/components/classes/Enrolment";
import { classTitle } from "~/components/classes/format";
import * as m from "~/i18n/messages";
import { homeroomDirectoryQuery } from "~/queries/homerooms";
import { placeInHomeroom } from "~/server/homerooms";
import { formatDate, formatList, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

const ANY = { q: "", grade: [], ended: false };

/** The days a student may join a homeroom on: its own, from no earlier than their current place began. */
function within(
  runs: OpenSpan | undefined,
  after: string | undefined,
): OpenSpan {
  const from = runs?.from ?? "";
  return {
    from: after && after > from ? after : from,
    to: runs?.to ?? null,
  };
}

const holds = (span: OpenSpan, day: string) =>
  day >= span.from && (span.to === null || day < span.to);

export interface MoveClassSheetProps {
  student: { id: string; name: string };
  current: { classId: string; from: string } | null;
  today: string;
  open: boolean;
  onClose: () => void;
}

/**
 * Moves a student to another homeroom from a date. The old enrollment ends
 * on that day and the new one starts on it, so both stay on record.
 */
export function MoveClassSheet({
  student,
  current,
  today,
  open,
  onClose,
}: MoveClassSheetProps) {
  const refresh = useRefresh();
  const classes = useQuery(homeroomDirectoryQuery(ANY, {}));
  const [classId, setClassId] = useState("");
  const [from, setFrom] = useState(
    current ? clamp(today, current.from, undefined) : today,
  );
  const [errors, setErrors] = useState<{ classId?: string; from?: string }>({});
  const choices = (classes.data?.rows ?? []).filter(
    (row) => row.id !== current?.classId,
  );
  const target = choices.find((row) => row.id === classId);
  const days = within(target?.runs, current?.from);
  const mutation = useMutation({
    mutationFn: () =>
      placeInHomeroom({ data: { studentId: student.id, classId, from } }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={
        current
          ? m.enrolmentMoveTitle({ name: student.name })
          : m.enrolmentPlaceTitle({ name: student.name })
      }
      submitLabel={current ? m.enrolmentMove() : m.enrolmentPlace()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        const found: typeof errors = {};
        if (!classId) found.classId = m.validationSelection();
        if (!from || !holds(days, from)) found.from = outsideSpan(days);
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        await mutation.mutateAsync().then(
          async () => {
            await refresh();
            toast.success(
              m.enrolmentMoved({
                name: student.name,
                class: target ? classTitle(target) : "",
              }),
            );
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <SelectField
        id="move-class"
        label={m.enrolmentTargetClass()}
        value={classId}
        options={choices.map((row) => ({
          value: row.id,
          label: classTitle(row),
        }))}
        onChange={(value) => {
          setErrors((currentErrors) => ({
            ...currentErrors,
            classId: undefined,
          }));
          setClassId(value);
        }}
        errors={errors.classId ? [errors.classId] : undefined}
        width="name"
      />
      <TextField
        id="move-from"
        label={m.enrolmentFrom()}
        hint={m.enrolmentFromHint()}
        type="date"
        width="date"
        min={days.from || undefined}
        max={lastOf(days)}
        value={from}
        onChange={(event) => {
          setErrors((currentErrors) => ({ ...currentErrors, from: undefined }));
          setFrom(event.target.value);
        }}
        errors={errors.from ? [errors.from] : undefined}
      />
      {current && target && from ? (
        <output className="block rounded-lg bg-muted p-3 text-sm leading-5">
          {m.enrolmentMoveSummary({
            date: formatDate(from),
            class: classTitle(target),
          })}
        </output>
      ) : null}
    </SheetForm>
  );
}

export interface MoveManySheetProps {
  students: readonly { id: string; name: string }[];
  today: string;
  onClose: () => void;
}

/**
 * Moves the students picked in a list to one homeroom from a date, each as
 * moving one does. A student the move is refused for stays where they are
 * and is named with the reason, and the rest are moved.
 */
export function MoveManySheet({
  students,
  today,
  onClose,
}: MoveManySheetProps) {
  const refresh = useRefresh();
  const classes = useQuery(homeroomDirectoryQuery(ANY, {}));
  const [classId, setClassId] = useState("");
  const [from, setFrom] = useState(today);
  const [errors, setErrors] = useState<{ classId?: string; from?: string }>({});
  const choices = classes.data?.rows ?? [];
  const target = choices.find((row) => row.id === classId);
  const days = within(target?.runs, undefined);
  const mutation = useMutation({
    mutationFn: () =>
      eachInTurn(students, (student) =>
        placeInHomeroom({ data: { studentId: student.id, classId, from } }),
      ),
  });
  return (
    <SheetForm
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.studentsMoveTitle({ count: formatNumber(students.length) })}
      submitLabel={m.enrolmentMove()}
      pending={mutation.isPending}
      error={null}
      onSubmit={async () => {
        const found: typeof errors = {};
        if (!classId) found.classId = m.validationSelection();
        if (!from || !holds(days, from)) found.from = outsideSpan(days);
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        const { done, failed } = await mutation.mutateAsync();
        await refresh();
        if (done.length > 0)
          toast.success(
            m.studentsMoved({
              count: formatNumber(done.length),
              class: target ? classTitle(target) : "",
              date: formatDate(from),
            }),
          );
        // Those refused for the same reason are named together.
        const reasons = Map.groupBy(failed, (refusal) =>
          getMessageFromError(refusal.error),
        );
        for (const [reason, refused] of reasons)
          toast.warning(
            m.studentsNotMoved({
              names: formatList(refused.map((refusal) => refusal.item.name)),
              reason,
            }),
          );
        onClose();
      }}
    >
      <SelectField
        id="move-many-class"
        label={m.enrolmentTargetClass()}
        value={classId}
        options={choices.map((row) => ({
          value: row.id,
          label: classTitle(row),
        }))}
        onChange={(value) => {
          setErrors((currentErrors) => ({
            ...currentErrors,
            classId: undefined,
          }));
          setClassId(value);
        }}
        errors={errors.classId ? [errors.classId] : undefined}
        width="name"
      />
      <TextField
        id="move-many-from"
        label={m.enrolmentFrom()}
        hint={m.enrolmentFromHint()}
        type="date"
        width="date"
        min={days.from || undefined}
        max={lastOf(days)}
        value={from}
        onChange={(event) => {
          setErrors((currentErrors) => ({ ...currentErrors, from: undefined }));
          setFrom(event.target.value);
        }}
        errors={errors.from ? [errors.from] : undefined}
      />
    </SheetForm>
  );
}
