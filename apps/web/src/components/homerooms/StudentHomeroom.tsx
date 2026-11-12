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

import type { MoveOneProps, StudentPartProps } from "~/components/people/slots";

import { WithdrawSheet } from "~/components/classes/Enrolment";
import { classTitle } from "~/components/classes/format";
import { GroupTeachers } from "~/components/classes/StudentClasses";
import { lastDay } from "~/components/people/format";
import * as m from "~/i18n/messages";
import { homeroomHistoryQuery } from "~/queries/homerooms";
import { leaveHomeroom } from "~/server/homerooms";
import { formatDate } from "~/utils/datetime";

import { MoveClassSheet } from "./Placement";

type Sheet = "move" | "withdraw" | null;

const holdsToday = (row: { from: string; to: string | null }, today: string) =>
  row.from <= today && (row.to === null || today < row.to);

/** Where a student sits today: their homeroom, with its teachers. */
function useSeat(studentId: string, today: string) {
  const { rows: episodes, teachers } = useSuspenseQuery(
    homeroomHistoryQuery(studentId),
  ).data;
  const current = episodes.find((row) => holdsToday(row, today));
  return { episodes, teachers, current };
}

/**
 * Moves a student to another homeroom from anywhere on their record: the
 * sheet their homeroom opens, with what it needs read here.
 */
export function MoveStudent({ student, today, onClose }: MoveOneProps) {
  const { current } = useSeat(student.id, today);
  return (
    <MoveClassSheet
      student={student}
      current={
        current ? { classId: current.classId, from: current.from } : null
      }
      today={today}
      open
      onClose={onClose}
    />
  );
}

/** A student's places in the school's homerooms, with moving and leaving. */
export function StudentHomeroom({ student, today, manage }: StudentPartProps) {
  const { episodes, teachers, current } = useSeat(student.id, today);
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
        title={m.homeroomWord()}
        description={m.homeroomPlacesHint()}
        action={
          manage ? (
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
          <RecordEmpty>{m.homeroomNone()}</RecordEmpty>
        ) : (
          <RecordList>
            {episodes.map((episode) => {
              const now = holdsToday(episode, today);
              return (
                <li
                  key={episode.enrollmentId}
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
                    {now && teachers.length > 0 ? (
                      <span className="flex flex-wrap gap-x-1 text-[13px] leading-[18px] text-muted-foreground">
                        {m.studentHomeroomTeacher()}:
                        <GroupTeachers teachers={teachers} />
                      </span>
                    ) : null}
                  </div>
                  <span className="text-sm leading-5 text-muted-foreground">
                    {episode.to
                      ? m.accessDuring({
                          from: formatDate(episode.from),
                          to: formatDate(lastDay(episode.to)),
                        })
                      : m.personSince({ date: formatDate(episode.from) })}
                  </span>
                </li>
              );
            })}
          </RecordList>
        )}
      </RecordSection>
      {manage && sheet.which === "move" ? (
        <MoveClassSheet
          key={sheet.key}
          student={student}
          current={
            current ? { classId: current.classId, from: current.from } : null
          }
          today={today}
          open
          onClose={close}
        />
      ) : null}
      {manage && current && sheet.which === "withdraw" ? (
        <WithdrawSheet
          key={sheet.key}
          student={student}
          enrollment={{
            id: current.enrollmentId,
            version: current.version,
            from: current.from,
            to: current.to,
          }}
          className={classTitle(current)}
          today={today}
          open
          onClose={close}
          withdraw={(input) => leaveHomeroom({ data: input })}
        />
      ) : null}
    </>
  );
}
