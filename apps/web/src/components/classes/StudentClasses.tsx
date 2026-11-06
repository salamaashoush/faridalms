import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  phoneLink,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRightLeft, UserMinus } from "lucide-react";
import { useState } from "react";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { enrollmentHistoryQuery } from "~/queries/classes";
import { peopleOptionsQuery } from "~/queries/students";
import { formatDate } from "~/utils/datetime";

import { displayName, lastDay } from "../people/format";
import { MoveClassSheet, WithdrawSheet } from "./Enrolment";
import { classTitle } from "./format";

type Sheet = "move" | "withdraw" | null;

export interface Homeroom {
  classId: string;
  teachers: {
    userId: string;
    fullNameEn: string | null;
    fullNameAr: string | null;
  }[];
}

/** The teachers who keep a student's class, each opening their record. */
export interface HomeroomTeachersProps {
  homeroom: Homeroom;
}

export function HomeroomTeachers({ homeroom }: HomeroomTeachersProps) {
  return (
    <span>
      {homeroom.teachers.map((teacher, index) => (
        <span key={teacher.userId}>
          <Link
            to="/people/$userId"
            params={{ userId: teacher.userId }}
            search={{}}
            dir="auto"
            className={cn("hover:text-primary hover:underline", phoneLink)}
          >
            {displayName(teacher)}
          </Link>
          {index < homeroom.teachers.length - 1 ? (
            <span aria-hidden> · </span>
          ) : null}
        </span>
      ))}
    </span>
  );
}

/**
 * Where a student sits today: their homeroom, and the school year a move
 * would be made in, which is that class's or else the year being worked
 * in. A closed year takes no moves.
 */
function useSeat(studentId: string, today: string) {
  const episodes = useSuspenseQuery(enrollmentHistoryQuery(studentId)).data;
  const options = useSuspenseQuery(peopleOptionsQuery).data;
  const current = episodes.find(
    (row) =>
      row.classType === "homeroom" && row.from <= today && today < row.to,
  );
  const year = options.years.find(
    (row) => row.id === (current?.schoolYearId ?? options.workingYearId),
  );
  return { episodes, current, year, closed: year?.lifecycle === "closed" };
}

export interface MoveStudentProps {
  student: { id: string; name: string };
  today: string;
  onClose: () => void;
}

/**
 * Moves a student to another class from anywhere on their record: the
 * sheet their classes open, with what it needs read here. Nothing opens
 * where the year takes no moves.
 */
export function MoveStudent({ student, today, onClose }: MoveStudentProps) {
  const { current, year, closed } = useSeat(student.id, today);
  if (!year || closed) return null;
  return (
    <MoveClassSheet
      student={student}
      current={
        current ? { classId: current.classId, from: current.from } : null
      }
      year={year}
      today={today}
      open
      onClose={onClose}
    />
  );
}

export interface StudentClassesProps {
  student: { id: string; name: string };
  today: string;
  manage: boolean;
  homeroom: Homeroom | null;
}

export function StudentClasses({
  student,
  today,
  manage,
  homeroom,
}: StudentClassesProps) {
  const { episodes, current, year, closed } = useSeat(student.id, today);
  const [sheet, setSheet] = useState<{ which: Sheet; key: number }>({
    which: null,
    key: 0,
  });
  const open = (which: Sheet) =>
    setSheet((state) => ({ which, key: state.key + 1 }));
  const close = () => setSheet((state) => ({ ...state, which: null }));
  return (
    <>
      <RecordSection
        title={m.enrolmentClasses()}
        description={m.enrolmentClassesHint()}
        action={
          manage && year && !closed ? (
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                variant="ghost"
                className="max-md:h-10"
                onClick={() => open("move")}
              >
                <ArrowRightLeft aria-hidden />
                {current ? m.enrolmentMove() : m.enrolmentPlace()}
              </Button>
              {current ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="max-md:h-10"
                  onClick={() => open("withdraw")}
                >
                  <UserMinus aria-hidden />
                  {m.enrolmentWithdraw()}
                </Button>
              ) : null}
            </div>
          ) : undefined
        }
      >
        {episodes.length === 0 ? (
          <RecordEmpty>{m.enrolmentNoClass()}</RecordEmpty>
        ) : (
          <RecordList>
            {episodes.map((episode) => {
              const now = episode.from <= today && today < episode.to;
              return (
                <li
                  key={episode.id}
                  className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-3"
                >
                  <div className="grid min-w-0 gap-0.5">
                    <span className="flex flex-wrap items-center gap-x-3 text-sm leading-5 font-medium">
                      <Link
                        to="/classes/$classId"
                        params={{ classId: episode.classId }}
                        search={{}}
                        className={cn(
                          "hover:text-primary hover:underline",
                          phoneLink,
                        )}
                      >
                        {classTitle(episode)}
                      </Link>
                      {now ? (
                        <StatusText tone="success">
                          {m.enrollmentCurrent()}
                        </StatusText>
                      ) : null}
                    </span>
                    <span className="text-[13px] leading-[18px] text-muted-foreground">
                      {inLocale(episode.yearTitleEn, episode.yearTitleAr)}
                    </span>
                    {now &&
                    homeroom?.classId === episode.classId &&
                    homeroom.teachers.length > 0 ? (
                      <span className="flex flex-wrap gap-x-1 text-[13px] leading-[18px] text-muted-foreground">
                        {m.studentHomeroomTeacher()}:
                        <HomeroomTeachers homeroom={homeroom} />
                      </span>
                    ) : null}
                  </div>
                  <span className="text-sm leading-5 text-muted-foreground">
                    {m.accessDuring({
                      from: formatDate(episode.from),
                      to: formatDate(lastDay(episode.to)),
                    })}
                  </span>
                </li>
              );
            })}
          </RecordList>
        )}
      </RecordSection>
      {manage && year && sheet.which === "move" ? (
        <MoveClassSheet
          key={sheet.key}
          student={student}
          current={
            current ? { classId: current.classId, from: current.from } : null
          }
          year={year}
          today={today}
          open
          onClose={close}
        />
      ) : null}
      {manage && year && current && sheet.which === "withdraw" ? (
        <WithdrawSheet
          key={sheet.key}
          student={student}
          enrollment={{
            id: current.id,
            version: current.version,
            from: current.from,
          }}
          className={classTitle(current)}
          year={year}
          today={today}
          open
          onClose={close}
        />
      ) : null}
    </>
  );
}
