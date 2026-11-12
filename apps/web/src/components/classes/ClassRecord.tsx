import type { HeaderFact, RecordTab } from "@faridalms/ui/system/record-page";
import type { ReactNode } from "react";

import { YOUNG_STUDENT_GRADES } from "@faridalms/domain/descriptors/catalogue";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { ActionMenu } from "@faridalms/ui/system/action-menu";
import { initialsOf } from "@faridalms/ui/system/app-shell";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { Page } from "@faridalms/ui/system/page";
import {
  phoneLink,
  RecordColumns,
  RecordEmpty,
  RecordHeader,
  RecordList,
  RecordSection,
  RecordTabs,
} from "@faridalms/ui/system/record-page";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQueries,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRightLeft, Pencil, Plus, QrCode, UserMinus } from "lucide-react";
import { useState } from "react";

import type { AreaView } from "~/components/files/AreaFiles";

import { ClassAttendance } from "~/components/attendance/ClassAttendance";
import { AreaFiles } from "~/components/files/AreaFiles";
import { ClassGradingSection } from "~/components/grading/ClassGrading";
import { ClassGoals } from "~/components/standards/Goals";
import { ClassSkills } from "~/components/standards/Progress";
import { ClassWeek } from "~/components/timetable/Weeks";
import {
  inLocale,
  useCapability,
  useCurrentUser,
} from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { classOptionsQuery, classRecordQuery } from "~/queries/classes";
import { classSoundsQuery } from "~/queries/learning";
import { changeClassSounds } from "~/server/learning";
import { formatDate } from "~/utils/datetime";

import type { ClassRecordData, RosterKeeping } from "./slots";

import { CheckboxRow } from "../people/fields";
import { displayName, labelOf } from "../people/format";
import { Deferred } from "../people/record-parts";
import { AddStudentSheet, WithdrawSheet } from "./Enrolment";
import { classTitle, subjectName } from "./format";
import { classRecordParts } from "./slots";

export const CLASS_TABS = [
  "overview",
  "students",
  "timetable",
  "attendance",
  "skills",
  "goals",
  "files",
] as const;
export type ClassTab = (typeof CLASS_TABS)[number];

const TAB_LABEL: Record<ClassTab, () => string> = {
  overview: m.recordOverview,
  students: m.classesStudents,
  timetable: m.ttTitle,
  attendance: m.attendanceTitle,
  skills: m.skillsTab,
  goals: m.goalsTab,
  files: m.filesTab,
};

type ClassData = ClassRecordData;
type Student = ClassData["roster"][number];
type Teacher = ClassData["teachers"][number];

interface PersonNameProps {
  person: {
    userId: string;
    fullNameEn: string | null;
    fullNameAr: string | null;
  };
  staff: boolean;
  student: boolean;
}

function PersonName({ person, staff, student }: PersonNameProps) {
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

interface TeachersSectionProps {
  data: ClassData;
  /** How the primary teacher is named, where a module names it. */
  primary?: string;
}

function TeachersSection({ data, primary }: TeachersSectionProps) {
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
                  ? (primary ??
                    (data.subjectId
                      ? m.classesSubjectTeacher()
                      : m.classesTeacher()))
                  : m.classesCoTeacher()}
              </span>
            </li>
          ))}
        </RecordList>
      )}
    </RecordSection>
  );
}

interface LessonSoundsSectionProps {
  classId: string;
}

/**
 * Whether lessons tick and chime as this class's children answer. A room of
 * tablets is loud; words still play, since children who cannot read need
 * them.
 */
function LessonSoundsSection({ classId }: LessonSoundsSectionProps) {
  const queryClient = useQueryClient();
  const sounds = useQuery(classSoundsQuery(classId));
  const change = useServerFn(changeClassSounds);
  const save = useMutation({
    mutationFn: (on: boolean) => change({ data: { classId, on } }),
    onSuccess: (result) =>
      queryClient.setQueryData(classSoundsQuery(classId).queryKey, result),
  });
  if (!sounds.data) return null;
  return (
    <RecordSection title={m.classesLessons()}>
      <CheckboxRow
        label={m.classesLessonSounds()}
        hint={m.classesLessonSoundsHint()}
        checked={save.isPending ? save.variables : sounds.data.on}
        onChange={(on) => save.mutate(on)}
      />
    </RecordSection>
  );
}

type Sheet =
  | { kind: "add" }
  | { kind: "move"; student: Student }
  | { kind: "withdraw"; student: Student };

interface StudentsSectionProps {
  data: ClassData;
  /** What the roster is, where a module says. */
  note?: string;
  /** The roster as a module keeps it; null keeps it closed to changes. */
  keeping?: RosterKeeping | null;
}

function StudentsSection({ data, note, keeping }: StudentsSectionProps) {
  const options = useSuspenseQuery(classOptionsQuery).data;
  const canEnrol = data.access.enrol && keeping !== null;
  const meaning = options.grades.find(
    (row) => row.id === data.gradeId,
  )?.meaning;
  const badges =
    useCapability("badges:issue") &&
    (YOUNG_STUDENT_GRADES as readonly (string | null | undefined)[]).includes(
      meaning,
    );
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
          add={keeping?.add}
        />
      );
    else if (sheet.sheet.kind === "move" && student && keeping?.move)
      sheetNode = sheet.open
        ? keeping.move({
            student: {
              userId: student.userId,
              name: displayName(student),
              enrollmentId: student.enrollmentId,
              version: student.version,
              from: student.from,
            },
            year,
            today: data.on,
            onClose: close,
          })
        : null;
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
          withdraw={keeping?.withdraw}
        />
      );
  }
  return (
    <>
      <RecordSection
        title={m.classesStudents()}
        description={note ?? m.classesStudentsOn({ date: formatDate(data.on) })}
        action={
          canEnrol || badges ? (
            <div className="flex flex-wrap gap-1">
              {badges ? (
                <ButtonLink
                  to="/badges/$classId"
                  params={{ classId: data.id }}
                  variant="ghost"
                  className="max-md:h-10"
                >
                  <QrCode aria-hidden />
                  {m.badgesTitle()}
                </ButtonLink>
              ) : null}
              {canEnrol ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="max-md:h-10"
                  onClick={() => open({ kind: "add" })}
                >
                  <Plus aria-hidden />
                  {m.enrolmentAdd()}
                </Button>
              ) : null}
            </div>
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
                      ...(keeping?.move
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

export interface ClassRecordProps {
  classId: string;
  tab: ClassTab;
  onTab: (tab: ClassTab) => void;
  files: AreaView;
  onFiles: (change: Partial<AreaView>) => void;
}

export function ClassRecord({
  classId,
  tab,
  onTab,
  files,
  onFiles,
}: ClassRecordProps) {
  const data = useSuspenseQuery(classRecordQuery(classId)).data;
  const options = useSuspenseQuery(classOptionsQuery).data;
  const navigate = useNavigate();
  const parts = useSlot(classRecordParts);
  const read = useSuspenseQueries({
    queries: parts.map((each) => each.query(classId)),
  });
  const part =
    parts
      .map((each, index) => each.partOf(read[index]?.data, data, navigate))
      .find((found) => found !== null) ?? null;
  const modules = useCurrentUser().modules;
  const seesAttendance = useCapability("attendance:read") && modules.attendance;
  const seesTimetable = useCapability("timetable:read") && modules.timetable;
  const setsUpGrading = useCapability("grading:manage");
  const keepsClasses = useCapability("classes:manage");
  const teaches = useCapability("assignments:author");
  const grades = useCapability("submissions:grade");
  const keepsGrading = setsUpGrading || keepsClasses;
  const youngClass = (
    YOUNG_STUDENT_GRADES as readonly (string | null | undefined)[]
  ).includes(options.grades.find((row) => row.id === data.gradeId)?.meaning);
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
      (value !== "skills" || (grades && modules.standards)) &&
      (value !== "goals" || (grades && youngClass && modules.standards)) &&
      (value !== "files" || data.access.files),
  );
  const active = available.includes(tab) ? tab : "overview";
  const tabs: RecordTab<ClassTab>[] = available.map((value) => ({
    value,
    label: TAB_LABEL[value](),
  }));
  const body =
    active === "students" ? (
      <RecordColumns
        main={
          <StudentsSection
            data={data}
            note={part?.rosterNote}
            keeping={part && "roster" in part ? part.roster : undefined}
          />
        }
      />
    ) : active === "attendance" ? (
      <ClassAttendance classId={data.id} />
    ) : active === "timetable" ? (
      <ClassWeek classId={data.id} />
    ) : active === "skills" ? (
      <Deferred>
        <ClassSkills classId={data.id} />
      </Deferred>
    ) : active === "goals" ? (
      <Deferred>
        <ClassGoals classId={data.id} />
      </Deferred>
    ) : active === "files" ? (
      <AreaFiles
        area={{ type: "class", id: data.id }}
        title={title}
        view={files}
        onView={onFiles}
      />
    ) : (
      <RecordColumns
        main={part?.overview ?? <TeachersSection data={data} />}
        aside={
          <>
            {part?.overview ? (
              <TeachersSection data={data} primary={part.primaryTeacher} />
            ) : null}
            {youngClass && (teaches || keepsClasses) && data.access.staff ? (
              <LessonSoundsSection classId={data.id} />
            ) : null}
            {keepsGrading || teaches ? (
              <ClassGradingSection
                classId={data.id}
                canEdit={keepsGrading && data.year.lifecycle !== "closed"}
              />
            ) : null}
          </>
        }
      />
    );
  return (
    <Page width="record">
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
          part && "edit" in part
            ? (part.edit ?? undefined)
            : data.access.manage
              ? {
                  label: m.classesEdit(),
                  icon: Pencil,
                  onClick: () =>
                    void navigate({
                      to: "/class-editor",
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
    </Page>
  );
}
