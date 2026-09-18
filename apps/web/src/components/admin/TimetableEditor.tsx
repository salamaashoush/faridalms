import type {
  SaveTimetableInput,
  SchoolWeekday,
} from "@faridalms/domain/timetable";

import {
  SCHOOL_WEEKDAYS,
  saveTimetableSchema,
} from "@faridalms/domain/timetable";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { FieldError } from "~/components/app/field";
import { subjectLabel } from "~/components/family/format";
import { TimetableGrid } from "~/components/family/TimetableGrid";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { saveTimetable } from "~/server/timetable";
import { getMessageFromError } from "~/utils/error";

import { ManagementInput } from "./ManagementDialog";
import { ManagementPage } from "./ManagementPage";
import { RecordPicker } from "./RecordPicker";
import { SelectField } from "./SelectField";

/** Forty-five minutes on, clamped to the last minute of the day. */
function nextEnd(start: string): string {
  const [hours = 8, minutes = 0] = start.split(":").map(Number);
  const total = Math.min(hours * 60 + minutes + 45, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

const WEEKDAY_LABEL: Record<SchoolWeekday, () => string> = {
  0: m.daySunday,
  1: m.dayMonday,
  2: m.dayTuesday,
  3: m.dayWednesday,
  4: m.dayThursday,
};

export interface TimetableOffering {
  subject: { id: string; name: string; nameAr: string | null; icon: string };
  teacher: { id: string; name: string } | null;
}

export function TimetableEditor({
  initial,
  offerings,
  className,
  onClose,
}: {
  initial: SaveTimetableInput;
  offerings: TimetableOffering[];
  className: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [rowKeys, setRowKeys] = useState(() =>
    initial.slots.map(() => crypto.randomUUID()),
  );
  const [failure, setFailure] = useState<string>();
  const mutation = useMutation({
    mutationFn: (input: SaveTimetableInput) => saveTimetable({ data: input }),
    onSuccess: async (_, variables) => {
      form.reset(variables);
      await queryClient.invalidateQueries({ queryKey: ["classes"] });
      toast.success(m.managementSaved());
      onClose();
    },
    onError: (error) => setFailure(getMessageFromError(error)),
  });
  const form = useForm({
    defaultValues: initial,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: saveTimetableSchema },
    onSubmit: async ({ value }) => {
      setFailure(undefined);
      await mutation.mutateAsync(value);
    },
  });
  const subjectOptions = offerings.map((offering) => ({
    value: offering.subject.id,
    label:
      subjectLabel({
        name: offering.subject.name,
        nameAr: offering.subject.nameAr ?? undefined,
      }) ?? offering.subject.name,
  }));
  const weekdayOptions = SCHOOL_WEEKDAYS.map((day) => ({
    value: String(day),
    label: WEEKDAY_LABEL[day](),
  }));
  return (
    <ManagementPage
      title={m.timetableEdit()}
      description={m.timetableEditorHint({ className })}
      onClose={onClose}
      onSubmit={() => form.handleSubmit()}
      pending={mutation.isPending}
      isDirty={() => form.state.isDirty}
      sectioned
    >
      <form.Field name="slots" mode="array">
        {(field) => (
          <section className="space-y-4 rounded-xl border bg-card p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{m.timetableLessons()}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {m.timetableLessonsHint()}
                </p>
              </div>
            </div>
            {subjectOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {m.timetableNoOfferings()}
              </p>
            ) : null}
            {SCHOOL_WEEKDAYS.map((day) => {
              const indexes = field.state.value.flatMap((slot, index) =>
                slot.weekday === day ? [index] : [],
              );
              return (
                <div key={day} className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">
                      {WEEKDAY_LABEL[day]()}
                    </h3>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={subjectOptions.length === 0}
                      onClick={() => {
                        setRowKeys((keys) => [...keys, crypto.randomUUID()]);
                        const last = indexes.at(-1);
                        const previous =
                          last === undefined
                            ? undefined
                            : field.state.value[last];
                        field.pushValue({
                          weekday: day,
                          startTime: previous?.endTime ?? "08:00",
                          endTime: nextEnd(previous?.endTime ?? "08:00"),
                          subjectId: subjectOptions[0]?.value ?? "",
                          teacherId: "",
                          room: "",
                        });
                      }}
                    >
                      <Plus aria-hidden />
                      {m.timetableAddLessonOn({ day: WEEKDAY_LABEL[day]() })}
                    </Button>
                  </div>
                  {indexes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {m.timetableNoLessons()}
                    </p>
                  ) : null}
                  {indexes.map((index) => (
                    <div
                      key={rowKeys[index]}
                      className="space-y-3 rounded-lg border bg-background p-4"
                    >
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
                        <form.Field name={`slots[${index}].weekday`}>
                          {(dayField) => (
                            <SelectField
                              id={`slot-${index}-weekday`}
                              label={m.timetableWeekday()}
                              value={String(dayField.state.value)}
                              options={weekdayOptions}
                              onChange={(value) => {
                                const next = SCHOOL_WEEKDAYS.find(
                                  (item) => String(item) === value,
                                );
                                if (next !== undefined)
                                  dayField.handleChange(next);
                              }}
                            />
                          )}
                        </form.Field>
                        {(["startTime", "endTime"] as const).map((name) => (
                          <form.Field
                            key={name}
                            name={`slots[${index}].${name}`}
                          >
                            {(timeField) => (
                              <ManagementInput
                                id={`slot-${index}-${name}`}
                                label={
                                  name === "startTime"
                                    ? m.adminStartsOn()
                                    : m.adminEndsOn()
                                }
                                type="time"
                                required
                                value={timeField.state.value}
                                onChange={(event) =>
                                  timeField.handleChange(event.target.value)
                                }
                                onBlur={timeField.handleBlur}
                                errors={timeField.state.meta.errors}
                              />
                            )}
                          </form.Field>
                        ))}
                        <form.Field name={`slots[${index}].room`}>
                          {(roomField) => (
                            <ManagementInput
                              id={`slot-${index}-room`}
                              label={m.adminRoom()}
                              maxLength={32}
                              value={roomField.state.value ?? ""}
                              onChange={(event) =>
                                roomField.handleChange(event.target.value)
                              }
                              onBlur={roomField.handleBlur}
                              errors={roomField.state.meta.errors}
                            />
                          )}
                        </form.Field>
                        <div className="flex items-end justify-end pb-1">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={m.timetableRemoveLesson()}
                            onClick={() => {
                              setRowKeys((keys) =>
                                keys.filter(
                                  (key, position) => position !== index,
                                ),
                              );
                              field.removeValue(index);
                            }}
                          >
                            <X aria-hidden />
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <form.Field name={`slots[${index}].subjectId`}>
                          {(subjectField) => (
                            <SelectField
                              id={`slot-${index}-subject`}
                              label={m.assignmentsSubject()}
                              value={subjectField.state.value}
                              options={subjectOptions}
                              onChange={subjectField.handleChange}
                            />
                          )}
                        </form.Field>
                        <form.Field name={`slots[${index}].teacherId`}>
                          {(teacherField) => (
                            <RecordPicker
                              kind="teachers"
                              label={m.timetableTeacher()}
                              value={teacherField.state.value ?? ""}
                              onChange={teacherField.handleChange}
                              errors={teacherField.state.meta.errors}
                            />
                          )}
                        </form.Field>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
            <FieldError errors={field.state.meta.errors} />
            {failure ? (
              <p role="alert" className="text-sm text-destructive">
                {failure}
              </p>
            ) : null}
          </section>
        )}
      </form.Field>
      <section className="space-y-4 rounded-xl border bg-card p-5 sm:p-7">
        <h2 className="font-semibold">{m.timetablePreview()}</h2>
        <form.Subscribe selector={(state) => state.values.slots}>
          {(slots) => (
            <TimetableGrid
              className={className}
              slots={slots.map((slot, index) => {
                const offering = offerings.find(
                  (row) => row.subject.id === slot.subjectId,
                );
                return {
                  id: rowKeys[index] ?? String(index),
                  weekday: slot.weekday,
                  startTime: slot.startTime,
                  endTime: slot.endTime,
                  room: slot.room || null,
                  subject: offering
                    ? {
                        name: offering.subject.name,
                        nameAr: offering.subject.nameAr ?? undefined,
                        icon: offering.subject.icon,
                      }
                    : null,
                  teacher: slot.teacherId ? null : (offering?.teacher ?? null),
                };
              })}
            />
          )}
        </form.Subscribe>
      </section>
    </ManagementPage>
  );
}
