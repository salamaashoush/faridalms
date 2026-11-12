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
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { homeroomHistoryQuery } from "~/queries/homerooms";
import { peopleOptionsQuery } from "~/queries/students";
import { leaveHomeroom } from "~/server/homerooms";
import { formatDate } from "~/utils/datetime";

import { MoveClassSheet } from "./Placement";

type Sheet = "move" | "withdraw" | null;

/**
 * Where a student sits today: their homeroom, and the school year a move
 * would be made in, which is that class's or else the year being worked
 * in. A closed year takes no moves.
 */
function useSeat(studentId: string, today: string) {
  const { rows: episodes, teachers } = useSuspenseQuery(
    homeroomHistoryQuery(studentId),
  ).data;
  const options = useSuspenseQuery(peopleOptionsQuery).data;
  const current = episodes.find((row) => row.from <= today && today < row.to);
  const year = options.years.find(
    (row) => row.id === (current?.schoolYearId ?? options.workingYearId),
  );
  return {
    episodes,
    teachers,
    current,
    year,
    closed: year?.lifecycle === "closed",
  };
}

/**
 * Moves a student to another homeroom from anywhere on their record: the
 * sheet their homeroom opens, with what it needs read here. Nothing opens
 * where the year takes no moves.
 */
export function MoveStudent({ student, today, onClose }: MoveOneProps) {
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

/** A student's places in the school's homerooms, with moving and leaving. */
export function StudentHomeroom({ student, today, manage }: StudentPartProps) {
  const { episodes, teachers, current, year, closed } = useSeat(
    student.id,
    today,
  );
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
          <RecordEmpty>{m.homeroomNone()}</RecordEmpty>
        ) : (
          <RecordList>
            {episodes.map((episode) => {
              const now = episode.from <= today && today < episode.to;
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
                    <span className="text-[13px] leading-[18px] text-muted-foreground">
                      {inLocale(episode.yearTitleEn, episode.yearTitleAr)}
                    </span>
                    {now && teachers.length > 0 ? (
                      <span className="flex flex-wrap gap-x-1 text-[13px] leading-[18px] text-muted-foreground">
                        {m.studentHomeroomTeacher()}:
                        <GroupTeachers teachers={teachers} />
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
            id: current.enrollmentId,
            version: current.version,
            from: current.from,
          }}
          className={classTitle(current)}
          year={year}
          today={today}
          open
          onClose={close}
          withdraw={(input) => leaveHomeroom({ data: input })}
        />
      ) : null}
    </>
  );
}
