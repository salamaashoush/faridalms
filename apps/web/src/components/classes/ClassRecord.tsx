import type { ReactNode } from "react";

import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRightLeft, Pencil, Plus, UserMinus } from "lucide-react";
import { useState } from "react";

import type { HeaderFact, RecordTab } from "~/components/system/RecordPage";

import { initialsOf } from "~/components/app/UserMenu";
import { ClassAttendance } from "~/components/attendance/ClassAttendance";
import { formatDate } from "~/components/family/format";
import { AreaFiles } from "~/components/files/AreaFiles";
import { ClassGradingSection } from "~/components/grading/ClassGrading";
import { ActionMenu } from "~/components/system/ActionMenu";
import {
  phoneLink,
  RecordColumns,
  RecordEmpty,
  RecordHeader,
  RecordList,
  RecordSection,
  RecordTabs,
} from "~/components/system/RecordPage";
import { ClassWeek } from "~/components/timetable/Weeks";
import { inLocale, useCapability } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { classOptionsQuery, classRecordQuery } from "~/queries/classes";

import { displayName, labelOf } from "../people/format";
import { AddStudentSheet, MoveClassSheet, WithdrawSheet } from "./Enrolment";
import { classTitle, subjectName } from "./format";

export const CLASS_TABS = [
  "overview",
  "students",
  "timetable",
  "attendance",
  "files",
] as const;
export type ClassTab = (typeof CLASS_TABS)[number];

const TAB_LABEL: Record<ClassTab, () => string> = {
  overview: m.recordOverview,
  students: m.classesStudents,
  timetable: m.ttTitle,
  attendance: m.attendanceTitle,
  files: m.filesTab,
};

type ClassData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof classRecordQuery>["queryFn"]>>
>;
type Student = ClassData["roster"][number];
type Teacher = ClassData["teachers"][number];

function PersonName({
  person,
  staff,
  student,
}: {
  person: {
    userId: string;
    fullNameEn: string | null;
    fullNameAr: string | null;
  };
  staff: boolean;
  student: boolean;
}) {
  const name = displayName(person);
  const className = cn(
    "justify-self-start text-sm leading-5 font-medium hover:text-primary hover:underline",
    phoneLink,
  );
  if (!staff)
    return <bdi className="text-sm leading-5 font-medium">{name}</bdi>;
  return student ? (
    <Link
      to="/students/$studentId"
      params={{ studentId: person.userId }}
      search={{}}
      className={className}
    >
      <bdi>{name}</bdi>
    </Link>
  ) : (
    <Link
      to="/people/$userId"
      params={{ userId: person.userId }}
      search={{}}
      className={className}
    >
      <bdi>{name}</bdi>
    </Link>
  );
}

function TeachersSection({ data }: { data: ClassData }) {
  return (
    <RecordSection title={m.classesTeachers()}>
      {data.teachers.length === 0 ? (
        <RecordEmpty>{m.classesNoTeacher()}</RecordEmpty>
      ) : (
        <RecordList>
          {data.teachers.map((teacher: Teacher) => (
            <li key={teacher.enrollmentId} className="grid gap-0.5 py-3">
              <PersonName
                person={teacher}
                staff={data.access.staff}
                student={false}
              />
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {teacher.isPrimary
                  ? data.classType === "homeroom"
                    ? m.classesClassTeacher()
                    : m.classesSubjectTeacher()
                  : m.classesCoTeacher()}
              </span>
            </li>
          ))}
        </RecordList>
      )}
    </RecordSection>
  );
}

function SubjectsSection({ data }: { data: ClassData }) {
  const options = useSuspenseQuery(classOptionsQuery).data;
  return (
    <RecordSection title={m.classesSubjects()}>
      {data.subjects.length === 0 ? (
        <RecordEmpty>{m.classesNoSubjects()}</RecordEmpty>
      ) : (
        <RecordList>
          {data.subjects.map((subject) => {
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
                  className={cn(
                    "text-sm leading-5 font-medium hover:text-primary hover:underline",
                    phoneLink,
                  )}
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

type Sheet =
  | { kind: "add" }
  | { kind: "move"; student: Student }
  | { kind: "withdraw"; student: Student };

function StudentsSection({ data }: { data: ClassData }) {
  const ownRoster = data.classType === "homeroom" || !data.homeroomClassId;
  const canEnrol = data.access.enrol && ownRoster;
  const [sheet, setSheet] = useState<{
    sheet: Sheet;
    open: boolean;
    key: number;
  }>({
    sheet: { kind: "add" },
    open: false,
    key: 0,
  });
  const open = (next: Sheet) =>
    setSheet((current) => ({ sheet: next, open: true, key: current.key + 1 }));
  const close = () => setSheet((current) => ({ ...current, open: false }));
  const year = data.year;
  const title = classTitle(data);
  let sheetNode: ReactNode = null;
  if (canEnrol) {
    const student = sheet.sheet.kind === "add" ? null : sheet.sheet.student;
    if (sheet.sheet.kind === "add")
      sheetNode = (
        <AddStudentSheet
          key={sheet.key}
          classId={data.id}
          className={title}
          year={year}
          today={data.on}
          open={sheet.open}
          onClose={close}
        />
      );
    else if (sheet.sheet.kind === "move" && student)
      sheetNode = (
        <MoveClassSheet
          key={sheet.key}
          student={{ id: student.userId, name: displayName(student) }}
          current={{ classId: data.id, from: student.from }}
          year={year}
          today={data.on}
          open={sheet.open}
          onClose={close}
        />
      );
    else if (student)
      sheetNode = (
        <WithdrawSheet
          key={sheet.key}
          student={{ id: student.userId, name: displayName(student) }}
          enrollment={{
            id: student.enrollmentId,
            version: student.version,
            from: student.from,
          }}
          className={title}
          year={year}
          today={data.on}
          open={sheet.open}
          onClose={close}
        />
      );
  }
  return (
    <>
      <RecordSection
        title={m.classesStudents()}
        description={
          ownRoster
            ? m.classesStudentsOn({ date: formatDate(data.on) })
            : m.classesStudentsFollow({
                class: data.homeroom ? classTitle(data.homeroom) : "",
              })
        }
        action={
          canEnrol ? (
            <Button
              type="button"
              variant="ghost"
              className="max-md:h-10"
              onClick={() => open({ kind: "add" })}
            >
              <Plus aria-hidden />
              {m.enrolmentAdd()}
            </Button>
          ) : undefined
        }
      >
        {data.roster.length === 0 ? (
          <RecordEmpty>{m.classesNoStudents()}</RecordEmpty>
        ) : (
          <RecordList>
            {data.roster.map((student) => (
              <li
                key={student.enrollmentId}
                className="flex items-start gap-3 py-3"
              >
                <span
                  aria-hidden
                  className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
                >
                  {initialsOf(displayName(student))}
                </span>
                <div className="grid min-w-0 flex-1 gap-0.5">
                  <PersonName
                    person={student}
                    staff={data.access.staff}
                    student
                  />
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {[
                      student.reference,
                      m.personSince({ date: formatDate(student.from) }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
                {canEnrol ? (
                  <ActionMenu
                    label={m.enrolmentActions({ name: displayName(student) })}
                    actions={[
                      ...(data.classType === "homeroom"
                        ? [
                            {
                              label: m.enrolmentMove(),
                              icon: ArrowRightLeft,
                              onSelect: () => open({ kind: "move", student }),
                            },
                          ]
                        : []),
                      {
                        label: m.enrolmentWithdraw(),
                        icon: UserMinus,
                        onSelect: () => open({ kind: "withdraw", student }),
                      },
                    ]}
                  />
                ) : null}
              </li>
            ))}
          </RecordList>
        )}
      </RecordSection>
      {sheetNode}
    </>
  );
}

export function ClassRecord({
  classId,
  tab,
  onTab,
}: {
  classId: string;
  tab: ClassTab;
  onTab: (tab: ClassTab) => void;
}) {
  const data = useSuspenseQuery(classRecordQuery(classId)).data;
  const options = useSuspenseQuery(classOptionsQuery).data;
  const navigate = useNavigate();
  const seesAttendance = useCapability("attendance:read");
  const seesTimetable = useCapability("timetable:read");
  const keepsExams = useCapability("exams:manage");
  const keepsClasses = useCapability("classes:manage");
  const keepsGrading = keepsExams || keepsClasses;
  const title = classTitle(data);
  const grade = labelOf(
    options.grades.find((row) => row.id === data.gradeId) ?? null,
  );
  const room = options.rooms.find((row) => row.id === data.locationId);
  const facts: HeaderFact[] = [
    {
      label: m.studentSchoolYear(),
      value: inLocale(data.year.titleEn, data.year.titleAr),
    },
  ];
  if (grade) facts.push({ label: m.studentGrade(), value: grade });
  if (data.subjectId)
    facts.push({
      label: m.classesSubject(),
      value: subjectName(options.subjects, data.subjectId),
    });
  if (room)
    facts.push({
      label: m.classesRoom(),
      value: inLocale(room.nameEn, room.nameAr) || room.code,
    });
  const available = CLASS_TABS.filter(
    (value) =>
      (value !== "attendance" || seesAttendance) &&
      (value !== "timetable" || seesTimetable) &&
      (value !== "files" || data.access.files),
  );
  const active = available.includes(tab) ? tab : "overview";
  const tabs: RecordTab<ClassTab>[] = available.map((value) => ({
    value,
    label: TAB_LABEL[value](),
  }));
  const body =
    active === "students" ? (
      <RecordColumns main={<StudentsSection data={data} />} />
    ) : active === "attendance" ? (
      <ClassAttendance classId={data.id} />
    ) : active === "timetable" ? (
      <ClassWeek classId={data.id} />
    ) : active === "files" ? (
      <AreaFiles area={{ type: "class", id: data.id }} title={title} />
    ) : (
      <RecordColumns
        main={
          data.classType === "homeroom" ? (
            <SubjectsSection data={data} />
          ) : data.homeroom ? (
            <RecordSection title={m.classesHomeroom()}>
              <Link
                to="/classes/$classId"
                params={{ classId: data.homeroom.id }}
                search={{}}
                className={cn(
                  "text-sm leading-5 font-medium hover:text-primary hover:underline",
                  phoneLink,
                )}
              >
                {classTitle(data.homeroom)}
              </Link>
            </RecordSection>
          ) : (
            <RecordSection title={m.classesHomeroom()}>
              <RecordEmpty>{m.classesOwnRoster()}</RecordEmpty>
            </RecordSection>
          )
        }
        aside={
          <>
            <TeachersSection data={data} />
            {keepsGrading ? (
              <ClassGradingSection
                classId={data.id}
                canEdit={data.year.lifecycle !== "closed"}
              />
            ) : null}
          </>
        }
      />
    );
  return (
    <div className="mx-auto w-full max-w-6xl">
      <RecordHeader
        title={title}
        initials={initialsOf(title)}
        facts={facts}
        status={
          data.year.lifecycle === "closed"
            ? { label: m.classesYearClosed(), tone: "neutral" }
            : undefined
        }
        action={
          data.access.manage && data.classType === "homeroom"
            ? {
                label: m.classesEdit(),
                icon: Pencil,
                onClick: () =>
                  void navigate({
                    to: "/admin/class-editor",
                    search: { year: data.year.id, id: data.id },
                  }),
              }
            : undefined
        }
      />
      <RecordTabs
        label={m.classesSections()}
        tabs={tabs}
        value={active}
        onChange={onTab}
      >
        {body}
      </RecordTabs>
    </div>
  );
}
