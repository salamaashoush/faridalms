import type { HeaderFact, RecordTab } from "@faridalms/ui/system/record-page";
import type { ReactNode } from "react";

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
import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRightLeft, Pencil, Plus, QrCode, UserMinus } from "lucide-react";
import { useState } from "react";

import type { ClassPart } from "~/components/classes/slots";
import type { AreaView } from "~/components/files/AreaFiles";

import { AreaFiles } from "~/components/files/AreaFiles";
import {
  inLocale,
  useCapability,
  useCurrentUser,
} from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { classOptionsQuery, classRecordQuery } from "~/queries/classes";
import { formatDate } from "~/utils/datetime";

import type { ClassRecordData, RosterKeeping } from "./slots";

import { displayName, lastDay } from "../people/format";
import { Deferred } from "../people/record-parts";
import { ClassGroups } from "./ClassGroups";
import { AddStudentSheet, WithdrawSheet } from "./Enrolment";
import { classTitle, subjectName } from "./format";
import {
  classRecordParts,
  classRecordSections,
  classRecordTabs,
} from "./slots";

/** A class record's own tabs at their places; the modules on add theirs between them. */
const OWN_TABS = [
  { value: "overview", label: m.recordOverview, place: 10 },
  { value: "students", label: m.classesStudents, place: 20 },
  { value: "groups", label: m.classGroupsTab, place: 30 },
  { value: "files", label: m.filesTab, place: 70 },
] as const;
export type ClassTab = string;

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
  const canEnrol = data.access.enrol && keeping !== null;
  const badges = useCapability("badges:issue") && data.young;
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
          runs={data.runs}
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
            runs: data.runs,
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
            to: student.to,
          }}
          className={title}
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
  const found = parts.flatMap((each, index) => {
    const one = each.partOf(read[index]?.data, data, navigate);
    return one ? [one] : [];
  });
  // Each module answers for what it sets; the first to set a thing has it.
  const part: ClassPart | null =
    found.length === 0
      ? null
      : found.reduce<ClassPart>(
          (all, each) => ({
            ...each,
            ...all,
            facts: [...(all.facts ?? []), ...(each.facts ?? [])],
          }),
          {},
        );
  const sections = useSlot(classRecordSections).toSorted(
    (a, b) => (a.place ?? 0) - (b.place ?? 0),
  );
  const user = useCurrentUser();
  const added = useSlot(classRecordTabs).filter(
    (each) =>
      [each.capability]
        .flat()
        .some((capability) => user.capabilities.includes(capability)) &&
      (each.shows?.(data) ?? true),
  );
  const keepsClasses = useCapability("classes:manage");
  const teaches = useCapability("assignments:author");
  const youngClass = data.young;
  const title = classTitle(data);
  const room = options.rooms.find((row) => row.id === data.locationId);
  const facts: HeaderFact[] = [
    {
      label: m.classesRuns(),
      value: data.runs.to
        ? m.classesRunsBetween({
            from: formatDate(data.runs.from),
            to: formatDate(lastDay(data.runs.to)),
          })
        : m.classesRunsFrom({ from: formatDate(data.runs.from) }),
    },
    ...(part?.facts ?? []),
  ];
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
  const available = [...OWN_TABS, ...added]
    .filter(
      (each) =>
        (each.value !== "files" || data.access.files) &&
        (each.value !== "groups" || data.access.groups),
    )
    .toSorted((a, b) => a.place - b.place);
  const active = available.some((each) => each.value === tab)
    ? tab
    : "overview";
  const tabs: RecordTab<ClassTab>[] = available.map((each) => ({
    value: each.value,
    label: each.label(),
  }));
  const moduleTab = added.find((each) => each.value === active);
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
    ) : active === "groups" ? (
      <Deferred>
        <ClassGroups classId={data.id} />
      </Deferred>
    ) : moduleTab ? (
      <Deferred>
        <moduleTab.Tab classId={data.id} />
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
            {sections.map(({ key, Section }) => (
              <Section
                key={key}
                classId={data.id}
                young={youngClass}
                keeps={(teaches || keepsClasses) && data.access.staff}
                manages={data.access.manage}
              />
            ))}
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
          part?.status ??
          (data.runs.to !== null && data.runs.to <= data.today
            ? { label: m.classesEnded(), tone: "neutral" }
            : undefined)
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
                      search: { id: data.id },
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
