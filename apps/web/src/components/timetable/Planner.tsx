import type { ClashResolution } from "@faridalms/domain/timetable";

import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@faridalms/ui/dialog";
import { SelectField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { classTitle } from "~/components/classes/format";
import { displayName } from "~/components/people/format";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { timetableGridQuery, timetableOptionsQuery } from "~/queries/timetable";
import { checkPlacement, clearCell, placeMeeting } from "~/server/timetable";
import { formatWeekday, formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { GridPeriod } from "./WeekGrid";

import { FreeCell, MeetingCard, periodName, WeekGrid } from "./WeekGrid";
import { roomLabel, teacherLabel, todayOf } from "./Weeks";

type Grid = Awaited<
  ReturnType<NonNullable<ReturnType<typeof timetableGridQuery>["queryFn"]>>
>;
type Options = Awaited<
  ReturnType<NonNullable<(typeof timetableOptionsQuery)["queryFn"]>>
>;
type GridMeeting = Grid["meetings"][number];
type Booking = Awaited<ReturnType<typeof checkPlacement>>["bookings"][number];

interface Cell {
  day: number;
  period: GridPeriod;
  meeting: GridMeeting | null;
}

interface Choice {
  meetingClassId: string;
  teacherId: string;
  roomId: string;
}

function subjectOf(classRow: {
  code: string;
  titleEn: string | null;
  titleAr: string | null;
}) {
  return classTitle(classRow);
}

interface PlaceSheetProps {
  grid: Grid;
  options: Options;
  cell: Cell;
  from: string;
  onClose: () => void;
}

function PlaceSheet({ grid, options, cell, from, onClose }: PlaceSheetProps) {
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<Choice>(() => ({
    meetingClassId: cell.meeting?.classId ?? "",
    teacherId: cell.meeting?.teacherId ?? "",
    roomId: cell.meeting?.roomId ?? "",
  }));
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const where = {
    classId: grid.class.id,
    weekday: cell.day,
    periodId: cell.period.id,
    from,
  };
  const save = useMutation({
    mutationFn: async (resolve: ClashResolution | "clear") => {
      if (resolve === "clear") return clearCell({ data: where });
      return placeMeeting({ data: { ...where, ...choice, resolve } });
    },
    meta: { inlineError: true },
  });
  const done = async () => {
    await queryClient.invalidateQueries({ queryKey: ["timetable"] });
    await queryClient.invalidateQueries({ queryKey: ["attendance"] });
    toast.success(m.ttSaved());
    onClose();
  };
  const commit = (resolve: ClashResolution | "clear") =>
    save.mutateAsync(resolve).then(done, () => undefined);
  const chosen = grid.classes.find((row) => row.id === choice.meetingClassId);
  const allocated = new Set(chosen?.teachers.map((row) => row.userId) ?? []);
  const teachers = [
    ...(chosen?.teachers ?? []),
    ...options.teachers.filter((row) => !allocated.has(row.userId)),
  ];
  return (
    <>
      <SheetForm
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={m.ttCellTitle({
          day: formatWeekday(cell.day),
          period: periodName(cell.period),
        })}
        pending={save.isPending}
        error={save.error ? getMessageFromError(save.error) : null}
        onSubmit={async () => {
          if (!choice.meetingClassId) {
            await commit("clear");
            return;
          }
          const found = await checkPlacement({
            data: {
              ...where,
              teacherId: choice.teacherId,
              roomId: choice.roomId,
            },
          });
          if (found.bookings.length) setBookings(found.bookings);
          else await commit("ask");
        }}
      >
        <p className="text-sm leading-5 text-muted-foreground">
          {m.ttFromHint({ date: formatDate(from) })}
        </p>
        <SelectField
          id="cell-class"
          label={m.ttClass()}
          value={choice.meetingClassId}
          options={[
            { value: "", label: m.ttFree() },
            ...grid.classes.map((row) => ({
              value: row.id,
              label: subjectOf(row),
            })),
          ]}
          onChange={(meetingClassId) => {
            const next = grid.classes.find((row) => row.id === meetingClassId);
            setChoice((current) => ({
              ...current,
              meetingClassId,
              teacherId:
                next?.teachers.find((row) => row.isPrimary)?.userId ??
                next?.teachers[0]?.userId ??
                "",
            }));
          }}
          width="name"
        />
        {choice.meetingClassId ? (
          <>
            <SelectField
              id="cell-teacher"
              label={m.ttTeacher()}
              hint={
                chosen?.teachers.length ? m.ttTeacherHintPicker() : undefined
              }
              value={choice.teacherId}
              options={[
                { value: "", label: m.ttNoTeacher() },
                ...teachers.map((row) => ({
                  value: row.userId,
                  label: displayName(row),
                })),
              ]}
              onChange={(teacherId) =>
                setChoice((current) => ({ ...current, teacherId }))
              }
              width="name"
            />
            <SelectField
              id="cell-room"
              label={m.ttRoom()}
              value={choice.roomId}
              options={[
                { value: "", label: m.ttNoRoom() },
                ...options.rooms.map((row) => ({
                  value: row.id,
                  label: inLocale(row.nameEn, row.nameAr) || (row.code ?? ""),
                })),
              ]}
              onChange={(roomId) =>
                setChoice((current) => ({ ...current, roomId }))
              }
              width="name"
            />
          </>
        ) : null}
      </SheetForm>
      <Dialog
        open={bookings !== null}
        onOpenChange={(open) => {
          if (!open && !save.isPending) setBookings(null);
        }}
      >
        <DialogContent showCloseButton={false} className="gap-5 sm:max-w-md">
          <div className="grid gap-2">
            <DialogTitle className="text-base font-semibold">
              {m.ttBusyTitle()}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {m.ttBusyBody()}
            </DialogDescription>
          </div>
          <ul className="grid gap-1 text-sm leading-5">
            {(bookings ?? []).map((row) => (
              <li key={`${row.kind}-${row.id}`}>
                {row.kind === "teacher"
                  ? m.ttBusyTeacher({
                      lesson: classTitle({
                        code: row.classCode,
                        titleEn: row.classTitleEn,
                        titleAr: row.classTitleAr,
                      }),
                    })
                  : m.ttBusyRoom({
                      lesson: classTitle({
                        code: row.classCode,
                        titleEn: row.classTitleEn,
                        titleAr: row.classTitleAr,
                      }),
                    })}
              </li>
            ))}
          </ul>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={() => setBookings(null)}
            >
              {m.docCancel()}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={() => void commit("keep")}
            >
              {m.ttKeepBoth()}
            </Button>
            <Button
              type="button"
              disabled={save.isPending}
              onClick={() => void commit("move")}
            >
              {m.ttMoveHere()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

interface PlannerCellProps {
  cell: Cell;
  editable: boolean;
  onOpen: () => void;
}

function PlannerCell({ cell, editable, onOpen }: PlannerCellProps) {
  const hydrated = useHydrated();
  const content = cell.meeting ? (
    <MeetingCard
      title={classTitle({
        code: cell.meeting.classCode,
        titleEn: cell.meeting.classTitleEn,
        titleAr: cell.meeting.classTitleAr,
      })}
      teacher={teacherLabel(cell.meeting)}
      room={roomLabel(cell.meeting)}
      flagged={cell.meeting.clashing}
    />
  ) : (
    <FreeCell />
  );
  if (!editable) return content;
  return (
    <button
      type="button"
      disabled={!hydrated}
      onClick={onOpen}
      aria-label={m.ttEditCell({
        day: formatWeekday(cell.day),
        period: periodName(cell.period),
      })}
      className={cn(
        "block h-full w-full rounded-md text-start transition-shadow hover:ring-2 hover:ring-ring/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        !cell.meeting && "border border-dashed",
      )}
    >
      {content}
    </button>
  );
}

function plannerCell(editable: boolean, onOpen: (cell: Cell) => void) {
  return function renderCell(cell: Cell) {
    return (
      <PlannerCell
        cell={cell}
        editable={editable}
        onOpen={() => onOpen(cell)}
      />
    );
  };
}

/** One homeroom's week, each cell edited from the day changes apply. */
export interface PlannerProps {
  classId: string;
  from: string;
}

export function Planner({ classId, from }: PlannerProps) {
  const options = useSuspenseQuery(timetableOptionsQuery).data;
  const grid = useSuspenseQuery(timetableGridQuery(classId, from)).data;
  const user = useCurrentUser();
  const [open, setOpen] = useState<{ cell: Cell; key: number } | null>(null);
  const editable = !grid.year.closed;
  return (
    <>
      <WeekGrid
        caption={m.ttGridCaption({ lesson: classTitle(grid.class) })}
        days={grid.days}
        periods={grid.periods}
        meetings={grid.meetings}
        today={todayOf(user.today)}
        cell={plannerCell(editable, (cell) =>
          setOpen((current) => ({ cell, key: (current?.key ?? 0) + 1 })),
        )}
      />
      {open ? (
        <PlaceSheet
          key={open.key}
          grid={grid}
          options={options}
          cell={open.cell}
          from={grid.on}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}
