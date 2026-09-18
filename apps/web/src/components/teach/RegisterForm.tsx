import type { RecordAttendanceInput } from "@faridalms/domain/school-schema";

import { ATTENDANCE_STATUSES } from "@faridalms/domain/school-schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { ATTENDANCE_LABEL } from "~/components/app/labels";
import { UnsavedChangesGuard } from "~/components/app/UnsavedChangesGuard";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import * as m from "~/i18n/messages";
import { saveAttendance } from "~/server/school";
import { cn } from "~/utils/cn";
import { getMessageFromError } from "~/utils/error";

import { studentName } from "./format";

type Status = (typeof ATTENDANCE_STATUSES)[number];

export interface RosterStudent {
  id: string;
  reference: string;
  firstName: string;
  lastName: string;
}

export interface AttendanceMark {
  studentId: string;
  status: Status;
  note: string | null;
  revision: number;
}

interface Entry {
  status: Status | null;
  note: string;
  expectedRevision: number | null;
}

const FALLBACK: Entry = { status: null, note: "", expectedRevision: null };

function initialEntries(
  roster: RosterStudent[],
  marks: AttendanceMark[],
): Record<string, Entry> {
  const byStudent = new Map(marks.map((mark) => [mark.studentId, mark]));
  const entries: Record<string, Entry> = {};
  for (const student of roster) {
    const mark = byStudent.get(student.id);
    entries[student.id] = {
      status: mark?.status ?? FALLBACK.status,
      note: mark?.note ?? "",
      expectedRevision: mark?.revision ?? null,
    };
  }
  return entries;
}

/**
 * Mount this keyed by class and date. The register is a draft of what the
 * teacher is about to save, so it starts from whatever is already recorded and
 * must start again when the register itself changes.
 */
export function RegisterForm({
  classId,
  date,
  roster,
  marks,
}: {
  classId: string;
  date: string;
  roster: RosterStudent[];
  marks: AttendanceMark[];
}) {
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const record = useServerFn(saveAttendance);
  const [entries, setEntries] = useState(() => initialEntries(roster, marks));
  const [savedEntries, setSavedEntries] = useState(entries);
  const [failure, setFailure] = useState<string>();

  const { mutate, isPending } = useMutation({
    mutationFn: (input: { data: RecordAttendanceInput }) => record(input),
    onSuccess: async (result, variables) => {
      setFailure(undefined);
      const revisions = new Map(
        result.marks.map((mark) => [mark.studentId, mark.revision]),
      );
      setSavedEntries((previous) => {
        const next = { ...previous };
        for (const entry of variables.data.entries) {
          next[entry.studentId] = {
            status: entry.status,
            note: entry.note ?? "",
            expectedRevision: revisions.get(entry.studentId) ?? null,
          };
        }
        return next;
      });
      setEntries((previous) => {
        const next = { ...previous };
        for (const mark of result.marks) {
          const entry = next[mark.studentId];
          if (entry)
            next[mark.studentId] = {
              ...entry,
              expectedRevision: mark.revision,
            };
        }
        return next;
      });
      toast.success(m.attendanceSaved());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["attendance"] }),
        queryClient.invalidateQueries({ queryKey: ["overview", "teaching"] }),
      ]);
    },
    onError: (error: Error) => {
      setFailure(getMessageFromError(error));
      toast.error(getMessageFromError(error));
    },
  });

  const entryOf = (studentId: string): Entry => entries[studentId] ?? FALLBACK;

  const update = (studentId: string, patch: Partial<Entry>) => {
    setEntries((previous) => ({
      ...previous,
      [studentId]: { ...(previous[studentId] ?? FALLBACK), ...patch },
    }));
  };

  const tally = (status: Status) =>
    roster.filter((student) => entryOf(student.id).status === status).length;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (
          !hydrated ||
          isPending ||
          !roster.some((student) => entryOf(student.id).status !== null)
        )
          return;
        mutate({
          data: {
            classId,
            date,
            entries: roster.flatMap((student) => {
              const entry = entryOf(student.id);
              return entry.status
                ? [
                    {
                      studentId: student.id,
                      status: entry.status,
                      note: entry.note,
                      expectedRevision: entry.expectedRevision,
                    },
                  ]
                : [];
            }),
          },
        });
      }}
    >
      <UnsavedChangesGuard
        pending={isPending}
        isDirty={() =>
          roster.some((student) => {
            const entry = entryOf(student.id);
            const saved = savedEntries[student.id] ?? FALLBACK;
            return entry.status !== saved.status || entry.note !== saved.note;
          })
        }
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          {m.attendanceUnrecordedCount({
            count: roster.filter(
              (student) => entryOf(student.id).status === null,
            ).length,
          })}
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={!hydrated || isPending}
          onClick={() => {
            setEntries((previous) =>
              Object.fromEntries(
                roster.map((student) => {
                  const entry = previous[student.id] ?? FALLBACK;
                  return [
                    student.id,
                    entry.status ? entry : { ...entry, status: "present" },
                  ];
                }),
              ),
            );
          }}
        >
          {m.attendanceMarkUnrecordedPresent()}
        </Button>
      </div>
      {failure ? (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {failure}
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {roster.map((student) => {
          const entry = entryOf(student.id);
          const name = studentName(student);
          const noteId = `note-${student.id}`;

          return (
            <li
              key={student.id}
              className="rounded-xl border border-border bg-card p-3 sm:p-4"
            >
              <fieldset disabled={!hydrated || isPending}>
                <legend className="sr-only">
                  {m.teachAttendanceFor({ student: name })}
                </legend>

                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-sm font-semibold">{name}</span>
                  <span className="text-xs text-muted-foreground">
                    {m.teachReference()}
                    {": "}
                    {student.reference}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {ATTENDANCE_STATUSES.map((status) => {
                    const label = ATTENDANCE_LABEL[status]();
                    return (
                      <label
                        key={status}
                        className={cn(
                          "relative flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-border px-2 text-center text-sm font-medium transition-colors",
                          "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                          entry.status === status
                            ? "border-primary bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-muted",
                        )}
                      >
                        <input
                          type="radio"
                          // Covering the whole option rather than `sr-only`:
                          // the input itself has to be what a tap lands on.
                          className="absolute inset-0 size-full cursor-pointer opacity-0"
                          name={`attendance-${student.id}`}
                          value={status}
                          checked={entry.status === status}
                          aria-label={m.teachMarkFor({
                            status: label,
                            student: name,
                          })}
                          onChange={() => {
                            update(student.id, { status });
                          }}
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>

                {
                  <div className="mt-3">
                    <label htmlFor={noteId} className="sr-only">
                      {m.teachNoteFor({ student: name })}
                    </label>
                    <Input
                      id={noteId}
                      className="h-11 sm:h-10"
                      placeholder={m.attendanceNote()}
                      value={entry.note}
                      disabled={entry.status === null}
                      onChange={(event) => {
                        update(student.id, { note: event.target.value });
                      }}
                    />
                  </div>
                }
              </fieldset>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
        <p className="text-sm text-muted-foreground">
          {m.teachRegisterSummary({
            present: tally("present"),
            absent: tally("absent"),
            late: tally("late"),
            excused: tally("excused"),
          })}
        </p>
        <Button
          type="submit"
          className="h-11 sm:h-10"
          disabled={
            !hydrated ||
            isPending ||
            !roster.some((student) => entryOf(student.id).status !== null)
          }
        >
          {isPending ? m.teachSaving() : m.teachSaveRegister()}
        </Button>
      </div>
    </form>
  );
}
