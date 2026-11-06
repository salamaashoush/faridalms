import {
  absencesQuerySchema,
  reportQuerySchema,
} from "@faridalms/domain/attendance";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import * as v from "valibot";

import { Absences } from "~/components/attendance/Absences";
import { Board } from "~/components/attendance/Board";
import { FollowUp } from "~/components/attendance/FollowUp";
import { FrontDesk } from "~/components/attendance/FrontDesk";
import { Report } from "~/components/attendance/Report";
import { ReportInbox } from "~/components/attendance/ReportInbox";
import * as m from "~/i18n/messages";
import {
  absenceReportInboxQuery,
  absencesQuery,
  attendanceBoardQuery,
  followUpQuery,
  frontDeskQuery,
  attendanceReportQuery,
} from "~/queries/attendance";

const TABS = [
  "registers",
  "desk",
  "follow",
  "absences",
  "reported",
  "reports",
] as const;
type Tab = (typeof TABS)[number];

const searchSchema = v.object({
  tab: v.fallback(v.optional(v.picklist(TABS), "registers"), "registers"),
  date: v.optional(
    v.union([v.literal(""), v.pipe(v.string(), v.isoDate())]),
    "",
  ),
  states: v.optional(
    v.array(v.picklist(["not_started", "in_progress", "submitted"])),
    [],
  ),
  ...absencesQuerySchema.entries,
  periodId: reportQuerySchema.entries.periodId,
  by: reportQuerySchema.entries.by,
  inbox: v.fallback(
    v.optional(v.picklist(["waiting", "all"]), "waiting"),
    "waiting",
  ),
});
type Search = v.InferOutput<typeof searchSchema>;

const DEFAULT_SEARCH = v.parse(searchSchema, {});

export const Route = createFileRoute("/_app/admin/attendance")({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const { queryClient } = context;
    if (deps.tab === "registers")
      await queryClient.ensureQueryData(attendanceBoardQuery(deps.date));
    else if (deps.tab === "absences")
      await queryClient.ensureQueryData(absencesQuery(absencesOf(deps)));
    else if (deps.tab === "desk")
      await queryClient.ensureQueryData(frontDeskQuery(deps.date));
    else if (deps.tab === "follow")
      await queryClient.ensureQueryData(
        followUpQuery({ date: deps.date, overduePage: 1, supportPage: 1 }),
      );
    else if (deps.tab === "reported")
      await queryClient.ensureQueryData(
        absenceReportInboxQuery(deps.inbox === "waiting"),
      );
    else
      await queryClient.ensureQueryData(attendanceReportQuery(reportOf(deps)));
  },
  component: AdminAttendancePage,
});

function absencesOf(search: Search) {
  return { from: search.from, to: search.to, show: search.show, q: search.q };
}

function reportOf(search: Search) {
  return { periodId: search.periodId, by: search.by, q: search.q };
}

const TAB_LABEL: Record<Tab, () => string> = {
  registers: m.attTabRegisters,
  desk: m.deskTab,
  follow: m.fupTab,
  absences: m.attTabAbsences,
  reported: m.repInbox,
  reports: m.attTabReports,
};

function AdminAttendancePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const patch = (change: Partial<Search>) =>
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  return (
    <>
      <PageHeader
        title={m.attendanceTitle()}
        description={m.attAdminHint()}
        menu={[
          {
            label: m.attRulesTitle(),
            icon: Settings,
            onSelect: () =>
              void navigate({
                to: "/admin/settings",
                search: { section: "attendance" },
              }),
          },
        ]}
      />
      <RecordTabs
        label={m.attendanceTitle()}
        tabs={TABS.map((value) => ({ value, label: TAB_LABEL[value]() }))}
        value={search.tab}
        onChange={(tab) => void navigate({ search: { tab } })}
      >
        {search.tab === "registers" ? (
          <Board
            date={search.date}
            states={search.states}
            onChange={(change) => patch(change)}
          />
        ) : search.tab === "desk" ? (
          <FrontDesk date={search.date} onDate={(date) => patch({ date })} />
        ) : search.tab === "follow" ? (
          <FollowUp date={search.date} onDate={(date) => patch({ date })} />
        ) : search.tab === "absences" ? (
          <Absences query={absencesOf(search)} onChange={patch} />
        ) : search.tab === "reported" ? (
          <ReportInbox
            view={search.inbox}
            onView={(inbox) => patch({ inbox })}
          />
        ) : (
          <Report query={reportOf(search)} onChange={patch} />
        )}
      </RecordTabs>
    </>
  );
}
