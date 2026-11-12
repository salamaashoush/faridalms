import { cn } from "@faridalms/ui/cn";
import { ActionMenu } from "@faridalms/ui/system/action-menu";
import {
  phoneLink,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { UserMinus } from "lucide-react";
import { useState } from "react";

import { studentClassesParts } from "~/components/people/slots";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { enrollmentHistoryQuery } from "~/queries/classes";
import { formatDate } from "~/utils/datetime";

import { displayName, lastDay } from "../people/format";
import { WithdrawSheet } from "./Enrolment";
import { classTitle } from "./format";
import { classHistoryNotes } from "./slots";

export interface GroupTeachersProps {
  teachers: readonly {
    userId: string;
    fullNameEn: string | null;
    fullNameAr: string | null;
  }[];
}

/** The teachers who keep a student's class, each opening their record. */
export function GroupTeachers({ teachers }: GroupTeachersProps) {
  return (
    <span>
      {teachers.map((teacher, index) => (
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
          {index < teachers.length - 1 ? <span aria-hidden> · </span> : null}
        </span>
      ))}
    </span>
  );
}

export interface StudentClassesProps {
  student: { id: string; name: string };
  today: string;
  manage: boolean;
}

/**
 * The classes a student has been in, newest first, and what modules show
 * of them. A class's own enrolment can be ended here; one a module keeps
 * is changed where the module offers it.
 */
export function StudentClasses({
  student,
  today,
  manage,
}: StudentClassesProps) {
  const episodes = useSuspenseQuery(enrollmentHistoryQuery(student.id)).data;
  const parts = useSlot(studentClassesParts);
  const notes = useSlot(classHistoryNotes);
  const noteReads = useSuspenseQueries({
    queries: notes.map((note) => note.query(student.id)),
  });
  const notesOf = (classId: string) =>
    notes.flatMap(
      (note, index) => note.noteOf(noteReads[index]?.data, classId) ?? [],
    );
  const [withdrawing, setWithdrawing] = useState<{
    id: string;
    key: number;
  } | null>(null);
  const ending = episodes.find((row) => row.id === withdrawing?.id);
  return (
    <>
      {parts.map((part) => (
        <part.Section
          key={part.move.label()}
          student={student}
          today={today}
          manage={manage}
        />
      ))}
      <RecordSection
        title={m.enrolmentClasses()}
        description={m.enrolmentClassesHint()}
      >
        {episodes.length === 0 ? (
          <RecordEmpty>{m.enrolmentNoClass()}</RecordEmpty>
        ) : (
          <RecordList>
            {episodes.map((episode) => {
              const now =
                episode.from <= today &&
                (episode.to === null || today < episode.to);
              const endable =
                manage &&
                now &&
                episode.changeable &&
                !parts.some((part) => part.keeps(episode));
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
                    {notesOf(episode.classId).map((note) => (
                      <span
                        key={note}
                        className="text-[13px] leading-[18px] text-muted-foreground"
                      >
                        {note}
                      </span>
                    ))}
                  </div>
                  <span className="flex items-center gap-2 text-sm leading-5 text-muted-foreground">
                    {episode.to
                      ? m.accessDuring({
                          from: formatDate(episode.from),
                          to: formatDate(lastDay(episode.to)),
                        })
                      : m.personSince({ date: formatDate(episode.from) })}
                    {endable ? (
                      <ActionMenu
                        label={m.enrolmentActions({
                          name: classTitle(episode),
                        })}
                        actions={[
                          {
                            label: m.enrolmentWithdraw(),
                            icon: UserMinus,
                            onSelect: () =>
                              setWithdrawing((current) => ({
                                id: episode.id,
                                key: (current?.key ?? 0) + 1,
                              })),
                          },
                        ]}
                      />
                    ) : null}
                  </span>
                </li>
              );
            })}
          </RecordList>
        )}
      </RecordSection>
      {withdrawing && ending ? (
        <WithdrawSheet
          key={withdrawing.key}
          student={student}
          enrollment={{
            id: ending.id,
            version: ending.version,
            from: ending.from,
            to: ending.to,
          }}
          className={classTitle(ending)}
          today={today}
          open
          onClose={() => setWithdrawing(null)}
        />
      ) : null}
    </>
  );
}
