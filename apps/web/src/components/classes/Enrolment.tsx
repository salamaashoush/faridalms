import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { formatDate } from "~/components/family/format";
import { ComboboxField } from "~/components/system/ComboboxField";
import { SelectField, TextField } from "~/components/system/field";
import { SheetForm } from "~/components/system/SheetForm";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { classDirectoryQuery } from "~/queries/classes";
import { enrolStudent, withdrawStudent } from "~/server/classes";
import { searchPeople } from "~/server/students";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { displayName, lastDay } from "../people/format";
import { classTitle } from "./format";

export interface YearBounds {
  id: string;
  startsOn: string;
  endsBefore: string;
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["classes"] }),
      queryClient.invalidateQueries({ queryKey: ["people"] }),
    ]);
}

export function clamp(day: string, min: string, max: string) {
  if (day < min) return min;
  if (day > max) return max;
  return day;
}

/**
 * Moves a student to another homeroom from a date. The old enrollment ends
 * on that day and the new one starts on it, so both stay on record.
 */
export function MoveClassSheet({
  student,
  current,
  year,
  today,
  open,
  onClose,
}: {
  student: { id: string; name: string };
  current: { classId: string; from: string } | null;
  year: YearBounds;
  today: string;
  open: boolean;
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const classes = useQuery(
    classDirectoryQuery({ year: year.id, q: "", grade: [] }),
  );
  const min = current ? current.from : year.startsOn;
  const max = lastDay(year.endsBefore);
  const [classId, setClassId] = useState("");
  const [from, setFrom] = useState(clamp(today, min, max));
  const [errors, setErrors] = useState<{ classId?: string; from?: string }>({});
  const choices = (classes.data?.rows ?? []).filter(
    (row) => row.id !== current?.classId,
  );
  const target = choices.find((row) => row.id === classId);
  const mutation = useMutation({
    mutationFn: () =>
      enrolStudent({ data: { studentId: student.id, classId, from } }),
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
        if (!from || from < min || from > max)
          found.from = m.enrolmentDateRange({
            from: formatDate(min),
            to: formatDate(max),
          });
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
        min={min}
        max={max}
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

/**
 * Does one thing for each in turn, in the order given, and goes on past a
 * failure: what came through and what did not, with why, are both told.
 */
export async function eachInTurn<T>(
  items: readonly T[],
  act: (item: T) => Promise<unknown>,
): Promise<{ done: T[]; failed: { item: T; error: unknown }[] }> {
  const [item, ...rest] = items;
  if (item === undefined) return { done: [], failed: [] };
  const outcome = await act(item).then(
    () => null,
    (error: unknown) => ({ error }),
  );
  const after = await eachInTurn(rest, act);
  return outcome
    ? { done: after.done, failed: [{ item, ...outcome }, ...after.failed] }
    : { done: [item, ...after.done], failed: after.failed };
}

/**
 * Moves the students picked in a list to one homeroom from a date, each as
 * moving one does. A student the move is refused for stays where they are
 * and is named with the reason, and the rest are moved.
 */
export function MoveManySheet({
  students,
  year,
  today,
  onClose,
}: {
  students: readonly { id: string; name: string }[];
  year: YearBounds;
  today: string;
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const classes = useQuery(
    classDirectoryQuery({ year: year.id, q: "", grade: [] }),
  );
  const min = year.startsOn;
  const max = lastDay(year.endsBefore);
  const [classId, setClassId] = useState("");
  const [from, setFrom] = useState(clamp(today, min, max));
  const [errors, setErrors] = useState<{ classId?: string; from?: string }>({});
  const choices = classes.data?.rows ?? [];
  const target = choices.find((row) => row.id === classId);
  const mutation = useMutation({
    mutationFn: () =>
      eachInTurn(students, (student) =>
        enrolStudent({ data: { studentId: student.id, classId, from } }),
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
        if (!from || from < min || from > max)
          found.from = m.enrolmentDateRange({
            from: formatDate(min),
            to: formatDate(max),
          });
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
              names: new Intl.ListFormat(getLocale(), {
                type: "conjunction",
              }).format(refused.map((refusal) => refusal.item.name)),
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
        min={min}
        max={max}
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

/** Takes a student out of a class from a date; the days before stay on record. */
export function WithdrawSheet({
  student,
  enrollment,
  className,
  year,
  today,
  open,
  onClose,
}: {
  student: { id: string; name: string };
  enrollment: { id: string; version: number; from: string };
  className: string;
  year: YearBounds;
  today: string;
  open: boolean;
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const max = lastDay(year.endsBefore);
  const [on, setOn] = useState(clamp(today, enrollment.from, max));
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      withdrawStudent({
        data: {
          studentId: student.id,
          enrollmentId: enrollment.id,
          expectedVersion: enrollment.version,
          on,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.enrolmentWithdrawTitle({ name: student.name, class: className })}
      submitLabel={m.enrolmentWithdraw()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        if (!on || on < enrollment.from || on > max) {
          setError(
            m.enrolmentDateRange({
              from: formatDate(enrollment.from),
              to: formatDate(max),
            }),
          );
          return;
        }
        await mutation.mutateAsync().then(
          async () => {
            await refresh();
            toast.success(m.enrolmentWithdrawn({ name: student.name }));
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {m.enrolmentWithdrawHint()}
      </p>
      <TextField
        id="withdraw-on"
        label={m.enrolmentLastDayBefore()}
        type="date"
        width="date"
        min={enrollment.from}
        max={max}
        value={on}
        onChange={(event) => {
          setError(null);
          setOn(event.target.value);
        }}
        errors={error ? [error] : undefined}
      />
    </SheetForm>
  );
}

export function AddStudentSheet({
  classId,
  className,
  year,
  today,
  open,
  onClose,
}: {
  classId: string;
  className: string;
  year: YearBounds;
  today: string;
  open: boolean;
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const max = lastDay(year.endsBefore);
  const [from, setFrom] = useState(clamp(today, year.startsOn, max));
  const [error, setError] = useState<string | null>(null);
  const needle = search.trim();
  const hits = (
    useQuery({
      queryKey: ["people", "search", needle],
      queryFn: () => searchPeople({ data: { q: needle } }),
      enabled: needle.length >= 2,
      placeholderData: (previous) => previous,
    }).data ?? []
  ).filter((hit) => hit.isStudent);
  const picked = hits.find((hit) => hit.id === studentId);
  const mutation = useMutation({
    mutationFn: () => enrolStudent({ data: { studentId, classId, from } }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.enrolmentAddTitle({ class: className })}
      submitLabel={m.enrolmentAdd()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        if (!studentId) {
          setError(m.validationSelection());
          return;
        }
        await mutation.mutateAsync().then(
          async (result) => {
            await refresh();
            const name = picked ? displayName(picked) : "";
            toast.success(
              result.moved
                ? m.enrolmentMoved({ name, class: className })
                : m.enrolmentAdded({ name, class: className }),
            );
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <ComboboxField
        label={m.enrolmentStudent()}
        hint={m.enrolmentStudentHint()}
        options={hits.map((hit) => ({
          value: hit.id,
          label: displayName(hit),
        }))}
        value={studentId ? [studentId] : []}
        onChange={(next) => {
          setError(null);
          setStudentId(next[0] ?? "");
        }}
        search={search}
        onSearchChange={setSearch}
        errors={error ? [error] : undefined}
      />
      <TextField
        id="add-from"
        label={m.enrolmentFrom()}
        type="date"
        width="date"
        min={year.startsOn}
        max={max}
        value={from}
        onChange={(event) => setFrom(event.target.value)}
      />
    </SheetForm>
  );
}
