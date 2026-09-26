import type { ReactNode } from "react";

import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  Copy,
  HeartPulse,
  MessageSquare,
  PhoneOff,
  Unlink,
  UserMinus,
  UserX,
} from "lucide-react";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import type { ActionItem } from "~/components/system/ActionMenu";
import type {
  HeaderFact,
  RecordAlert,
  RecordTab,
} from "~/components/system/RecordPage";

import { ButtonLink } from "~/components/app/ButtonLink";
import { Value } from "~/components/app/primitives";
import { initialsOf } from "~/components/app/UserMenu";
import { ageOn, formatDate } from "~/components/family/format";
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
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Skeleton } from "~/components/ui/skeleton";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { studentManagementQuery, studentQuery } from "~/queries/school";
import { cn } from "~/utils/cn";
import { formatNumber } from "~/utils/datetime";

import type { StudentForm } from "./StudentForms";

import { RELATION_LABEL } from "./relations";
import {
  prepareStudentSheet,
  StudentEditSheet,
  useRemoveFromClass,
  useUnlinkAccount,
} from "./StudentForms";
import {
  AssignmentsSection,
  AttendanceOverview,
  ResultsSection,
  StudentAttendance,
  TodayForClass,
  TodayForStudent,
  TodayWithoutClass,
} from "./StudentSections";

export const STUDENT_TABS = [
  "overview",
  "details",
  "family",
  "medical",
  "enrollment",
  "attendance",
  "coursework",
  "account",
] as const;
export type StudentTab = (typeof STUDENT_TABS)[number];

const TAB_LABEL: Record<StudentTab, () => string> = {
  overview: m.recordOverview,
  details: m.studentTabDetails,
  family: m.studentTabFamily,
  medical: m.studentTabMedical,
  enrollment: m.studentTabEnrollment,
  attendance: m.attendanceTitle,
  coursework: m.studentTabCoursework,
  account: m.studentTabAccount,
};

type Data = ReturnType<typeof useStudent>;
type Profile = Data["profile"];
type Access = Data["access"];

/** Which tabs this viewer may open. The route sends any other tab to Overview. */
export function studentTabsFor(access: Access): Record<StudentTab, boolean> {
  return {
    overview: true,
    details: true,
    family: access.contacts,
    medical: access.medical,
    enrollment: true,
    attendance: access.attendance,
    coursework: access.coursework || access.grades,
    account: access.manage,
  };
}

/**
 * Where today's lessons come from, or null when this viewer cannot see them.
 * A teacher's timetable request answers with the teacher's own lessons, so a
 * teacher reads the class instead, and only a class they can open.
 */
export function todaySource(
  user: { workspace: string; capabilities: readonly string[] },
  profile: Profile,
): { classId: string } | "student" | "no-class" | null {
  if (!profile.classId) return "no-class";
  if (user.workspace === "teach") {
    const classId = profile.classId;
    return profile.enrollmentHistory.some(
      (entry) => entry.classId === classId && entry.canOpenClass,
    )
      ? { classId }
      : null;
  }
  return user.capabilities.includes("timetable:read") ? "student" : null;
}

function formatAge(age: { years: number; months: number }) {
  const years = m.studentAgeYears({
    count: age.years,
    value: formatNumber(age.years),
  });
  const months = m.studentAgeMonths({
    count: age.months,
    value: formatNumber(age.months),
  });
  if (age.years === 0) return months;
  if (age.months === 0) return years;
  return m.studentAgeValue({ years, months });
}

function useStudent(studentId: string) {
  return useSuspenseQuery(studentQuery({ studentId })).data;
}

function SectionFallback() {
  return <Skeleton className="h-40 w-full rounded-lg" />;
}

function Deferred({ children }: { children: ReactNode }) {
  return <Suspense fallback={<SectionFallback />}>{children}</Suspense>;
}

function ClassLink({
  profile,
  className,
}: {
  profile: Profile;
  className?: string;
}) {
  return profile.classId ? (
    <Link
      to="/classes/$classId"
      params={{ classId: profile.classId }}
      search={{}}
      dir="auto"
      className={cn("font-medium text-primary hover:underline", className)}
    >
      {profile.className}
    </Link>
  ) : null;
}

function Phone({ value }: { value: string | null | undefined }) {
  return value ? (
    <a
      href={`tel:${value}`}
      dir="ltr"
      className={cn("text-primary hover:underline", phoneLink)}
    >
      {value}
    </a>
  ) : null;
}

function Email({ value }: { value: string | null | undefined }) {
  return value ? (
    <a
      href={`mailto:${value}`}
      className={cn("break-all text-primary hover:underline", phoneLink)}
    >
      {value}
    </a>
  ) : null;
}

type MessagesPath = "/admin/messages" | "/teach/messages";

/**
 * Where this viewer writes to a guardian, or null when they cannot. Only
 * staff may address parents; a parent's composer offers teachers and the
 * administration alone.
 */
export function guardianMessagesPath(user: {
  workspace: string;
  capabilities: readonly string[];
}): MessagesPath | null {
  if (!user.capabilities.includes("messages:send")) return null;
  if (user.workspace === "admin") return "/admin/messages";
  if (user.workspace === "teach") return "/teach/messages";
  return null;
}

function currentSince(profile: Profile) {
  const current = profile.enrollmentHistory.find(
    (entry) => entry.classId === profile.classId && entry.until === null,
  );
  return current ? formatDate(current.since) : null;
}

function ClassSection({ profile }: { profile: Profile }) {
  return (
    <RecordSection title={m.studentCurrentClass()}>
      <Facts>
        <Fact label={m.studentClass()} notApplicable={!profile.classId}>
          <ClassLink profile={profile} className={phoneLink} />
        </Fact>
        <Fact label={m.studentGrade()} notApplicable={!profile.classId}>
          {profile.grade}
        </Fact>
        <Fact label={m.studentHomeroom()} notApplicable={!profile.classId}>
          {profile.homeroomTeacher}
        </Fact>
        <Fact label={m.enrollmentStarts()} notApplicable={!profile.classId}>
          {currentSince(profile)}
        </Fact>
      </Facts>
    </RecordSection>
  );
}

function PersonalSection({
  data,
  onEdit,
}: {
  data: Data;
  onEdit?: () => void;
}) {
  const { profile, today } = data;
  const age = ageOn(profile.birthdate, today);
  return (
    <RecordSection
      title={m.studentPersonalDetails()}
      edit={
        onEdit ? { label: m.studentEditPersonal(), onClick: onEdit } : undefined
      }
    >
      <Facts>
        <Fact label={m.managementFirstName()}>
          <span dir="auto">{profile.firstName}</span>
        </Fact>
        <Fact label={m.managementLastName()}>
          <span dir="auto">{profile.lastName}</span>
        </Fact>
        <Fact label={m.familyReference()}>
          <span dir="ltr">{profile.reference}</span>
        </Fact>
        <Fact label={m.studentBirthdate()}>
          {profile.birthdate ? formatDate(profile.birthdate) : null}
        </Fact>
        <Fact label={m.studentAge()}>{age ? formatAge(age) : null}</Fact>
      </Facts>
    </RecordSection>
  );
}

function ContactSection({ profile }: { profile: Profile }) {
  const contact = profile.contact;
  return (
    <RecordSection title={m.studentContact()}>
      <Facts>
        <Fact label={m.studentEmail()}>
          <Email value={contact?.email} />
        </Fact>
        <Fact label={m.studentContactMobile()}>
          <Phone value={contact?.contactMobile} />
        </Fact>
        <Fact label={m.studentFatherMobile()}>
          <Phone value={contact?.fatherMobile} />
        </Fact>
        <Fact label={m.studentMotherMobile()}>
          <Phone value={contact?.motherMobile} />
        </Fact>
        <Fact label={m.studentFatherAddress()} wide>
          {contact?.fatherAddress}
        </Fact>
        <Fact label={m.studentMotherAddress()} wide>
          {contact?.motherAddress}
        </Fact>
      </Facts>
    </RecordSection>
  );
}

function GuardiansSection({
  profile,
  messagesPath,
  onEdit,
}: {
  profile: Profile;
  messagesPath: MessagesPath | null;
  onEdit?: () => void;
}) {
  return (
    <RecordSection
      title={m.studentGuardians()}
      edit={
        onEdit
          ? { label: m.studentEditGuardians(), onClick: onEdit }
          : undefined
      }
    >
      {profile.guardians.length === 0 ? (
        <RecordEmpty>{m.studentNoGuardians()}</RecordEmpty>
      ) : (
        <RecordList>
          {profile.guardians.map((guardian) => (
            <li key={guardian.id} className="flex items-start gap-3 py-3">
              <Avatar className="mt-0.5 size-8 shrink-0">
                <AvatarFallback className="text-xs font-medium">
                  {initialsOf(guardian.name)}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 gap-0.5">
                <Link
                  to="/people/$userId"
                  params={{ userId: guardian.id }}
                  dir="auto"
                  className={cn(
                    "justify-self-start text-sm leading-5 font-medium hover:text-primary hover:underline",
                    phoneLink,
                  )}
                >
                  {guardian.name}
                </Link>
                <p className="text-[13px] leading-[18px] text-muted-foreground">
                  {RELATION_LABEL[guardian.relation]()}
                  {guardian.isPrimary ? ` · ${m.recordPrimaryContact()}` : null}
                </p>
                {guardian.mobile || messagesPath ? (
                  <p className="flex flex-wrap items-center gap-x-4 text-[13px] leading-[18px]">
                    {guardian.mobile ? (
                      <span>
                        <span className="sr-only">{m.familyMobile()}: </span>
                        <Phone value={guardian.mobile} />
                      </span>
                    ) : null}
                    {messagesPath ? (
                      <Link
                        to={messagesPath}
                        search={{
                          compose: true,
                          to: guardian.id,
                          about: profile.id,
                        }}
                        aria-label={m.studentMessageGuardian({
                          name: guardian.name,
                        })}
                        className={cn(
                          "text-primary hover:underline",
                          phoneLink,
                        )}
                      >
                        {m.studentMessage()}
                      </Link>
                    ) : null}
                  </p>
                ) : null}
                <p className="text-[13px] leading-[18px]">
                  <Email value={guardian.email} />
                </p>
              </div>
            </li>
          ))}
        </RecordList>
      )}
    </RecordSection>
  );
}

function EmergencySection({ profile }: { profile: Profile }) {
  return (
    <RecordSection title={m.studentEmergency()}>
      {profile.emergencyContacts.length === 0 ? (
        <RecordEmpty>{m.familyNoEmergencyContacts()}</RecordEmpty>
      ) : (
        <RecordList>
          {profile.emergencyContacts.map((entry) => (
            <li key={entry.id} className="grid gap-0.5 py-3">
              <span className="text-sm leading-5 font-medium">
                <span dir="auto">{entry.name}</span>
              </span>
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                <span dir="auto">{entry.relation}</span>
              </span>
              <span className="text-[13px] leading-[18px]">
                <span className="sr-only">{m.familyMobile()}: </span>
                <Phone value={entry.mobile} />
              </span>
            </li>
          ))}
        </RecordList>
      )}
    </RecordSection>
  );
}

function MedicalSection({ profile }: { profile: Profile }) {
  const medical = profile.medical;
  return (
    <RecordSection title={m.studentMedical()}>
      <Facts>
        <Fact label={m.studentBloodGroup()}>
          {medical?.bloodGroup ? (
            <span dir="ltr">{medical.bloodGroup}</span>
          ) : null}
        </Fact>
        <Fact label={m.studentMedicineAgreement()}>
          {medical
            ? medical.medicineAgreement
              ? m.studentMedicineAgreed()
              : m.studentMedicineNotAgreed()
            : null}
        </Fact>
        <Fact label={m.studentAllergies()} wide>
          {medical?.allergies}
        </Fact>
        <Fact label={m.studentInjuries()} wide>
          {medical?.pastInjuries}
        </Fact>
        <Fact label={m.studentSurgeries()} wide>
          {medical?.surgeries}
        </Fact>
      </Facts>
    </RecordSection>
  );
}

function MedicalReportsSection({ profile }: { profile: Profile }) {
  return (
    <RecordSection title={m.studentMedicalReports()}>
      {profile.medicalReports.length === 0 ? (
        <RecordEmpty>{m.familyNoMedicalReports()}</RecordEmpty>
      ) : (
        <RecordList>
          {profile.medicalReports.map((report) => (
            <li key={report.id} className="grid gap-0.5 py-3">
              <a
                href={report.url}
                target="_blank"
                rel="noreferrer"
                dir="auto"
                className={cn(
                  "justify-self-start text-sm leading-5 font-medium text-primary hover:underline",
                  phoneLink,
                )}
              >
                {report.name}
                <span className="sr-only"> ({m.studentOpensInNewTab()})</span>
              </a>
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {m.familyUploadedOn()} {formatDate(report.uploadedOn)}
              </span>
            </li>
          ))}
        </RecordList>
      )}
    </RecordSection>
  );
}

function MedicalSummary({ profile }: { profile: Profile }) {
  return (
    <RecordSection title={m.studentMedical()}>
      <Facts>
        <Fact label={m.studentAllergies()}>{profile.medical?.allergies}</Fact>
        <Fact label={m.studentBloodGroup()}>
          {profile.medical?.bloodGroup ? (
            <span dir="ltr">{profile.medical.bloodGroup}</span>
          ) : null}
        </Fact>
      </Facts>
    </RecordSection>
  );
}

function HistorySection({
  profile,
  today,
}: {
  profile: Profile;
  today: string;
}) {
  return (
    <RecordSection
      title={m.enrollmentHistoryTitle()}
      description={m.enrollmentHistoryHint()}
    >
      {profile.enrollmentHistory.length === 0 ? (
        <RecordEmpty>{m.enrollmentHistoryEmpty()}</RecordEmpty>
      ) : (
        <RecordList>
          {profile.enrollmentHistory.map((enrollment) => (
            <li
              key={enrollment.id}
              className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-3"
            >
              <div className="grid min-w-0 gap-0.5">
                <span className="flex flex-wrap items-center gap-x-3 text-sm leading-5 font-medium">
                  {enrollment.canOpenClass && enrollment.className ? (
                    <Link
                      to="/classes/$classId"
                      params={{ classId: enrollment.classId }}
                      search={{}}
                      dir="auto"
                      className={cn("text-primary hover:underline", phoneLink)}
                    >
                      {enrollment.className}
                    </Link>
                  ) : (
                    <Value>
                      {enrollment.className ? (
                        <span dir="auto">{enrollment.className}</span>
                      ) : null}
                    </Value>
                  )}
                  {enrollment.until === null && enrollment.since <= today ? (
                    <StatusText tone="success">
                      {m.enrollmentCurrent()}
                    </StatusText>
                  ) : null}
                </span>
                <span className="text-[13px] leading-[18px] text-muted-foreground">
                  <Value>{enrollment.schoolYear}</Value>
                </span>
              </div>
              <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm leading-5">
                <div>
                  <dt className="text-[13px] leading-[18px] text-muted-foreground">
                    {m.enrollmentStarts()}
                  </dt>
                  <dd className="mt-0.5">{formatDate(enrollment.since)}</dd>
                </div>
                {enrollment.until ? (
                  <div>
                    <dt className="text-[13px] leading-[18px] text-muted-foreground">
                      {m.enrollmentEnds()}
                    </dt>
                    <dd className="mt-0.5">{formatDate(enrollment.until)}</dd>
                  </div>
                ) : null}
              </dl>
            </li>
          ))}
        </RecordList>
      )}
    </RecordSection>
  );
}

function AccountSection({
  studentId,
  onEdit,
}: {
  studentId: string;
  onEdit: () => void;
}) {
  const { userId, account } = useSuspenseQuery(
    studentManagementQuery(studentId),
  ).data;
  return (
    <RecordSection
      title={m.studentSignInAccount()}
      description={m.studentAccountHint()}
      edit={{ label: m.studentEditAccount(), onClick: onEdit }}
    >
      {userId ? (
        <Facts>
          <Fact label={m.studentSignInAccount()}>
            {account ? (
              <Link
                to="/people/$userId"
                params={{ userId }}
                dir="auto"
                className={cn("text-primary hover:underline", phoneLink)}
              >
                {account.name}
              </Link>
            ) : null}
          </Fact>
          <Fact label={m.studentEmail()}>
            {account ? <Email value={account.email} /> : null}
          </Fact>
        </Facts>
      ) : (
        <div className="grid gap-1">
          <StatusText tone="warning">{m.studentNoAccount()}</StatusText>
          <RecordEmpty>{m.studentAccountNone()}</RecordEmpty>
        </div>
      )}
    </RecordSection>
  );
}

export function StudentProfile({
  studentId,
  tab,
  week,
  onTab,
  onWeek,
}: {
  studentId: string;
  tab: StudentTab;
  week: number | undefined;
  onTab: (tab: StudentTab) => void;
  onWeek: (week: number) => void;
}) {
  const data = useStudent(studentId);
  const { today, profile, access } = data;
  const user = useCurrentUser();
  const removeFromClass = useRemoveFromClass(studentId);
  const unlinkAccount = useUnlinkAccount(studentId);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  // The loader has already fetched this for anyone who manages the record.
  const managed = useQuery({
    ...studentManagementQuery(studentId),
    enabled: access.manage,
  }).data;
  const [sheet, setSheet] = useState<{
    form: StudentForm;
    open: boolean;
    key: number;
  }>({ form: "personal", open: false, key: 0 });
  const edit = (form: StudentForm) => () => {
    void prepareStudentSheet(queryClient, studentId, form).then(() =>
      setSheet((current) => ({ form, open: true, key: current.key + 1 })),
    );
  };
  const messagesPath = access.contacts ? guardianMessagesPath(user) : null;

  const available = studentTabsFor(access);
  const tabs: RecordTab<StudentTab>[] = STUDENT_TABS.filter(
    (value) => available[value],
  ).map((value) => ({ value, label: TAB_LABEL[value]() }));
  const active = available[tab] ? tab : "overview";

  const age = ageOn(profile.birthdate, today);
  const facts: HeaderFact[] = [
    {
      label: m.familyReference(),
      value: <span dir="ltr">{profile.reference}</span>,
    },
  ];
  if (profile.classId)
    facts.push({
      label: m.studentClass(),
      // The facts line stays 20px on a phone; the link's tap area grows
      // into the space around it instead.
      value: (
        <ClassLink
          profile={profile}
          className="relative after:absolute after:inset-x-0 after:-inset-y-3 md:after:hidden"
        />
      ),
    });
  if (age) facts.push({ label: m.studentAge(), value: formatAge(age) });

  const alerts: RecordAlert[] = [];
  if (access.medical && profile.medical?.allergies?.trim())
    alerts.push({
      label: m.studentAllergies(),
      tone: "danger",
      icon: HeartPulse,
    });
  if (access.contacts && profile.guardians.length === 0)
    alerts.push({
      label: m.studentAlertNoGuardian(),
      tone: "warning",
      icon: UserX,
    });
  if (access.contacts && profile.emergencyContacts.length === 0)
    alerts.push({
      label: m.studentAlertNoEmergency(),
      tone: "warning",
      icon: PhoneOff,
    });

  const guardian =
    profile.guardians.find((entry) => entry.isPrimary) ?? profile.guardians[0];
  const menu: ActionItem[] = [];
  if (messagesPath && guardian)
    menu.push({
      label: m.studentMessageGuardian({ name: guardian.name }),
      icon: MessageSquare,
      onSelect: () =>
        navigate({
          to: messagesPath,
          search: { compose: true, to: guardian.id, about: studentId },
        }),
    });
  menu.push({
    label: m.studentsCopyReference(),
    icon: Copy,
    onSelect: async () => {
      try {
        await navigator.clipboard.writeText(profile.reference);
      } catch {
        throw new Error(m.studentsCopyFailed());
      }
      toast.success(m.studentsReferenceCopied());
    },
  });
  const currentClass = profile.classId ? profile.className : null;
  if (access.manage && currentClass)
    menu.push({
      label: m.studentRemoveFromClass(),
      icon: UserMinus,
      destructive: true,
      confirm: {
        title: m.studentRemoveFromClassTitle({
          name: profile.fullName,
          className: currentClass,
        }),
        body: m.studentRemoveFromClassBody({ name: profile.fullName }),
        label: m.studentRemoveFromClass(),
      },
      onSelect: () => removeFromClass(currentClass),
    });
  if (access.manage && managed?.userId) {
    const account = managed.account?.name ?? m.studentSignInAccount();
    menu.push({
      label: m.studentUnlinkAccount(),
      icon: Unlink,
      destructive: true,
      confirm: {
        title: m.studentUnlinkAccountTitle({ account, name: profile.fullName }),
        body: m.studentUnlinkAccountBody({ name: profile.fullName }),
        label: m.studentUnlinkAccount(),
      },
      onSelect: () => unlinkAccount(account),
    });
  }
  const lessons = todaySource(user, profile);

  const tabLink = (target: StudentTab, label: string) => (
    <ButtonLink
      to="/students/$studentId"
      params={{ studentId }}
      search={{ tab: target }}
      variant="ghost"
      className="max-md:h-10"
    >
      {label}
    </ButtonLink>
  );

  let body: ReactNode;
  switch (active) {
    case "overview":
      body = (
        <RecordColumns
          main={
            <>
              {access.attendance ? (
                <Deferred>
                  <AttendanceOverview
                    studentId={studentId}
                    action={tabLink("attendance", m.studentViewAttendance())}
                  />
                </Deferred>
              ) : null}
              {access.grades ? (
                <Deferred>
                  <ResultsSection
                    studentId={studentId}
                    limit={4}
                    action={tabLink("coursework", m.studentViewCoursework())}
                  />
                </Deferred>
              ) : null}
              {access.attendance || access.grades ? null : (
                <PersonalSection data={data} />
              )}
            </>
          }
          aside={
            <>
              <ClassSection profile={profile} />
              {lessons === "no-class" ? (
                <TodayWithoutClass />
              ) : lessons === "student" ? (
                <Deferred>
                  <TodayForStudent studentId={studentId} today={today} />
                </Deferred>
              ) : lessons ? (
                <Deferred>
                  <TodayForClass classId={lessons.classId} today={today} />
                </Deferred>
              ) : null}
              {access.contacts ? (
                <GuardiansSection
                  profile={profile}
                  messagesPath={messagesPath}
                />
              ) : null}
              {access.medical ? <MedicalSummary profile={profile} /> : null}
            </>
          }
        />
      );
      break;
    case "details":
      body = (
        <RecordColumns
          main={
            <PersonalSection
              data={data}
              onEdit={access.manage ? edit("personal") : undefined}
            />
          }
          aside={access.contacts ? <ContactSection profile={profile} /> : null}
        />
      );
      break;
    case "family":
      body = (
        <RecordColumns
          main={
            <GuardiansSection
              profile={profile}
              messagesPath={messagesPath}
              onEdit={access.manage ? edit("guardians") : undefined}
            />
          }
          aside={<EmergencySection profile={profile} />}
        />
      );
      break;
    case "medical":
      body = (
        <RecordColumns
          main={<MedicalSection profile={profile} />}
          aside={<MedicalReportsSection profile={profile} />}
        />
      );
      break;
    case "enrollment":
      body = (
        <RecordColumns
          main={<HistorySection profile={profile} today={today} />}
          aside={<ClassSection profile={profile} />}
        />
      );
      break;
    case "attendance":
      body = (
        <Deferred>
          <StudentAttendance studentId={studentId} />
        </Deferred>
      );
      break;
    case "coursework":
      body = access.coursework ? (
        <RecordColumns
          main={
            <Deferred>
              <AssignmentsSection
                studentId={studentId}
                week={week}
                onWeek={onWeek}
              />
            </Deferred>
          }
          aside={
            access.grades ? (
              <Deferred>
                <ResultsSection studentId={studentId} />
              </Deferred>
            ) : null
          }
        />
      ) : (
        <RecordColumns
          main={
            <Deferred>
              <ResultsSection studentId={studentId} />
            </Deferred>
          }
        />
      );
      break;
    case "account":
      body = (
        <RecordColumns
          main={
            <Deferred>
              <AccountSection studentId={studentId} onEdit={edit("account")} />
            </Deferred>
          }
        />
      );
      break;
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <RecordHeader
        title={profile.fullName}
        photoUrl={profile.photoUrl}
        initials={initialsOf(profile.fullName)}
        facts={facts}
        status={
          profile.classId
            ? { label: m.studentStatusEnrolled(), tone: "success" }
            : { label: m.studentsNoClass(), tone: "warning" }
        }
        alerts={alerts}
        action={
          access.manage
            ? {
                label: m.studentMoveClass(),
                icon: ArrowRightLeft,
                onClick: edit("class"),
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
        <Suspense fallback={null}>
          <StudentEditSheet
            key={sheet.key}
            studentId={studentId}
            form={sheet.form}
            open={sheet.open}
            onClose={() => setSheet((current) => ({ ...current, open: false }))}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
