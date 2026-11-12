import { ChoiceField, TextField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQueries,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { clamp, eachInTurn } from "~/components/classes/Enrolment";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { recordLeaving } from "~/server/students";
import { formatDate, formatList, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { leavingParts } from "./slots";

export interface LeaveSchoolProps {
  students: readonly { id: string; name: string }[];
  /** The first day one student was at the school, which the last day cannot come before. */
  from?: string;
  today: string;
  onClose: () => void;
}

/**
 * Records that students have left the school: their last day, how long
 * they and their families go on reading the record, and what modules keep
 * of a departure. Each student is recorded on their own, so one the school
 * cannot record yet is named with the reason and the rest go through.
 */
export function LeaveSchool({
  students,
  from,
  today,
  onClose,
}: LeaveSchoolProps) {
  const queryClient = useQueryClient();
  const parts = useSlot(leavingParts);
  const reads = useSuspenseQueries({
    queries: parts.map((part) => part.query()),
  });
  const min = from ?? "";
  const [last, setLast] = useState(min ? clamp(today, min, undefined) : today);
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(parts.map((part) => [part.key, part.initial()])),
  );
  const [tried, setTried] = useState(false);
  const offered = parts.flatMap((part, index) =>
    part.access(reads[index]?.data, last || today),
  );
  const [access, setAccess] = useState(offered[0]?.value ?? "last_day");
  const [until, setUntil] = useState("");
  const [errors, setErrors] = useState<{ last?: string; until?: string }>({});
  const [only] = students;
  const one = students.length === 1 && only ? only : null;
  const dated = Boolean(last) && (!min || last >= min);
  const accessUntil =
    access === "last_day"
      ? ""
      : access === "until"
        ? until
        : (offered.find((option) => option.value === access)?.until ?? "");
  const problems = parts.map((part) => part.problem(values[part.key]));
  const mutation = useMutation({
    mutationFn: () =>
      eachInTurn(students, (student) =>
        recordLeaving({
          data: {
            studentId: student.id,
            lastDay: last,
            accessUntil,
            parts: values,
          },
        }),
      ),
  });
  const [refusal, setRefusal] = useState<string | null>(null);
  return (
    <SheetForm
      open
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.studentLeave()}
      submitLabel={m.studentLeave()}
      pending={mutation.isPending}
      error={refusal}
      onSubmit={async () => {
        const found: typeof errors = {};
        if (!dated) found.last = m.enrolmentDateFrom({ from: formatDate(min) });
        if (access === "until" && (!until || until < last))
          found.until = m.leaveAccessUntilAfter();
        setErrors(found);
        setTried(true);
        setRefusal(null);
        if (Object.keys(found).length > 0 || problems.some(Boolean)) return;
        const { done, failed } = await mutation.mutateAsync();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["people"] }),
          queryClient.invalidateQueries({ queryKey: ["classes"] }),
        ]);
        const date = formatDate(last);
        // One student's refusal is read where the office is looking.
        const [alone] = failed;
        if (one && alone) {
          setRefusal(getMessageFromError(alone.error));
          return;
        }
        if (done.length > 0)
          toast.success(
            one
              ? m.leaveDone({ name: one.name, date })
              : m.leaveDoneMany({
                  count: done.length,
                  value: formatNumber(done.length),
                  date,
                }),
          );
        // Those refused for the same reason are named together.
        const reasons = Map.groupBy(failed, (item) =>
          getMessageFromError(item.error),
        );
        for (const [reason, refused] of reasons)
          toast.warning(
            m.leaveNotDone({
              names: formatList(refused.map((item) => item.item.name)),
              reason,
            }),
          );
        onClose();
      }}
    >
      <TextField
        id="leave-last-day"
        label={m.leaveLastDay()}
        hint={m.leaveLastDayHint()}
        type="date"
        width="date"
        min={min || undefined}
        value={last}
        onChange={(event) => {
          setErrors((current) => ({ ...current, last: undefined }));
          setLast(event.target.value);
        }}
        errors={errors.last ? [errors.last] : undefined}
      />
      {parts.map((part, index) => (
        <part.Fields
          key={part.key}
          read={reads[index]?.data}
          value={values[part.key]}
          onChange={(value) =>
            setValues((current) => ({ ...current, [part.key]: value }))
          }
          problem={tried ? (problems[index] ?? null) : null}
        />
      ))}
      <ChoiceField
        label={m.leaveAccess()}
        value={access}
        options={[
          ...offered.map((option) => ({
            value: option.value,
            label: option.label,
            hint: option.hint,
          })),
          {
            value: "until",
            label: m.leaveAccessUntilDay(),
            hint: m.leaveAccessUntilDayHint(),
          },
          {
            value: "last_day",
            label: m.leaveAccessLastDay(),
            hint: m.leaveAccessLastDayHint(),
          },
        ]}
        onChange={setAccess}
      />
      {access === "until" ? (
        <TextField
          id="leave-access-until"
          label={m.leaveAccessUntil()}
          type="date"
          width="date"
          min={last || undefined}
          value={until}
          onChange={(event) => {
            setErrors((current) => ({ ...current, until: undefined }));
            setUntil(event.target.value);
          }}
          errors={errors.until ? [errors.until] : undefined}
        />
      ) : null}
      {dated ? (
        <output className="block rounded-lg bg-muted p-3 text-sm leading-5">
          {one
            ? m.leaveSummary({ name: one.name, date: formatDate(last) })
            : m.leaveSummaryMany({
                count: students.length,
                value: formatNumber(students.length),
                date: formatDate(last),
              })}
          {accessUntil
            ? ` ${m.leaveSummaryReads({ date: formatDate(accessUntil) })}`
            : null}
        </output>
      ) : null}
    </SheetForm>
  );
}
