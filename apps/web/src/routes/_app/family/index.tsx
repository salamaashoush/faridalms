import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BookOpen,
  CalendarClock,
  GraduationCap,
  Mail,
  Users,
  UserCheck,
} from "lucide-react";
import * as v from "valibot";

import { PersonAvatar } from "~/components/admin/PersonAvatar";
import { ButtonLink } from "~/components/app/ButtonLink";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatTile,
  Value,
} from "~/components/app/primitives";
import { UpcomingList } from "~/components/family/UpcomingList";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { familyOverviewQuery } from "~/queries/school";
import { formatDate, formatNumber } from "~/utils/datetime";

export const Route = createFileRoute("/_app/family/")({
  validateSearch: v.object({ studentId: v.optional(v.string()) }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(familyOverviewQuery),
  component: FamilyOverviewPage,
});
function FamilyOverviewPage() {
  const user = useCurrentUser();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { schoolYear, overviews, unread, upcoming } =
    useSuspenseQuery(familyOverviewQuery).data;
  const selected =
    overviews.find((row) => row.student.id === search.studentId) ??
    overviews[0];
  return (
    <>
      <PageHeader
        title={m.overviewGreeting({ name: user.name })}
        description={m.overviewSchoolYear({ year: schoolYear })}
        actions={
          <ButtonLink to="/family/messages" search={{ compose: true }}>
            <Mail className="size-4" aria-hidden />
            {m.dashboardContactSchool()}
          </ButtonLink>
        }
      />
      {selected ? (
        <Tabs
          value={selected.student.id}
          onValueChange={(value) => {
            if (typeof value === "string")
              void navigate({ search: { studentId: value } });
          }}
        >
          <div className="mb-5 overflow-x-auto">
            <TabsList
              variant="line"
              className="h-auto gap-4 border-b pb-2"
              aria-label={m.familyYourChildren()}
            >
              {overviews.map((row) => (
                <TabsTrigger
                  key={row.student.id}
                  value={row.student.id}
                  className="gap-3 px-2 py-3"
                >
                  <PersonAvatar name={row.student.fullName} />
                  <span className="text-start">
                    <span className="block text-sm font-semibold">
                      {row.student.fullName}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      <Value>{row.student.className}</Value>
                    </span>
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value={selected.student.id} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label={m.overviewAttendanceRate()}
                value={
                  <Value>
                    {selected.attendance.rate === null
                      ? null
                      : m.familyPercentValue({
                          value: formatNumber(selected.attendance.rate),
                        })}
                  </Value>
                }
                icon={UserCheck}
              />
              <StatTile
                label={m.overviewAverageGrade()}
                value={
                  <Value>
                    {selected.average === null
                      ? null
                      : m.familyPercentValue({
                          value: formatNumber(selected.average),
                        })}
                  </Value>
                }
                icon={GraduationCap}
              />
              <StatTile
                label={m.overviewDueThisWeek()}
                value={formatNumber(selected.dueThisWeek)}
                icon={BookOpen}
              />
              <StatTile
                label={m.overviewOverdue()}
                value={formatNumber(selected.overdue)}
                icon={CalendarClock}
                tone={selected.overdue > 0 ? "warning" : "default"}
              />
            </div>
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
              <div className="space-y-6">
                <SectionCard
                  title={m.dashboardLearningNext()}
                  actions={
                    <ButtonLink
                      to="/family/assignments"
                      search={{ studentId: selected.student.id }}
                      variant="ghost"
                      size="sm"
                    >
                      {m.commonViewAll()}
                      <ArrowUpRight className="size-4" aria-hidden />
                    </ButtonLink>
                  }
                >
                  {selected.nextDue ? (
                    <div className="grid gap-5 sm:grid-cols-[auto_1fr_auto]">
                      <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                        <BookOpen className="size-6" aria-hidden />
                      </span>
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">
                          {m.overviewNextDue()}
                        </p>
                        <h3 className="mt-1 text-xl font-semibold tracking-tight">
                          <Link
                            to="/assignments/$assignmentId"
                            params={{ assignmentId: selected.nextDue.id }}
                            search={{}}
                            className="hover:text-primary hover:underline"
                          >
                            {selected.nextDue.title}
                          </Link>
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {m.assignmentsDue({
                            date: formatDate(selected.nextDue.dueDate),
                          })}
                        </p>
                      </div>
                      <ButtonLink
                        to="/family/assignments"
                        search={{ studentId: selected.student.id }}
                        variant="outline"
                        size="sm"
                      >
                        {m.courseworkView()}
                      </ButtonLink>
                    </div>
                  ) : (
                    <EmptyState title={m.meAllCaughtUp()} icon={BookOpen} />
                  )}
                </SectionCard>
                <SectionCard title={m.dashboardStayConnected()}>
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                        <Mail aria-hidden />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">
                          {unread
                            ? m.familyAttentionUnread({
                                count: formatNumber(unread),
                              })
                            : m.commMessagesAllRead()}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {m.dashboardMessagesHint()}
                        </p>
                      </div>
                    </div>
                    <ButtonLink
                      to="/family/messages"
                      variant="outline"
                      size="sm"
                    >
                      {m.navMessages()}
                    </ButtonLink>
                  </div>
                </SectionCard>
                <div className="grid gap-3 sm:grid-cols-3">
                  <DashboardShortcut
                    to="/family/children"
                    studentId={selected.student.id}
                    label={m.familyOpenProfile()}
                    icon="profile"
                  />
                  <DashboardShortcut
                    to="/family/grades"
                    studentId={selected.student.id}
                    label={m.navGrades()}
                    icon="grades"
                  />
                  <DashboardShortcut
                    to="/family/timetable"
                    studentId={selected.student.id}
                    label={m.navTimetable()}
                    icon="calendar"
                  />
                </div>
              </div>
              <UpcomingList events={upcoming} />
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        <EmptyState title={m.familyNoChildren()} icon={Users} />
      )}
    </>
  );
}
function DashboardShortcut({
  to,
  studentId,
  label,
  icon,
}: {
  to: "/family/children" | "/family/grades" | "/family/timetable";
  studentId: string;
  label: string;
  icon: "profile" | "grades" | "calendar";
}) {
  const Icon = {
    profile: Users,
    grades: GraduationCap,
    calendar: CalendarClock,
  }[icon];
  return (
    <ButtonLink
      to={to}
      search={{ studentId }}
      variant="outline"
      className="h-auto justify-between rounded-xl bg-card px-4 py-5"
    >
      <span className="flex items-center gap-3">
        <Icon className="size-5 text-primary" aria-hidden />
        {label}
      </span>
      <ArrowUpRight className="size-4 text-muted-foreground" aria-hidden />
    </ButtonLink>
  );
}
