import type { useNavigate } from "@tanstack/react-router";

import { cn } from "@faridalms/ui/cn";
import {
  phoneLink,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Pencil } from "lucide-react";

import type {
  ClassPart,
  ClassRecordData,
  RosterKeeping,
} from "~/components/classes/slots";

import { classTitle, subjectName } from "~/components/classes/format";
import { displayName } from "~/components/people/format";
import * as m from "~/i18n/messages";
import { classOptionsQuery } from "~/queries/classes";
import type { homeroomOfClassQuery } from "~/queries/homerooms";
import { leaveHomeroom, placeInHomeroom } from "~/server/homerooms";

import { MoveClassSheet } from "./Placement";

export type Of = Awaited<
  ReturnType<NonNullable<ReturnType<typeof homeroomOfClassQuery>["queryFn"]>>
>;
type Subjects = Extract<Of, { kind: "homeroom" }>["subjects"];

const linkClass = cn(
  "text-sm leading-5 font-medium hover:text-primary hover:underline",
  phoneLink,
);

interface SubjectsSectionProps {
  subjects: Subjects;
}

/** A homeroom's subject classes, each with its teacher. */
function SubjectsSection({ subjects }: SubjectsSectionProps) {
  const options = useSuspenseQuery(classOptionsQuery).data;
  return (
    <RecordSection title={m.classesSubjects()}>
      {subjects.length === 0 ? (
        <RecordEmpty>{m.classesNoSubjects()}</RecordEmpty>
      ) : (
        <RecordList>
          {subjects.map((subject) => {
            const teacher = subject.teachers[0];
            return (
              <li
                key={subject.id}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3"
              >
                <Link
                  to="/classes/$classId"
                  params={{ classId: subject.id }}
                  search={{}}
                  className={linkClass}
                >
                  {subjectName(options.subjects, subject.subjectId) ||
                    classTitle(subject)}
                </Link>
                <span className="text-[13px] leading-[18px] text-muted-foreground">
                  {teacher ? (
                    <bdi>{displayName(teacher)}</bdi>
                  ) : (
                    m.classesNoTeacherYet()
                  )}
                </span>
              </li>
            );
          })}
        </RecordList>
      )}
    </RecordSection>
  );
}

interface HomeroomSectionProps {
  homeroom: {
    id: string;
    code: string;
    titleEn: string | null;
    titleAr: string | null;
  };
}

/** The homeroom a subject class is taught to. */
function HomeroomSection({ homeroom }: HomeroomSectionProps) {
  return (
    <RecordSection title={m.homeroomWord()}>
      <Link
        to="/classes/$classId"
        params={{ classId: homeroom.id }}
        search={{}}
        className={linkClass}
      >
        {classTitle(homeroom)}
      </Link>
    </RecordSection>
  );
}

function homeroomRoster(record: ClassRecordData): RosterKeeping {
  return {
    add: (input) => placeInHomeroom({ data: { ...input, classId: record.id } }),
    withdraw: (input) => leaveHomeroom({ data: input }),
    move: ({ student, year, today, onClose }) => (
      <MoveClassSheet
        student={{ id: student.userId, name: student.name }}
        current={{ classId: record.id, from: student.from }}
        year={year}
        today={today}
        open
        onClose={onClose}
      />
    ),
  };
}

/** A class as its homeroom shows it: its subjects or its homeroom, and who keeps its roster. */
export function homeroomPart(
  of: Of,
  record: ClassRecordData,
  navigate: ReturnType<typeof useNavigate>,
): ClassPart | null {
  if (of.kind === "homeroom")
    return {
      overview: <SubjectsSection subjects={of.subjects} />,
      edit: record.access.manage
        ? {
            label: m.homeroomsEdit(),
            icon: Pencil,
            onClick: () =>
              void navigate({
                to: "/homeroom-editor",
                search: { year: record.year.id, id: record.id },
              }),
          }
        : null,
      primaryTeacher: m.classesClassTeacher(),
      roster: homeroomRoster(record),
    };
  if (of.kind === "subject")
    return {
      overview: <HomeroomSection homeroom={of.homeroom} />,
      edit: null,
      primaryTeacher: m.classesSubjectTeacher(),
      rosterNote: m.classesStudentsFollow({ class: classTitle(of.homeroom) }),
      roster: null,
    };
  return null;
}
