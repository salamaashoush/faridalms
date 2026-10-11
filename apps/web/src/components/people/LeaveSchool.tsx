import type { LeaverAccess } from "@faridalms/domain/people";

import { leaverAccessEnd } from "@faridalms/domain/people";
import { addDays } from "@faridalms/domain/school";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import type { YearBounds } from "~/components/classes/Enrolment";

import { clamp, eachInTurn } from "~/components/classes/Enrolment";
import { ChoiceField, SelectField, TextField } from "~/components/system/field";
import { SheetForm } from "~/components/system/SheetForm";
import * as m from "~/i18n/messages";
import { peopleOptionsQuery } from "~/queries/students";
import { recordLeaving } from "~/server/students";
import { formatDate, formatList, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { labelOf, lastDay } from "./format";

/**
 * Records that students have left the school: their last day, why they
 * left, where they went, and how long they and their families go on reading
 * the record. Each student is recorded on their own, so one the school
 * cannot record yet is named with the reason and the rest go through.
 */
export function LeaveSchool({
  students,
  year,
  from,
  today,
  onClose,
}: {
  students: readonly { id: string; name: string }[];
  /** The year they leave in, whose dates bound the last day. */
  year: YearBounds;
  /** The first day one student was placed, when that is later than the year's. */
  from?: string;
  today: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const options = useSuspenseQuery(peopleOptionsQuery).data;
  const min = from && from > year.startsOn ? from : year.startsOn;
  const max = lastDay(year.endsBefore);
  const [last, setLast] = useState(clamp(today, min, max));
  const [exitTypeId, setExitTypeId] = useState("");
  const [destination, setDestination] = useState("");
  const [access, setAccess] = useState<LeaverAccess>("year_end");
  const [errors, setErrors] = useState<{ last?: string; reason?: string }>({});
  const [only] = students;
  const one = students.length === 1 && only ? only : null;
  const dated = Boolean(last) && last >= min && last <= max;
  const mutation = useMutation({
    mutationFn: () =>
      eachInTurn(students, (student) =>
        recordLeaving({
          data: {
            studentId: student.id,
            lastDay: last,
            exitTypeId,
            destination,
            access,
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
        if (!dated)
          found.last = m.enrolmentDateRange({
            from: formatDate(min),
            to: formatDate(max),
          });
        if (!exitTypeId) found.reason = m.validationSelection();
        setErrors(found);
        setRefusal(null);
        if (Object.keys(found).length > 0) return;
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
        min={min}
        max={max}
        value={last}
        onChange={(event) => {
          setErrors((current) => ({ ...current, last: undefined }));
          setLast(event.target.value);
        }}
        errors={errors.last ? [errors.last] : undefined}
      />
      <SelectField
        id="leave-reason"
        label={m.leaveReason()}
        value={exitTypeId}
        options={options.exitTypes.map((row) => ({
          value: row.id,
          label: labelOf(row) ?? row.code,
        }))}
        onChange={(value) => {
          setErrors((current) => ({ ...current, reason: undefined }));
          setExitTypeId(value);
        }}
        errors={errors.reason ? [errors.reason] : undefined}
        width="name"
      />
      <TextField
        id="leave-destination"
        label={m.leaveDestination()}
        hint={m.leaveDestinationHint()}
        optional
        width="name"
        maxLength={160}
        value={destination}
        onChange={(event) => setDestination(event.target.value)}
      />
      <ChoiceField
        label={m.leaveAccess()}
        value={access}
        options={[
          {
            value: "year_end",
            label: m.leaveAccessYearEnd(),
            hint: m.leaveAccessYearEndHint({
              date: formatDate(
                lastDay(
                  leaverAccessEnd({
                    years: options.years,
                    year,
                    left: addDays(dated ? last : max, 1),
                    access: "year_end",
                  }),
                ),
              ),
            }),
          },
          {
            value: "last_day",
            label: m.leaveAccessLastDay(),
            hint: m.leaveAccessLastDayHint(),
          },
        ]}
        onChange={setAccess}
      />
      {dated ? (
        <output className="block rounded-lg bg-muted p-3 text-sm leading-5">
          {one
            ? m.leaveSummary({ name: one.name, date: formatDate(last) })
            : m.leaveSummaryMany({
                count: students.length,
                value: formatNumber(students.length),
                date: formatDate(last),
              })}
        </output>
      ) : null}
    </SheetForm>
  );
}
