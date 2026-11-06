import type { OnboardingItem } from "@faridalms/domain/onboarding";
import type { LinkProps } from "@tanstack/react-router";

import { Button } from "@faridalms/ui/button";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { Fact, Facts, RecordColumns } from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BellRing, Sun } from "lucide-react";
import { toast } from "sonner";

import { eventTitle } from "~/components/calendar/format";
import {
  HomeCard,
  HomeItem,
  HomeList,
  itemLink,
} from "~/components/home/parts";
import { displayName } from "~/components/people/format";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { adminHomeQuery } from "~/queries/home";
import { remindTeachers } from "~/server/attendance";
import { formatDate, formatNumber, formatPercent } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

export const Route = createFileRoute("/_app/admin/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(adminHomeQuery),
  component: AdminToday,
});

interface Need {
  key: string;
  label: string;
  link: LinkProps;
}

const ONBOARDING_LABEL: Record<OnboardingItem, () => string> = {
  admin_signed_in: m.onboardingAdminSignedIn,
  school_details: m.onboardingSchoolDetails,
  year_ready: m.onboardingYearReady,
  classes: m.onboardingClasses,
  staff_invited: m.onboardingStaffInvited,
  staff_signed_in: m.onboardingStaffSignedIn,
  students_imported: m.onboardingStudentsImported,
  guardians_linked: m.onboardingGuardiansLinked,
  families_signed_in: m.onboardingFamiliesSignedIn,
  first_assignment: m.onboardingFirstAssignment,
  first_register: m.onboardingFirstRegister,
  website_published: m.onboardingWebsitePublished,
  custom_domain: m.onboardingCustomDomain,
  first_invoice_paid: m.onboardingFirstInvoicePaid,
  kickoff_call: m.onboardingKickoffCall,
  training: m.onboardingTraining,
  data_import: m.onboardingDataImport,
};

/**
 * The office's day: what needs someone to act, how attendance is going, what
 * is coming, how recent news was read, the school's first steps until it has
 * taken them all, and the next year's setup when this one is ending.
 */
function AdminToday() {
  const data = useSuspenseQuery(adminHomeQuery).data;
  const queryClient = useQueryClient();
  const remind = useMutation({
    mutationFn: () =>
      remindTeachers({
        data: {
          date: data.today,
          classIds: data.registers?.classes.map((row) => row.classId) ?? [],
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["home"] });
      toast.success(m.homeReminded());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const needs: Need[] = [
    ...(data.registers?.notTaken
      ? [
          {
            key: "registers",
            label: m.homeRegistersNotTaken({ count: data.registers.notTaken }),
            link: { to: "/admin/attendance", search: {} },
          },
        ]
      : []),
    ...(data.absences
      ? [
          {
            key: "absences",
            label: m.homeUnexplainedAbsences({ count: data.absences }),
            link: { to: "/admin/attendance", search: { tab: "absences" } },
          },
        ]
      : []),
    ...(data.guardians
      ? [
          {
            key: "guardians",
            label: m.homeWithoutGuardian({ count: data.guardians }),
            link: { to: "/admin/students", search: { missing: ["guardian"] } },
          },
        ]
      : []),
    ...(data.homerooms
      ? [
          {
            key: "homerooms",
            label: m.homeWithoutHomeroomTeacher({ count: data.homerooms }),
            link: { to: "/admin/classes", search: {} },
          },
        ]
      : []),
    ...(data.failed
      ? [
          {
            key: "failed",
            label: m.homeFailedNotifications({ count: data.failed }),
            link: {
              to: "/admin/notification-audit",
              search: { state: "failed" },
            },
          },
        ]
      : []),
  ] as Need[];
  const main = [
    needs.length > 0 ? (
      <HomeCard key="needs" title={m.homeNeedsAction()}>
        <div className="grid gap-4">
          <HomeList>
            {needs.map((need) => (
              <HomeItem
                key={need.key}
                title={
                  <Link {...need.link} className={itemLink}>
                    {need.label}
                  </Link>
                }
              />
            ))}
          </HomeList>
          {data.registers?.notTaken ? (
            <div>
              <Button
                type="button"
                variant="outline"
                className="max-md:h-10"
                disabled={remind.isPending}
                onClick={() => remind.mutate()}
              >
                <BellRing aria-hidden />
                {m.homeRemindAll()}
              </Button>
            </div>
          ) : null}
        </div>
      </HomeCard>
    ) : null,
    data.attendance ? (
      <HomeCard
        key="attendance"
        title={m.homeAttendance()}
        action={{
          label: m.homeOpenAttendance(),
          link: { to: "/admin/attendance", search: { tab: "reports" } },
        }}
      >
        <Facts short>
          <Fact
            label={m.homeAttendanceToday()}
            notApplicable={data.attendance.today === null}
          >
            {data.attendance.today === null
              ? null
              : formatPercent(data.attendance.today)}
          </Fact>
          <Fact
            label={m.homeAttendanceWeek()}
            notApplicable={data.attendance.week === null}
          >
            {data.attendance.week === null
              ? null
              : formatPercent(data.attendance.week)}
          </Fact>
        </Facts>
      </HomeCard>
    ) : null,
    data.communications.length > 0 ? (
      <HomeCard key="communications" title={m.homeRecentNews()}>
        <HomeList>
          {data.communications.map((row) => (
            <HomeItem
              key={`${row.kind}-${row.id}`}
              title={
                row.kind === "announcement" ? (
                  <Link
                    to="/announcements/$announcementId"
                    params={{ announcementId: row.id }}
                    className={itemLink}
                  >
                    <bdi>{row.title}</bdi>
                  </Link>
                ) : (
                  <Link
                    to="/news/$postId"
                    params={{ postId: row.id }}
                    className={itemLink}
                  >
                    <bdi>{row.title}</bdi>
                  </Link>
                )
              }
              facts={[
                row.kind === "announcement"
                  ? m.navAnnouncements()
                  : m.navNews(),
              ]}
              status={
                <span className="text-[13px] text-muted-foreground tabular-nums">
                  {m.homeReadOf({
                    count: formatNumber(row.read),
                    total: formatNumber(row.recipients),
                  })}
                </span>
              }
            />
          ))}
        </HomeList>
      </HomeCard>
    ) : null,
  ].filter(Boolean);
  const aside = [
    data.onboarding ? (
      <HomeCard
        key="onboarding"
        title={m.homeOnboarding()}
        description={m.homeOnboardingProgress({
          done: formatNumber(
            data.onboarding.filter((step) => step.done).length,
          ),
          total: formatNumber(data.onboarding.length),
        })}
      >
        <HomeList>
          {data.onboarding.map((step) => (
            <HomeItem
              key={step.item}
              title={
                <span className="text-sm">{ONBOARDING_LABEL[step.item]()}</span>
              }
              status={
                <StatusText tone={step.done ? "success" : "warning"}>
                  {step.done ? m.homeDone() : m.homeToDo()}
                </StatusText>
              }
            />
          ))}
        </HomeList>
      </HomeCard>
    ) : null,
    data.checklist ? (
      <HomeCard
        key="checklist"
        title={m.homeNextYear()}
        description={m.homeYearEnds({
          date: formatDate(data.checklist.yearEnds),
        })}
        action={{
          label: m.homeOpenYears(),
          link: { to: "/admin/academic-years", search: {} },
        }}
      >
        <HomeList>
          <HomeItem
            title={<span className="text-sm">{m.homeChecklistYear()}</span>}
            status={
              <StatusText
                tone={data.checklist.nextYear ? "success" : "warning"}
              >
                {data.checklist.nextYear ? m.homeDone() : m.homeToDo()}
              </StatusText>
            }
          />
          <HomeItem
            title={<span className="text-sm">{m.homeChecklistClasses()}</span>}
            status={
              <StatusText
                tone={data.checklist.nextClasses ? "success" : "warning"}
              >
                {data.checklist.nextClasses ? m.homeDone() : m.homeToDo()}
              </StatusText>
            }
          />
          <HomeItem
            title={<span className="text-sm">{m.homeChecklistStudents()}</span>}
            status={
              <StatusText
                tone={data.checklist.nextStudents ? "success" : "warning"}
              >
                {data.checklist.nextStudents ? m.homeDone() : m.homeToDo()}
              </StatusText>
            }
          />
        </HomeList>
      </HomeCard>
    ) : null,
    data.documents.length > 0 ? (
      <HomeCard key="documents" title={m.homeDocumentsExpiring()}>
        <HomeList>
          {data.documents.map((row) => (
            <HomeItem
              key={`${row.studentId}-${row.meaning}`}
              title={
                <Link
                  to="/students/$studentId"
                  params={{ studentId: row.studentId }}
                  search={{ tab: "details" }}
                  className={itemLink}
                >
                  <bdi>{displayName(row)}</bdi>
                </Link>
              }
              facts={[
                inLocale(row.labelEn, row.labelAr),
                m.identityExpires({ date: formatDate(row.expiresOn) }),
              ]}
            />
          ))}
        </HomeList>
      </HomeCard>
    ) : null,
    data.events.length > 0 ? (
      <HomeCard
        key="events"
        title={m.homeNextSevenDays()}
        action={{
          label: m.homeOpenCalendar(),
          link: { to: "/calendar", search: {} },
        }}
      >
        <HomeList>
          {data.events.map((event) => (
            <HomeItem
              key={event.id}
              title={
                <Link
                  to="/calendar/$eventId"
                  params={{ eventId: event.id }}
                  className={itemLink}
                >
                  <bdi>{eventTitle(event)}</bdi>
                </Link>
              }
              facts={[formatDate(event.startsOn), event.location]}
            />
          ))}
        </HomeList>
      </HomeCard>
    ) : null,
  ].filter(Boolean);
  return (
    <>
      <PageHeader title={m.navToday()} description={formatDate(data.today)} />
      {main.length + aside.length === 0 ? (
        <EmptyState
          icon={Sun}
          title={m.homeClearTitle()}
          description={m.homeClearBody()}
        />
      ) : (
        <RecordColumns
          main={main.length ? main : aside}
          aside={main.length && aside.length ? aside : undefined}
        />
      )}
    </>
  );
}
