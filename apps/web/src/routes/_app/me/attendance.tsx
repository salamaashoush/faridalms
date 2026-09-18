import { DEFAULT_STUDENT_SCOPED_QUERY } from "@faridalms/domain/school-schema";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CircleAlert,
  CircleCheck,
  Clock,
  UserCheck,
  UserMinus,
} from "lucide-react";

import { AttendanceBadge } from "~/components/app/labels";
import {
  EmptyState,
  PageHeader,
  SectionCard,
  StatTile,
  Value,
} from "~/components/app/primitives";
import { formatDate, formatPercent } from "~/components/me/format";
import { Card, CardContent } from "~/components/ui/card";
import { Progress } from "~/components/ui/progress";
import * as m from "~/i18n/messages";
import { attendanceQuery } from "~/queries/school";
import { formatNumber } from "~/utils/datetime";

export const Route = createFileRoute("/_app/me/attendance")({
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(
      attendanceQuery(DEFAULT_STUDENT_SCOPED_QUERY),
    );
  },
  component: MyAttendancePage,
});

function MyAttendancePage() {
  const { summary, rows } = useSuspenseQuery(
    attendanceQuery(DEFAULT_STUDENT_SCOPED_QUERY),
  ).data;

  return (
    <>
      <PageHeader
        title={m.attendanceTitle()}
        description={m.meAttendanceSubtitle()}
      />

      <Card className="mb-6">
        <CardContent className="flex flex-col gap-3 p-6">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {m.attendanceRate()}
          </p>
          <p className="text-5xl font-semibold tracking-tight tabular-nums">
            <Value>
              {summary.rate === null ? null : formatPercent(summary.rate)}
            </Value>
          </p>
          <Progress value={summary.rate} aria-label={m.attendanceRate()} />
          <p className="text-xs text-muted-foreground">
            {m.meDaysRecorded({ count: formatNumber(summary.total) })}
          </p>
        </CardContent>
      </Card>

      <h2 className="mb-3 text-sm font-semibold">
        {m.meAttendanceBreakdown()}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={m.attendancePresent()}
          value={formatNumber(summary.present)}
          icon={CircleCheck}
          tone="positive"
        />
        <StatTile
          label={m.attendanceAbsent()}
          value={formatNumber(summary.absent)}
          icon={UserMinus}
          tone={summary.absent > 0 ? "critical" : "default"}
        />
        <StatTile
          label={m.attendanceLate()}
          value={formatNumber(summary.late)}
          icon={Clock}
          tone={summary.late > 0 ? "warning" : "default"}
        />
        <StatTile
          label={m.attendanceExcused()}
          value={formatNumber(summary.excused)}
          icon={CircleAlert}
        />
      </div>

      <SectionCard
        className="mt-6"
        title={m.meDailyRecord()}
        description={m.attendanceNote()}
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={UserCheck}
            title={m.meAttendanceEmpty()}
            body={m.meAttendanceSubtitle()}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border p-3"
              >
                <span className="w-32 shrink-0 text-sm font-medium tabular-nums">
                  {formatDate(row.date)}
                </span>
                <AttendanceBadge status={row.status} />
                <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                  <Value>{row.note}</Value>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
