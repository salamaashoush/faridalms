import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarDays,
  ClipboardList,
  GraduationCap,
  School,
  UserCheck,
  Users,
} from "lucide-react";

import { ClassesTable } from "~/components/admin/ClassesTable";
import { formatDay, formatPercent } from "~/components/admin/format";
import { ButtonLink } from "~/components/app/ButtonLink";
import {
  EVENT_CATEGORY_CLASS,
  EVENT_CATEGORY_LABEL,
} from "~/components/app/labels";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatTile,
  Value,
} from "~/components/app/primitives";
import { Badge } from "~/components/ui/badge";
import * as m from "~/i18n/messages";
import { adminOverviewQuery } from "~/queries/school";
import { formatNumber } from "~/utils/datetime";

export const Route = createFileRoute("/_app/admin/")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(adminOverviewQuery);
  },
  component: AdminOverviewPage,
});

function AdminOverviewPage() {
  const overview = useSuspenseQuery(adminOverviewQuery).data;
  const { stats, attendanceRate } = overview;

  return (
    <>
      <PageHeader
        title={m.adminOverviewTitle()}
        description={m.adminOverviewSubtitle()}
        actions={
          <Badge variant="outline">
            {m.overviewSchoolYear({ year: overview.schoolYear })}
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label={m.adminTotalStudents()}
          value={formatNumber(stats.students)}
          icon={GraduationCap}
        />
        <StatTile
          label={m.adminTotalClasses()}
          value={formatNumber(stats.classes)}
          icon={School}
        />
        <StatTile
          label={m.adminTotalTeachers()}
          value={formatNumber(stats.teachers)}
          icon={Users}
        />
        <StatTile
          label={m.adminTotalAssignments()}
          value={formatNumber(stats.assignments)}
          icon={ClipboardList}
        />
        <StatTile
          label={m.attendanceRate()}
          value={
            <Value>
              {attendanceRate === null ? null : formatPercent(attendanceRate)}
            </Value>
          }
          hint={m.adminAttendanceHint()}
          icon={UserCheck}
          tone={
            attendanceRate !== null && attendanceRate < 85
              ? "warning"
              : "positive"
          }
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SectionCard
          title={m.adminClassListTitle()}
          actions={
            <ButtonLink to="/admin/classes" size="sm" variant="outline">
              {m.adminClassesTitle()}
            </ButtonLink>
          }
        >
          <ClassesTable rows={overview.classes} />
        </SectionCard>

        <SectionCard title={m.adminUpcomingTitle()}>
          <UpcomingEvents events={overview.upcoming} />
        </SectionCard>
      </div>
    </>
  );
}

interface UpcomingEvent {
  id: string;
  title: string;
  category: "general" | "national_vacation" | "school_vacation";
  startsOn: string;
  endsOn: string;
  provisional: boolean;
}

function UpcomingEvents({ events }: { events: UpcomingEvent[] }) {
  if (events.length === 0) {
    return <EmptyState title={m.adminUpcomingEmpty()} icon={CalendarDays} />;
  }

  return (
    <ul className="flex flex-col gap-4">
      {events.map((event) => (
        <li key={event.id} className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">{event.title}</p>
          <p className="text-xs text-muted-foreground">
            {event.startsOn === event.endsOn
              ? formatDay(event.startsOn)
              : m.adminDateRange({
                  from: formatDay(event.startsOn),
                  to: formatDay(event.endsOn),
                })}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant="outline"
              className={EVENT_CATEGORY_CLASS[event.category]}
            >
              {EVENT_CATEGORY_LABEL[event.category]()}
            </Badge>
            {event.provisional ? (
              <Badge variant="outline">{m.commonProvisional()}</Badge>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
