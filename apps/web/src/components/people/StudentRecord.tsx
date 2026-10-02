import type { ReactNode } from "react";

import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CameraOff,
  Contact,
  Copy,
  HeartPulse,
  Pencil,
  Plus,
  ShieldAlert,
  UserX,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { ActionItem } from "~/components/system/ActionMenu";
import type {
  HeaderFact,
  RecordAlert,
  RecordTab,
} from "~/components/system/RecordPage";

import { Value } from "~/components/app/primitives";
import { initialsOf } from "~/components/app/UserMenu";
import { StudentAttendance } from "~/components/attendance/StudentAttendance";
import { StudentConsents } from "~/components/consents/StudentConsents";
import { StudentCoursework } from "~/components/coursework/StudentCoursework";
import { ageOn, formatDate } from "~/components/family/format";
import { ActionMenu } from "~/components/system/ActionMenu";
import {
  Fact,
  Facts,
  phoneLink,
  RecordColumns,
  RecordEmpty,
  RecordHeader,
  RecordList,
  RecordSection,
  RecordTabs,
} from "~/components/system/RecordPage";
import { StatusText } from "~/components/system/status";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  peopleOptionsQuery,
  siblingsQuery,
  studentHistoryQuery,
  studentRecordQuery,
} from "~/queries/students";

import type { StudentSheet } from "./StudentSheets";

import { StudentClasses } from "../classes/StudentClasses";
import { ContactsSheet } from "./ContactsSheet";
import {
  displayName,
  labelOf,
  lastDay,
  otherName,
  STATUS_LABEL,
  STATUS_TONE,
} from "./format";
import { PhotoDialog } from "./PhotoDialog";
import { Deferred, Email, HistorySection, Phone } from "./record-parts";
import {
  CustodySection,
  DemographicsSection,
  HealthSection,
} from "./RecordSections";
import { SignInSection } from "./SignInSection";
import { StudentSheets, useEndLink } from "./StudentSheets";

export const STUDENT_TABS = [
  "overview",
  "details",
  "family",
  "enrollment",
  "coursework",
  "attendance",
  "health",
  "account",
  "history",
] as const;
export type StudentTab = (typeof STUDENT_TABS)[number];

const TAB_LABEL: Record<StudentTab, () => string> = {
  overview: m.recordOverview,
  details: m.studentTabDetails,
  family: m.studentTabFamily,
  enrollment: m.studentTabEnrollment,
  coursework: m.courseworkRecordTab,
  attendance: m.attendanceTitle,
  health: m.studentTabHealth,
  account: m.studentTabAccount,
  history: m.recordHistory,
};

export type StudentData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof studentRecordQuery>["queryFn"]>>
>;
type Guardian = NonNullable<StudentData["guardians"]>[number];

/** Which tabs this viewer may open. The route sends any other tab to Overview. */
export function studentTabsFor(
  access: StudentData["access"],
): Record<StudentTab, boolean> {
  return {
    overview: true,
    details: true,
    family: access.contacts,
    enrollment: true,
    coursework: access.coursework,
    attendance: access.attendance,
    health: access.health,
    account: access.manage,
    history: access.history,
  };
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
    grade: (id: string | null) => labelIn(options.grades, id),
    relation: (id: string) => labelIn(options.relations, id),
    sex: (id: string | null) => labelIn(options.sexes, id),
  };
}

function PersonalSection({
  data,
  onEdit,
}: {
  data: StudentData;
  onEdit?: () => void;
}) {
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

function PlacementSection({
  data,
  onEdit,
}: {
  data: StudentData;
  onEdit?: () => void;
}) {
  const labels = useLabels();
  const placement = data.placement;
  return (
    <RecordSection
      title={m.studentPlacement()}
      edit={
        onEdit ? { label: m.studentChangeGrade(), onClick: onEdit } : undefined
      }
    >
      <Facts>
        <Fact label={m.studentSchoolYear()} notApplicable={!placement}>
          {placement
            ? inLocale(placement.yearTitleEn, placement.yearTitleAr)
            : null}
        </Fact>
        <Fact label={m.studentGrade()} notApplicable={!placement}>
          {placement ? labels.grade(placement.gradeId) : null}
        </Fact>
        <Fact label={m.enrollmentStarts()} notApplicable={!placement}>
          {placement ? formatDate(placement.from) : null}
        </Fact>
      </Facts>
    </RecordSection>
  );
}

function GuardianItem({
  guardian,
  actions,
}: {
  guardian: Guardian;
  actions?: ReactNode;
}) {
  const labels = useLabels();
  const phone = guardian.contacts.find((contact) => contact.kind === "phone");
  const email = guardian.contacts.find((contact) => contact.kind === "email");
  const address = guardian.contacts.find(
    (contact) => contact.kind === "postal",
  );
  const flags: string[] = [];
  if (guardian.residence === "primary")
    flags.push(m.guardianResidencePrimary());
  if (guardian.residence === "secondary")
    flags.push(m.guardianResidenceSecondary());
  if (guardian.primaryContact) flags.push(m.recordPrimaryContact());
  if (guardian.legalGuardian) flags.push(m.guardianLegal());
  if (guardian.portalAccess) flags.push(m.guardianPortalAccess());
  if (guardian.pickup === "not_allowed")
    flags.push(m.guardianPickupNotAllowed());
  return (
    <li className="flex items-start gap-3 py-3">
      <span
        aria-hidden
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
      >
        {initialsOf(displayName(guardian))}
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <Link
          to="/people/$userId"
          params={{ userId: guardian.userId }}
          dir="auto"
          className={cn(
            "justify-self-start text-sm leading-5 font-medium hover:text-primary hover:underline",
            phoneLink,
          )}
        >
          {displayName(guardian)}
        </Link>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {[labels.relation(guardian.relationId), ...flags].join(" · ")}
        </p>
        <p className="flex flex-wrap items-center gap-x-4 text-[13px] leading-[18px]">
          <span>
            <span className="sr-only">{m.familyMobile()}: </span>
            <Phone value={phone?.normalized ?? phone?.value} />
          </span>
          {email ? <Email value={email.value} /> : null}
        </p>
        {address ? (
          <p className="text-[13px] leading-[18px]">
            <span className="sr-only">{m.addressTitle()}: </span>
            <bdi>{address.value}</bdi>
          </p>
        ) : null}
      </div>
      {actions}
    </li>
  );
}

function GuardiansSection({
  data,
  onAdd,
  itemActions,
}: {
  data: StudentData;
  onAdd?: () => void;
  itemActions?: (guardian: Guardian) => ReactNode;
}) {
  const guardians = data.guardians ?? [];
  return (
    <RecordSection
      title={m.studentGuardians()}
      action={
        onAdd ? (
          <Button
            type="button"
            variant="ghost"
            className="max-md:h-10"
            onClick={onAdd}
          >
            <Plus aria-hidden />
            {m.guardianAdd()}
          </Button>
        ) : undefined
      }
    >
      {guardians.length === 0 ? (
        <RecordEmpty>{m.studentNoGuardians()}</RecordEmpty>
      ) : (
        <RecordList>
          {guardians.map((guardian) => (
            <GuardianItem
              key={guardian.relationshipId}
              guardian={guardian}
              actions={itemActions?.(guardian)}
            />
          ))}
        </RecordList>
      )}
    </RecordSection>
  );
}

/** Students who share a parent or guardian with this one. */
function SiblingsSection({ studentId }: { studentId: string }) {
  const siblings = useSuspenseQuery(siblingsQuery(studentId)).data;
  return (
    <RecordSection title={m.siblingsTitle()} description={m.siblingsHint()}>
      {siblings.length === 0 ? (
        <RecordEmpty>{m.siblingsNone()}</RecordEmpty>
      ) : (
        <RecordList>
          {siblings.map((sibling) => (
            <li key={sibling.userId} className="flex items-center gap-3 py-3">
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium"
              >
                {initialsOf(displayName(sibling))}
              </span>
              <Link
                to="/students/$studentId"
                params={{ studentId: sibling.userId }}
                search={{}}
                dir="auto"
                className={cn(
                  "text-sm leading-5 font-medium hover:text-primary hover:underline",
                  phoneLink,
                )}
              >
                {displayName(sibling)}
              </Link>
            </li>
          ))}
        </RecordList>
      )}
    </RecordSection>
  );
}

function EnrollmentHistory({ data }: { data: StudentData }) {
  const labels = useLabels();
  return (
    <RecordSection
      title={m.enrollmentHistoryTitle()}
      description={m.studentPlacementHistoryHint()}
    >
      {data.placements.length === 0 ? (
        <RecordEmpty>{m.enrollmentHistoryEmpty()}</RecordEmpty>
      ) : (
        <RecordList>
          {data.placements.map((placement) => {
            const current =
              placement.from <= data.today && data.today < placement.to;
            return (
              <li
                key={placement.id}
                className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-3"
              >
                <div className="grid min-w-0 gap-0.5">
                  <span className="flex flex-wrap items-center gap-x-3 text-sm leading-5 font-medium">
                    <Value>{labels.grade(placement.gradeId)}</Value>
                    {current ? (
                      <StatusText tone="success">
                        {m.enrollmentCurrent()}
                      </StatusText>
                    ) : null}
                  </span>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {inLocale(placement.yearTitleEn, placement.yearTitleAr)}
                  </span>
                </div>
                <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm leading-5">
                  <div>
                    <dt className="text-[13px] leading-[18px] text-muted-foreground">
                      {m.enrollmentStarts()}
                    </dt>
                    <dd className="mt-0.5">{formatDate(placement.from)}</dd>
                  </div>
                  <div>
                    <dt className="text-[13px] leading-[18px] text-muted-foreground">
                      {m.enrollmentEnds()}
                    </dt>
                    <dd className="mt-0.5">
                      {formatDate(lastDay(placement.to))}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </RecordList>
      )}
    </RecordSection>
  );
}

function StudentHistory({ studentId }: { studentId: string }) {
  const entries = useSuspenseQuery(studentHistoryQuery(studentId)).data;
  return <HistorySection entries={entries} />;
}

export function StudentRecord({
  studentId,
  tab,
  onTab,
}: {
  studentId: string;
  tab: StudentTab;
  onTab: (tab: StudentTab) => void;
}) {
  const data = useSuspenseQuery(studentRecordQuery(studentId)).data;
  const queryClient = useQueryClient();
  const [photoOpen, setPhotoOpen] = useState(false);
  const [contacts, setContacts] = useState<{
    guardian: Guardian | null;
    open: boolean;
    key: number;
  }>({ guardian: null, open: false, key: 0 });
  const labels = useLabels();
  const endLink = useEndLink(studentId);
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<{
    sheet: StudentSheet;
    open: boolean;
    key: number;
  }>({
    sheet: { kind: "personal" },
    open: false,
    key: 0,
  });
  const open = (next: StudentSheet) => () =>
    setSheet((current) => ({ sheet: next, open: true, key: current.key + 1 }));
  const { access } = data;
  const name = displayName(data);
  const available = studentTabsFor(access);
  const tabs: RecordTab<StudentTab>[] = STUDENT_TABS.filter(
    (value) => available[value],
  ).map((value) => ({ value, label: TAB_LABEL[value]() }));
  const active = available[tab] ? tab : "overview";

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
  if (data.placement)
    facts.push({
      label: m.studentGrade(),
      value: labels.grade(data.placement.gradeId),
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
  if (data.custodyAlert)
    alerts.push({
      label: m.studentCustodyAlert(),
      tone: "warning",
      icon: ShieldAlert,
    });
  if (data.noPhotos)
    alerts.push({
      label: m.studentNoPhotos(),
      tone: "warning",
      icon: CameraOff,
    });
  if (access.contacts && (data.guardians ?? []).length === 0)
    alerts.push({
      label: m.studentAlertNoGuardian(),
      tone: "warning",
      icon: UserX,
    });

  const menu: ActionItem[] = [];
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

  const guardianActions = access.manage
    ? (guardian: Guardian) => (
        <GuardianMenu
          guardian={guardian}
          onEdit={open({ kind: "guardian", guardian })}
          onContacts={() =>
            setContacts((current) => ({
              guardian,
              open: true,
              key: current.key + 1,
            }))
          }
          onEnd={() => endLink(guardian, name)}
        />
      )
    : undefined;

  let body: ReactNode;
  switch (active) {
    case "overview":
      body = (
        <RecordColumns
          main={
            <>
              <PlacementSection data={data} />
              {access.contacts ? <GuardiansSection data={data} /> : null}
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
                onEdit={access.manage ? open({ kind: "personal" }) : undefined}
              />
              {access.demographics ? (
                <Deferred>
                  <DemographicsSection studentId={studentId} />
                </Deferred>
              ) : null}
            </>
          }
        />
      );
      break;
    case "family":
      body = (
        <RecordColumns
          main={
            <>
              <GuardiansSection
                data={data}
                onAdd={
                  access.manage ? open({ kind: "add-guardian" }) : undefined
                }
                itemActions={guardianActions}
              />
              {access.custody ? (
                <Deferred>
                  <CustodySection studentId={studentId} />
                </Deferred>
              ) : null}
              {access.consents ? (
                <Deferred>
                  <StudentConsents studentId={studentId} />
                </Deferred>
              ) : null}
              <Deferred>
                <SiblingsSection studentId={studentId} />
              </Deferred>
            </>
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
              <EnrollmentHistory data={data} />
            </>
          }
          aside={
            <PlacementSection
              data={data}
              onEdit={
                access.manage && data.workingYearId
                  ? open({ kind: "grade" })
                  : undefined
              }
            />
          }
        />
      );
      break;
    case "coursework":
      body = (
        <Deferred>
          <StudentCoursework studentId={studentId} />
        </Deferred>
      );
      break;
    case "attendance":
      body = (
        <Deferred>
          <StudentAttendance studentId={studentId} />
        </Deferred>
      );
      break;
    case "health":
      body = (
        <RecordColumns
          main={
            <Deferred>
              <HealthSection studentId={studentId} />
            </Deferred>
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
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <RecordHeader
        title={name}
        initials={initialsOf(name)}
        photoUrl={data.photoFileId ? `/files/${data.photoFileId}` : null}
        onPhoto={access.manage ? () => setPhotoOpen(true) : undefined}
        facts={facts}
        status={{
          label: STATUS_LABEL[data.status](),
          tone: STATUS_TONE[data.status],
        }}
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
      {access.manage && contacts.guardian ? (
        <ContactsSheet
          key={contacts.key}
          userId={contacts.guardian.userId}
          name={displayName(contacts.guardian)}
          contacts={contacts.guardian.contacts}
          open={contacts.open}
          onClose={() =>
            setContacts((current) => ({ ...current, open: false }))
          }
        />
      ) : null}
      {access.manage ? (
        <StudentSheets
          key={sheet.key}
          student={data}
          sheet={sheet.sheet}
          open={sheet.open}
          onClose={() => setSheet((current) => ({ ...current, open: false }))}
        />
      ) : null}
    </div>
  );
}

function GuardianMenu({
  guardian,
  onEdit,
  onContacts,
  onEnd,
}: {
  guardian: Guardian;
  onEdit: () => void;
  onContacts: () => void;
  onEnd: () => Promise<void>;
}) {
  const name = displayName(guardian);
  return (
    <ActionMenu
      label={m.guardianActions({ name })}
      actions={[
        { label: m.guardianEditLink(), icon: Pencil, onSelect: onEdit },
        { label: m.contactsEdit(), icon: Contact, onSelect: onContacts },
        {
          label: m.guardianEndLink(),
          destructive: true,
          confirm: {
            title: m.guardianEndLinkTitle({ name }),
            body: m.guardianEndLinkBody({ name }),
            label: m.guardianEndLink(),
          },
          onSelect: onEnd,
        },
      ]}
    />
  );
}
