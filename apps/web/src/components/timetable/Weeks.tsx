import type { ReactNode } from "react";

import { useSuspenseQuery } from "@tanstack/react-query";
import { CalendarRange, CalendarX2 } from "lucide-react";

import { ButtonLink } from "~/components/app/ButtonLink";
import { classTitle } from "~/components/classes/format";
import { EmptyState } from "~/components/system/IndexPage";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  classWeekQuery,
  roomWeekQuery,
  studentWeekQuery,
  teacherWeekQuery,
} from "~/queries/timetable";

import type { GridPeriod } from "./WeekGrid";

import { FreeCell, MeetingCard, WeekGrid } from "./WeekGrid";

type Week = NonNullable<
  Awaited<
    ReturnType<NonNullable<ReturnType<typeof studentWeekQuery>["queryFn"]>>
  >["week"]
>;
export type Meeting = Week["meetings"][number];

export function roomLabel(meeting: Meeting): string | null {
  if (!meeting.roomId) return null;
  return inLocale(meeting.roomNameEn, meeting.roomNameAr) || meeting.roomCode;
}

export function teacherLabel(meeting: Meeting): string | null {
  return meeting.teacherId
    ? inLocale(meeting.teacherNameEn, meeting.teacherNameAr)
    : null;
}

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

function weekCell(
  lines: (meeting: Meeting) => (string | null)[],
  cell: CardCell | undefined,
) {
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
        lines={lines(meeting)}
        flagged={meeting.clashing}
      />
    );
    return cell ? cell({ meeting, day, period, card }) : card;
  };
}

export function Week({
  week,
  caption,
  lines,
  cell,
}: {
  week: Week | null;
  caption: string;
  lines: (meeting: Meeting) => (string | null)[];
  cell?: CardCell;
}) {
  const user = useCurrentUser();
  if (!week || week.meetings.length === 0)
    return (
      <EmptyState
        icon={CalendarX2}
        title={m.ttNoLessons()}
        description={m.ttNoLessonsBody()}
      />
    );
  return (
    <WeekGrid
      caption={caption}
      days={week.days}
      periods={week.periods}
      meetings={week.meetings}
      today={todayOf(user.today)}
      cell={weekCell(lines, cell)}
    />
  );
}

export function StudentWeek({ studentId = "" }: { studentId?: string }) {
  const { week } = useSuspenseQuery(studentWeekQuery(studentId)).data;
  return (
    <Week
      week={week}
      caption={m.ttStudentCaption()}
      lines={(meeting) => [teacherLabel(meeting), roomLabel(meeting)]}
    />
  );
}

export function RoomWeek({ roomId, on }: { roomId: string; on: string }) {
  const { week } = useSuspenseQuery(roomWeekQuery(roomId, on)).data;
  return (
    <Week
      week={week}
      caption={m.ttRoomCaption()}
      lines={(meeting) => [teacherLabel(meeting)]}
    />
  );
}

export function TeacherWeek({
  teacherId = "",
  on = "",
  cell,
}: {
  teacherId?: string;
  on?: string;
  cell?: CardCell;
}) {
  const { week } = useSuspenseQuery(teacherWeekQuery(teacherId, on)).data;
  return (
    <Week
      week={week}
      caption={m.ttTeacherCaption()}
      lines={(meeting) => [roomLabel(meeting)]}
      cell={cell}
    />
  );
}

/** A class's week on its record, with the way into planning it. */
export function ClassWeek({ classId }: { classId: string }) {
  const data = useSuspenseQuery(classWeekQuery(classId)).data;
  return (
    <div className="grid gap-4">
      {data.canPlan ? (
        <div className="flex justify-end">
          <ButtonLink
            to="/admin/timetable"
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
        week={data.week}
        caption={m.ttClassCaption()}
        lines={(meeting) => [teacherLabel(meeting), roomLabel(meeting)]}
      />
    </div>
  );
}
