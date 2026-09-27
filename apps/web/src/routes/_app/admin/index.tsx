import type { LinkProps } from "@tanstack/react-router";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BellRing, Sun } from "lucide-react";
import { toast } from "sonner";

import { formatPercent } from "~/components/admin/format";
import { eventTitle } from "~/components/calendar/format";
import {
  HomeCard,
  HomeItem,
  HomeList,
  itemLink,
} from "~/components/home/parts";
import { EmptyState, PageHeader } from "~/components/system/IndexPage";
import { Fact, Facts, RecordColumns } from "~/components/system/RecordPage";
import { StatusText } from "~/components/system/status";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { adminHomeQuery } from "~/queries/home";
import { remindTeachers } from "~/server/attendance";
import { formatDate, formatNumber } from "~/utils/datetime";
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

/**
 * The office's day: what needs someone to act, how attendance is going, what
 * is coming, how recent news was read, and the next year's setup when this
 * one is ending.
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
                    to="/newsletters/$newsletterId"
                    params={{ newsletterId: row.id }}
                    className={itemLink}
                  >
                    <bdi>{row.title}</bdi>
                  </Link>
                )
              }
              facts={[
                row.kind === "announcement"
                  ? m.navAnnouncements()
                  : m.navNewsletters(),
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
