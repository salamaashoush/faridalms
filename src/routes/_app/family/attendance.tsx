import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarOff,
  CircleCheck,
  CircleSlash,
  Clock,
  ShieldCheck,
} from "lucide-react";
import * as v from "valibot";

import { AttendanceBadge } from "~/components/app/labels";
import {
  EmptyState,
  Field,
  PageHeader,
  SectionCard,
  StatTile,
  Value,
} from "~/components/app/primitives";
import { formatDate } from "~/components/family/format";
import { StudentScopeBar } from "~/components/family/StudentScopeBar";
import { Progress } from "~/components/ui/progress";
import * as m from "~/i18n/messages";
import { attendanceQuery, visibleStudentsQuery } from "~/queries/school";
import { studentScopedQuerySchema } from "~/schema/school";
import { formatNumber } from "~/utils/datetime";

export const Route = createFileRoute("/_app/family/attendance")({
  validateSearch: (search) => v.parse(studentScopedQuerySchema, search),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(attendanceQuery(deps)),
      context.queryClient.ensureQueryData(visibleStudentsQuery),
    ]);
  },
  component: FamilyAttendancePage,
});

function FamilyAttendancePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { summary, rows } = useSuspenseQuery(attendanceQuery(search)).data;

  const rateTone =
    summary.rate === null
      ? "text-foreground"
      : summary.rate >= 90
        ? "text-[var(--success)]"
        : summary.rate >= 75
          ? "text-[var(--warning)]"
          : "text-destructive";

  return (
    <>
      <PageHeader
        title={m.attendanceTitle()}
        description={m.familyAttendanceSubtitle()}
      />

      <StudentScopeBar
        studentId={search.studentId}
        onChange={(studentId) => {
          void navigate({ search: (prev) => ({ ...prev, studentId }) });
        }}
      />

      <div className="flex flex-col gap-6">
        <SectionCard title={m.attendanceRate()}>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-5">
            <p
              className={`text-5xl font-semibold tracking-tight tabular-nums ${rateTone}`}
            >
              {summary.rate === null ? (
                <Value>{null}</Value>
              ) : (
                m.familyPercentValue({ value: formatNumber(summary.rate) })
              )}
            </p>

            <div className="min-w-56 flex-1">
              {summary.rate === null ? null : (
                <Progress
                  value={summary.rate}
                  aria-label={m.attendanceRate()}
                />
              )}
              <dl className="mt-4">
                <Field label={m.familyDaysRecorded()}>
                  {formatNumber(summary.total)}
                </Field>
              </dl>
            </div>
          </div>
        </SectionCard>

        <section aria-labelledby="family-attendance-breakdown">
          <h2
            id="family-attendance-breakdown"
            className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase"
          >
            {m.familyBreakdown()}
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
              icon={CircleSlash}
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
              icon={ShieldCheck}
            />
          </div>
        </section>

        <SectionCard title={m.familyDailyRecord()}>
          {rows.length === 0 ? (
            <EmptyState title={m.familyAttendanceEmpty()} icon={CalendarOff} />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
                >
                  <span className="w-32 shrink-0 text-sm tabular-nums">
                    {formatDate(row.date)}
                  </span>
                  <AttendanceBadge status={row.status} />
                  {row.note ? (
                    <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                      <span className="sr-only">{m.attendanceNote()}</span>
                      {row.note}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
