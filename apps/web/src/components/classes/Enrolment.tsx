import type { OpenSpan } from "@faridalms/domain/school";

import { ComboboxField } from "@faridalms/ui/system/combobox-field";
import { TextField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { enrolStudent, withdrawStudent } from "~/server/classes";
import { searchPeople } from "~/server/students";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { displayName, lastDay } from "../people/format";

export function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["classes"] }),
      queryClient.invalidateQueries({ queryKey: ["people"] }),
    ]);
}

export function clamp(day: string, min: string, max: string | undefined) {
  if (day < min) return min;
  if (max !== undefined && day > max) return max;
  return day;
}

/** The last day of a span, or none for one that runs on. */
export const lastOf = (span: OpenSpan) =>
  span.to === null ? undefined : lastDay(span.to);

/** Why a day is outside a span, as the sheets say it. */
export const outsideSpan = (span: OpenSpan) => {
  const last = lastOf(span);
  return last
    ? m.enrolmentDateRange({
        from: formatDate(span.from),
        to: formatDate(last),
      })
    : m.enrolmentDateFrom({ from: formatDate(span.from) });
};

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

export interface WithdrawSheetProps {
  student: { id: string; name: string };
  enrollment: { id: string; version: number; from: string; to: string | null };
  className: string;
  today: string;
  open: boolean;
  onClose: () => void;
  /** Takes the student out; a class's own enrolment unless a module keeps the roster. */
  withdraw?: (input: {
    studentId: string;
    enrollmentId: string;
    expectedVersion: number;
    on: string;
  }) => Promise<unknown>;
}

/** Takes a student out of a class from a date; the days before stay on record. */
export function WithdrawSheet({
  student,
  enrollment,
  className,
  today,
  open,
  onClose,
  withdraw = (input) => withdrawStudent({ data: input }),
}: WithdrawSheetProps) {
  const refresh = useRefresh();
  const max = lastOf(enrollment);
  const [on, setOn] = useState(clamp(today, enrollment.from, max));
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () =>
      withdraw({
        studentId: student.id,
        enrollmentId: enrollment.id,
        expectedVersion: enrollment.version,
        on,
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
        if (!on || on < enrollment.from || (max !== undefined && on > max)) {
          setError(outsideSpan(enrollment));
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

export interface AddStudentSheetProps {
  classId: string;
  className: string;
  /** The days the class runs, which the student's first day lies in. */
  runs: OpenSpan;
  today: string;
  open: boolean;
  onClose: () => void;
  /** Puts the student in; a class's own enrolment unless a module keeps the roster. */
  add?: (input: { studentId: string; from: string }) => Promise<{
    moved: boolean;
  }>;
}

/** Puts a student in a class from a date. */
export function AddStudentSheet({
  classId,
  className,
  runs,
  today,
  open,
  onClose,
  add = (input) => enrolStudent({ data: { ...input, classId } }),
}: AddStudentSheetProps) {
  const refresh = useRefresh();
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const max = lastOf(runs);
  const [from, setFrom] = useState(clamp(today, runs.from, max));
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
    mutationFn: () => add({ studentId, from }),
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
        min={runs.from}
        max={max}
        value={from}
        onChange={(event) => setFrom(event.target.value)}
      />
    </SheetForm>
  );
}
