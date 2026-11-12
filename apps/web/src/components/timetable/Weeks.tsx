import type { ReactNode } from "react";

import { Button } from "@faridalms/ui/button";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { useSuspenseQuery } from "@tanstack/react-query";
import { CalendarRange, CalendarX2, Printer } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";

import { Subscribe } from "~/components/calendar/Subscribe";
import { classTitle } from "~/components/classes/format";
import { PersonLink } from "~/components/people/PersonLink";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  classWeekQuery,
  roomWeekQuery,
  studentWeekQuery,
  teacherWeekQuery,
} from "~/queries/timetable";
import { formatDate } from "~/utils/datetime";

import type { GridDate, GridPeriod } from "./WeekGrid";

import { weekOfCycle } from "./cycle";
import { FreeCell, MeetingCard, WeekGrid, WeekStep } from "./WeekGrid";

type Week = NonNullable<
  Awaited<
    ReturnType<NonNullable<ReturnType<typeof studentWeekQuery>["queryFn"]>>
  >["week"]
>;
export type Meeting = Week["meetings"][number];

/** A meeting as labels read it: planned, or with one day's change. */
type Labelled = Pick<
  Meeting,
  | "roomId"
  | "roomCode"
  | "roomNameEn"
  | "roomNameAr"
  | "teacherId"
  | "teacherNameEn"
  | "teacherNameAr"
> & { change?: Meeting["change"] };

/** Where it meets: the day's room when it moved, else its own. */
export function roomLabel(meeting: Labelled): string | null {
  const moved = meeting.change?.roomId ? meeting.change : null;
  if (moved)
    return inLocale(moved.roomNameEn, moved.roomNameAr) || moved.roomCode;
  if (!meeting.roomId) return null;
  return inLocale(meeting.roomNameEn, meeting.roomNameAr) || meeting.roomCode;
}

/** Who teaches it: the day's cover when there is one, else its own teacher. */
export function teacherLabel(meeting: Labelled): string | null {
  const cover = meeting.change?.coverId ? meeting.change : null;
  if (cover) return inLocale(cover.coverNameEn, cover.coverNameAr);
  return meeting.teacherId
    ? inLocale(meeting.teacherNameEn, meeting.teacherNameAr)
    : null;
}

type Lines = (meeting: Meeting) => { teacher?: ReactNode; room?: ReactNode };

interface TeacherNameProps {
  meeting: Meeting;
}

/** Who teaches it, as a link to as much of them as the reader reaches. */
function TeacherName({ meeting }: TeacherNameProps) {
  const name = teacherLabel(meeting);
  if (!name) return null;
  return (
    <PersonLink
      userId={meeting.change?.coverId ?? meeting.teacherId}
      link={meeting.teacherLink}
      className="hover:text-foreground hover:underline"
    >
      {name}
    </PersonLink>
  );
}

const teacherAndRoom: Lines = (meeting) => ({
  teacher: <TeacherName meeting={meeting} />,
  room: roomLabel(meeting),
});
const teacherOnly: Lines = (meeting) => ({
  teacher: <TeacherName meeting={meeting} />,
});
const roomOnly: Lines = (meeting) => ({ room: roomLabel(meeting) });

export function meetingTitle(meeting: Meeting): string {
  return classTitle({
    code: meeting.classCode,
    titleEn: meeting.classTitleEn,
    titleAr: meeting.classTitleAr,
  });
}

/** Today's ISO weekday on the school's clock. */
export function todayOf(iso: string): number {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export type CardCell = (input: {
  meeting: Meeting;
  day: number;
  period: GridPeriod;
  card: ReactNode;
}) => ReactNode;

/**
 * What differs about a lesson on its day. A teacher's own week names who
 * covers their lesson, and whose lesson they cover; other weeks show the
 * cover teacher in the teacher's line.
 */
function changeLine(meeting: Meeting, own: boolean): string | null {
  const change = meeting.change;
  if (!change) return null;
  if (change.cancelled) return m.ttCancelled();
  if (meeting.oneDay)
    return change.coverId
      ? m.ttOneDayWith({
          name: inLocale(change.coverNameEn, change.coverNameAr),
        })
      : m.ttOneDay();
  if (meeting.cover)
    return m.ttCoverFor({
      name: inLocale(meeting.teacherNameEn, meeting.teacherNameAr),
    });
  if (change.coverId)
    return own
      ? m.ttCoveredBy({
          name: inLocale(change.coverNameEn, change.coverNameAr),
        })
      : m.ttCoverTeacher();
  return m.ttRoomChanged();
}

function weekCell(lines: Lines, cell: CardCell | undefined, own: boolean) {
  return function renderCell({
    meeting,
    day,
    period,
  }: {
    meeting: Meeting | null;
    day: number;
    period: GridPeriod;
  }) {
    if (!meeting) return <FreeCell />;
    const card = (
      <MeetingCard
        title={meetingTitle(meeting)}
        {...lines(meeting)}
        flagged={meeting.clashing}
        change={changeLine(meeting, own)}
        cancelled={meeting.change?.cancelled ?? false}
        note={meeting.cover ? meeting.change?.note : null}
      />
    );
    return cell ? cell({ meeting, day, period, card }) : card;
  };
}

export interface WeekProps {
  week: Week | null;
  caption: string;
  lines: Lines;
  cell?: CardCell;
  /** A teacher's own week, where covers name who covers whom. */
  own?: boolean;
  /** The reader's own week, which their calendar link carries. */
  subscribe?: boolean;
  pending?: boolean;
  onWeek?: (on: string) => void;
}

export function Week({
  week,
  caption,
  lines,
  cell,
  own = false,
  subscribe = false,
  pending,
  onWeek,
}: WeekProps) {
  if (!week)
    return (
      <EmptyState
        icon={CalendarX2}
        title={m.ttNoLessons()}
        description={m.ttNoLessonsBody()}
      />
    );
  const grid = (
    <WeekGrid
      caption={caption}
      days={week.days}
      dates={week.dates}
      periods={week.periods}
      meetings={week.meetings}
      today={week.dates.find((day) => day.date === week.today)?.day}
      cell={weekCell(lines, cell, own)}
    />
  );
  const cycleWeek = weekOfCycle(week.dates);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          {onWeek ? (
            <WeekStep
              dates={week.dates}
              today={week.today}
              pending={pending}
              onWeek={onWeek}
            />
          ) : null}
          {cycleWeek ? (
            <span className="rounded-md bg-muted px-2 text-sm leading-7 font-medium">
              {cycleWeek}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {subscribe ? <Subscribe /> : null}
          {week.meetings.length > 0 ? (
            <PrintWeek title={caption} dates={week.dates}>
              {grid}
            </PrintWeek>
          ) : null}
        </div>
      </div>
      {week.meetings.length === 0 ? (
        <EmptyState
          icon={CalendarX2}
          title={m.ttNoLessons()}
          description={m.ttNoLessonsBody()}
        />
      ) : (
        grid
      )}
    </div>
  );
}

interface PrintWeekProps {
  title: string;
  dates: readonly GridDate[];
  children: ReactNode;
}

/**
 * Prints the week on its own on a landscape page, black on white whatever
 * the app's theme. The sheet exists only while the browser prints.
 */
function PrintWeek({ title, dates, children }: PrintWeekProps) {
  const user = useCurrentUser();
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    window.print();
    return () => window.removeEventListener("afterprint", done);
  }, [printing]);
  const first = dates[0]?.date;
  const last = dates.at(-1)?.date;
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="max-md:h-10"
        onClick={() => setPrinting(true)}
      >
        <Printer aria-hidden />
        {m.ttPrint()}
      </Button>
      {printing
        ? createPortal(
            <div
              data-print-sheet
              className="paper hidden bg-background text-foreground print:block"
            >
              <style>{"@page { size: A4 landscape; margin: 10mm; }"}</style>
              <header className="mb-3 flex items-baseline justify-between gap-4">
                <h1 className="text-lg font-semibold">{title}</h1>
                <p className="text-sm">
                  {user.school.name}
                  {first && last
                    ? ` · ${formatDate(first)} – ${formatDate(last)}`
                    : null}
                </p>
              </header>
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** The week a view shows, stepped without hiding the one on screen. */
function useWeekOn(start = "") {
  const [on, setOn] = useState(start);
  const [pending, startTransition] = useTransition();
  return {
    on,
    pending,
    onWeek: (next: string) => startTransition(() => setOn(next)),
  };
}

export interface StudentWeekProps {
  studentId?: string;
}

export function StudentWeek({ studentId = "" }: StudentWeekProps) {
  const { on, pending, onWeek } = useWeekOn();
  const { week } = useSuspenseQuery(studentWeekQuery(studentId, on)).data;
  return (
    <Week
      week={week}
      caption={m.ttStudentCaption()}
      lines={teacherAndRoom}
      subscribe={studentId === ""}
      pending={pending}
      onWeek={onWeek}
    />
  );
}

export interface RoomWeekProps {
  roomId: string;
  on: string;
}

export function RoomWeek({ roomId, on }: RoomWeekProps) {
  const { week } = useSuspenseQuery(roomWeekQuery(roomId, on)).data;
  return <Week week={week} caption={m.ttRoomCaption()} lines={teacherOnly} />;
}

export interface TeacherWeekProps {
  teacherId?: string;
  on?: string;
  cell?: CardCell;
}

/**
 * A teacher's week. Planners pick its date themselves; a teacher steps
 * through their own weeks here.
 */
export function TeacherWeek({ teacherId = "", on, cell }: TeacherWeekProps) {
  const stepped = useWeekOn();
  const { week } = useSuspenseQuery(
    teacherWeekQuery(teacherId, on ?? stepped.on),
  ).data;
  return (
    <Week
      week={week}
      caption={m.ttTeacherCaption()}
      lines={roomOnly}
      cell={cell}
      own
      subscribe={on === undefined && teacherId === ""}
      pending={stepped.pending}
      onWeek={on === undefined ? stepped.onWeek : undefined}
    />
  );
}

export interface ClassWeekProps {
  classId: string;
}

/** A class's week on its record, with the way into planning it. */
export function ClassWeek({ classId }: ClassWeekProps) {
  const { on, pending, onWeek } = useWeekOn();
  const data = useSuspenseQuery(classWeekQuery(classId, on)).data;
  return (
    <div className="grid gap-4">
      {data.canPlan ? (
        <div className="flex justify-end">
          <ButtonLink
            to="/timetable"
            search={{ view: "classes", classId: data.gridClassId }}
            variant="outline"
            className="max-md:h-10"
          >
            <CalendarRange aria-hidden />
            {m.ttPlan()}
          </ButtonLink>
        </div>
      ) : null}
      <Week
        week={data.week.meetings.length > 0 ? data.week : null}
        caption={m.ttClassCaption()}
        lines={teacherAndRoom}
        pending={pending}
        onWeek={onWeek}
      />
    </div>
  );
}
