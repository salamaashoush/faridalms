import type { ActionItem } from "@faridalms/ui/system/action-menu";
import type {
  HeaderFact,
  RecordAlert,
  RecordTab,
} from "@faridalms/ui/system/record-page";
import type { ReactNode } from "react";

import { ageOn } from "@faridalms/domain/school";
import { initialsOf } from "@faridalms/ui/system/app-shell";
import { Page } from "@faridalms/ui/system/page";
import {
  Fact,
  Facts,
  RecordColumns,
  RecordHeader,
  RecordSection,
  RecordTabs,
} from "@faridalms/ui/system/record-page";
import {
  useQueryClient,
  useSuspenseInfiniteQuery,
  useSuspenseQueries,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  CameraOff,
  Copy,
  HeartPulse,
  LogOut,
  MessageSquare,
  Pencil,
  Undo2,
} from "lucide-react";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import { StudentConsents } from "~/components/consents/StudentConsents";
import { NewMessage } from "~/components/messages/NewMessage";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import {
  peopleOptionsQuery,
  studentHistoryQuery,
  studentRecordQuery,
} from "~/queries/students";
import { cancelLeaving } from "~/server/students";
import { formatDate } from "~/utils/datetime";
import { useWords } from "~/utils/words";

import type { StudentRecordTab } from "./slots";

import { groupWords } from "../classes/slots";
import { GroupTeachers, StudentClasses } from "../classes/StudentClasses";
import { EmergencyContactsSection } from "./EmergencyContacts";
import {
  displayName,
  labelOf,
  lastDay,
  otherName,
  STATUS_LABEL,
  STATUS_TONE,
} from "./format";
import { IdentitySection } from "./IdentitySection";
import { LeaveSchool } from "./LeaveSchool";
import { PhotoDialog } from "./PhotoDialog";
import { Deferred, HistoryFeed } from "./record-parts";
import { SignInSection } from "./SignInSection";
import {
  studentClassesParts,
  studentFamilyParts,
  studentOverviewParts,
  studentRecordParts,
  studentDetailsSections,
  studentRecordTabs,
} from "./slots";
import { StudentSheets } from "./StudentSheets";

/** A student record's own tabs at their places; the modules on add theirs between them. */
const OWN_TABS = [
  { value: "overview", label: m.recordOverview, place: 10 },
  { value: "details", label: m.studentTabDetails, place: 20 },
  { value: "consents", label: m.consentsTitle, place: 40 },
  { value: "enrollment", label: m.studentTabEnrollment, place: 50 },
  { value: "account", label: m.studentTabAccount, place: 110 },
  { value: "history", label: m.recordHistory, place: 120 },
] as const;
export type StudentTab = string;

export type StudentData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof studentRecordQuery>["queryFn"]>>
>;

/** Whether this viewer may open one of the record's own tabs. */
export function ownTabOpens(
  access: StudentData["access"],
  tab: string,
): boolean {
  switch (tab) {
    case "overview":
    case "details":
    case "enrollment":
      return true;
    case "consents":
      return access.consents;
    case "account":
      return access.manage;
    case "history":
      return access.history;
    default:
      return false;
  }
}

/** Whether this viewer may open a tab, the record's own or one a module adds. */
export function studentTabOpens(
  access: StudentData["access"],
  tab: string,
  added: readonly StudentRecordTab[],
): boolean {
  return (
    ownTabOpens(access, tab) ||
    added.some((each) => each.value === tab && each.shows(access))
  );
}

function formatAge(age: { years: number; months: number }) {
  const years = m.studentAgeYears({ count: age.years, value: age.years });
  if (age.years >= 5 || age.months === 0) return years;
  return m.studentAgeValue({
    years,
    months: m.studentAgeMonths({ count: age.months, value: age.months }),
  });
}

function labelIn(
  list: { id: string; labelEn: string | null; labelAr: string | null }[],
  id: string | null,
) {
  return labelOf(list.find((row) => row.id === id) ?? null);
}

function useLabels() {
  const options = useSuspenseQuery(peopleOptionsQuery).data;
  return {
    options,
    sex: (id: string | null) => labelIn(options.sexes, id),
  };
}

interface PersonalSectionProps {
  data: StudentData;
  onEdit?: () => void;
}

function PersonalSection({ data, onEdit }: PersonalSectionProps) {
  const labels = useLabels();
  const age = ageOn(data.birthDate, data.today);
  return (
    <RecordSection
      title={m.studentPersonalDetails()}
      edit={
        onEdit ? { label: m.studentEditPersonal(), onClick: onEdit } : undefined
      }
    >
      <Facts>
        <Fact label={m.peopleNameArabic()}>
          {data.fullNameAr ? <span dir="rtl">{data.fullNameAr}</span> : null}
        </Fact>
        <Fact label={m.peopleNameEnglish()}>
          {data.fullNameEn ? <span dir="ltr">{data.fullNameEn}</span> : null}
        </Fact>
        <Fact label={m.peoplePreferredName()}>
          {data.preferredGivenName ? (
            <span dir="auto">{data.preferredGivenName}</span>
          ) : null}
        </Fact>
        <Fact label={m.familyReference()}>
          {data.reference ? <span dir="ltr">{data.reference}</span> : null}
        </Fact>
        <Fact label={m.studentBirthdate()}>
          {data.birthDate ? formatDate(data.birthDate) : null}
        </Fact>
        <Fact label={m.studentAge()}>{age ? formatAge(age) : null}</Fact>
        <Fact label={m.peopleSex()}>{labels.sex(data.sexId)}</Fact>
      </Facts>
    </RecordSection>
  );
}

interface DepartureSectionProps {
  data: StudentData;
  /** What modules recorded of the departure. */
  facts: readonly { label: string; value: ReactNode }[];
}

/**
 * How a student left: their last day, what modules recorded of it, and the
 * day they and their family stop reading the record.
 */
function DepartureSection({ data, facts }: DepartureSectionProps) {
  const departure = data.departure;
  if (!departure) return null;
  const reads = departure.accessEndsOn > departure.leftOn;
  return (
    <RecordSection title={m.leaveSectionTitle()}>
      <Facts>
        <Fact label={m.leaveLastDay()}>
          {formatDate(lastDay(departure.leftOn))}
        </Fact>
        {facts.map((fact) => (
          <Fact key={fact.label} label={fact.label}>
            {fact.value}
          </Fact>
        ))}
        <Fact label={m.leaveAccessUntil()} notApplicable={!reads}>
          {reads ? formatDate(lastDay(departure.accessEndsOn)) : null}
        </Fact>
      </Facts>
    </RecordSection>
  );
}

interface StudentHistoryProps {
  studentId: string;
}

function StudentHistory({ studentId }: StudentHistoryProps) {
  const feed = useSuspenseInfiniteQuery(studentHistoryQuery(studentId));
  return <HistoryFeed feed={feed} />;
}

export interface StudentRecordProps {
  studentId: string;
  tab: StudentTab;
  onTab: (tab: StudentTab) => void;
  /** Opens a conversation begun from here with those who act for the student. */
  onConversation?: (threadId: string) => void;
}

export function StudentRecord({
  studentId,
  tab,
  onTab,
  onConversation,
}: StudentRecordProps) {
  const data = useSuspenseQuery(studentRecordQuery(studentId)).data;
  const queryClient = useQueryClient();
  const [photoOpen, setPhotoOpen] = useState(false);
  const [writing, setWriting] = useState(false);
  const [moving, setMoving] = useState(false);
  const words = useSlot(groupWords);
  const inWords = useWords();
  const mover = useSlot(studentClassesParts)[0]?.move;
  const [leaving, setLeaving] = useState(false);
  const family = useSlot(studentFamilyParts)[0];
  const addedTabs = useSlot(studentRecordTabs);
  const detailsSections = useSlot(studentDetailsSections).toSorted(
    (a, b) => a.place - b.place,
  );
  const overviewParts = useSlot(studentOverviewParts)
    .filter((each) => each.shows(data.access))
    .toSorted((a, b) => a.place - b.place);
  const recordParts = useSlot(studentRecordParts);
  const partReads = useSuspenseQueries({
    queries: recordParts.map((part) => part.query(studentId)),
  });
  const parts = recordParts.flatMap((part, index) => {
    const found = part.partOf(partReads[index]?.data);
    return found ? [found] : [];
  });
  const partProps = {
    student: { id: studentId, name: displayName(data) },
    today: data.today,
    manage: data.access.manage,
  };
  const navigate = useNavigate();
  const [sheet, setSheet] = useState({ open: false, key: 0 });
  const { access } = data;
  const name = displayName(data);
  const listed = [
    ...OWN_TABS.filter((each) => ownTabOpens(access, each.value)),
    ...(family && access.contacts
      ? [{ value: "family", label: family.label, place: 30 }]
      : []),
    ...addedTabs.filter((each) => each.shows(access)),
  ].toSorted((a, b) => a.place - b.place);
  const tabs: RecordTab<StudentTab>[] = listed.map((each) => ({
    value: each.value,
    label: each.label(),
  }));
  const active = listed.some((each) => each.value === tab) ? tab : "overview";
  const moduleTab = addedTabs.find((each) => each.value === active);

  const facts: HeaderFact[] = [];
  const second = otherName(data);
  if (second)
    facts.push({
      label: m.peopleOtherName(),
      value: <span dir="auto">{second}</span>,
    });
  if (data.reference)
    facts.push({
      label: m.familyReference(),
      value: <span dir="ltr">{data.reference}</span>,
    });
  for (const part of parts) facts.push(...part.facts);
  const departureFacts = parts.flatMap((part) => part.departure);
  const groupTeacher = words[0]?.teacher() ?? m.classesClassTeacher();
  if (data.group && data.group.teachers.length > 0)
    facts.push({
      label: groupTeacher,
      value: (
        <>
          <span aria-hidden>{groupTeacher}: </span>
          <GroupTeachers teachers={data.group.teachers} />
        </>
      ),
    });
  const age = ageOn(data.birthDate, data.today);
  if (age) facts.push({ label: m.studentAge(), value: formatAge(age) });

  const alerts: RecordAlert[] = [];
  if (data.medicalAlert)
    alerts.push({
      label: m.studentMedicalAlert(),
      tone: "danger",
      icon: HeartPulse,
    });
  for (const key of data.alerts) {
    const flag = family?.alerts[key];
    if (flag)
      alerts.push({ label: flag.label(), tone: flag.tone, icon: flag.icon });
  }
  if (data.noPhotos)
    alerts.push({
      label: m.studentNoPhotos(),
      tone: "warning",
      icon: CameraOff,
    });

  const menu: ActionItem[] = [];
  if (access.manage && mover)
    menu.push({
      label: mover.label(),
      icon: ArrowRightLeft,
      onSelect: () => setMoving(true),
    });
  if (family && access.message && onConversation)
    menu.push({
      label: family.messageLabel(),
      icon: MessageSquare,
      onSelect: () => setWriting(true),
    });
  const gone = data.departure !== null;
  if (access.manage && !gone && data.status === "enrolled")
    menu.push({
      label: m.studentLeave(),
      icon: LogOut,
      onSelect: () => setLeaving(true),
    });
  if (access.manage && gone)
    menu.push({
      label: m.leaveUndo(),
      icon: Undo2,
      confirm: {
        title: m.leaveUndoTitle({ name }),
        body: inWords(m.leaveUndoBodyCore)(),
        label: m.leaveUndo(),
      },
      onSelect: async () => {
        await cancelLeaving({ data: { studentId } });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["people"] }),
          queryClient.invalidateQueries({ queryKey: ["classes"] }),
        ]);
        toast.success(m.leaveUndone({ name }));
      },
    });
  if (data.reference)
    menu.push({
      label: m.studentsCopyReference(),
      icon: Copy,
      onSelect: async () => {
        try {
          await navigator.clipboard.writeText(data.reference ?? "");
        } catch {
          throw new Error(m.studentsCopyFailed());
        }
        toast.success(m.studentsReferenceCopied());
      },
    });

  let body: ReactNode;
  switch (active) {
    case "overview":
      body = (
        <RecordColumns
          main={
            <>
              {overviewParts.map(({ key, Part }) => (
                <Deferred key={key}>
                  <Part
                    studentId={studentId}
                    today={data.today}
                    onTab={onTab}
                  />
                </Deferred>
              ))}
              <DepartureSection data={data} facts={departureFacts} />
              {gone
                ? null
                : parts.map((part, index) => (
                    <part.Overview key={index} {...partProps} />
                  ))}
              {family && access.contacts ? (
                <Deferred>
                  <family.Overview
                    studentId={studentId}
                    manage={access.manage}
                  />
                </Deferred>
              ) : null}
            </>
          }
          aside={<PersonalSection data={data} />}
        />
      );
      break;
    case "details":
      body = (
        <RecordColumns
          main={
            <>
              <PersonalSection
                data={data}
                onEdit={
                  access.manage
                    ? () =>
                        setSheet((current) => ({
                          open: true,
                          key: current.key + 1,
                        }))
                    : undefined
                }
              />
              {access.contacts ? (
                <Deferred>
                  <EmergencyContactsSection personId={studentId} />
                </Deferred>
              ) : null}
              {access.identifiers ? (
                <Deferred>
                  <IdentitySection studentId={studentId} />
                </Deferred>
              ) : null}
              {detailsSections
                .filter((section) => section.shows(access))
                .map(({ key, Section }) => (
                  <Deferred key={key}>
                    <Section studentId={studentId} />
                  </Deferred>
                ))}
            </>
          }
        />
      );
      break;
    case "family":
      body = family ? (
        <Deferred>
          <family.Tab studentId={studentId} name={name} />
        </Deferred>
      ) : null;
      break;
    case "consents":
      body = (
        <RecordColumns
          main={
            <Deferred>
              <StudentConsents studentId={studentId} />
            </Deferred>
          }
        />
      );
      break;
    case "enrollment":
      body = (
        <RecordColumns
          main={
            <>
              <Deferred>
                <StudentClasses
                  student={{ id: studentId, name }}
                  today={data.today}
                  manage={access.manage}
                />
              </Deferred>
              {parts.map((part, index) => (
                <part.Enrolment key={index} {...partProps} />
              ))}
            </>
          }
          aside={
            <>
              <DepartureSection data={data} facts={departureFacts} />
              {parts.map((part, index) => (
                <part.EnrolmentAside key={index} {...partProps} />
              ))}
            </>
          }
        />
      );
      break;
    case "account":
      body = (
        <RecordColumns
          main={
            <SignInSection
              userId={studentId}
              name={name}
              account={data.account}
              manage={access.manage}
              description={m.studentAccountHintCell()}
              none={m.studentAccountNone()}
            />
          }
        />
      );
      break;
    case "history":
      body = (
        <RecordColumns
          main={
            <Deferred>
              <StudentHistory studentId={studentId} />
            </Deferred>
          }
        />
      );
      break;
    default:
      body = moduleTab ? (
        moduleTab.columns ? (
          <RecordColumns
            main={
              <Deferred>
                <moduleTab.Tab studentId={studentId} />
              </Deferred>
            }
          />
        ) : (
          <Deferred>
            <moduleTab.Tab studentId={studentId} />
          </Deferred>
        )
      ) : null;
  }

  return (
    <Page width="record">
      <RecordHeader
        title={name}
        initials={initialsOf(name)}
        photoUrl={data.photoFileId ? `/files/${data.photoFileId}` : null}
        onPhoto={access.manage ? () => setPhotoOpen(true) : undefined}
        facts={facts}
        status={
          parts.find((part) => part.status)?.status ??
          (data.status
            ? {
                label: STATUS_LABEL[data.status](),
                tone: STATUS_TONE[data.status],
              }
            : undefined)
        }
        alerts={alerts}
        action={
          access.manage
            ? {
                label: m.managementEditStudent(),
                icon: Pencil,
                onClick: () =>
                  void navigate({
                    to: "/student-editor",
                    search: { id: studentId, from: "record" },
                  }),
              }
            : undefined
        }
        menu={menu}
      />
      <RecordTabs
        label={m.studentRecordSections()}
        tabs={tabs}
        value={active}
        onChange={onTab}
      >
        {body}
      </RecordTabs>
      {moving && mover ? (
        <Suspense fallback={null}>
          <mover.One
            student={{ id: studentId, name }}
            today={data.today}
            onClose={() => setMoving(false)}
          />
        </Suspense>
      ) : null}
      {leaving ? (
        <Suspense fallback={null}>
          <LeaveSchool
            students={[{ id: studentId, name }]}
            from={data.roles[0]?.from}
            today={data.today}
            onClose={() => setLeaving(false)}
          />
        </Suspense>
      ) : null}
      {writing && onConversation ? (
        <NewMessage
          canStartFamily
          about={[{ id: studentId, name }]}
          onClose={() => setWriting(false)}
          onStarted={(thread) => {
            if (thread) onConversation(thread);
          }}
        />
      ) : null}
      {access.manage ? (
        <PhotoDialog
          personId={studentId}
          name={name}
          photoUrl={data.photoFileId ? `/files/${data.photoFileId}` : null}
          open={photoOpen}
          onOpenChange={setPhotoOpen}
          onSaved={() =>
            void queryClient.invalidateQueries({ queryKey: ["people"] })
          }
        />
      ) : null}
      {access.manage ? (
        <StudentSheets
          key={sheet.key}
          student={data}
          open={sheet.open}
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
        />
      ) : null}
    </Page>
  );
}
