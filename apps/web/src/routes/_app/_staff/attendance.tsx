import type { Capability } from "@faridalms/domain/capabilities";

import {
  absencesQuerySchema,
  reportQuerySchema,
} from "@faridalms/domain/attendance";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import * as v from "valibot";

import { Absences } from "~/components/attendance/Absences";
import { Board } from "~/components/attendance/Board";
import { FollowUp } from "~/components/attendance/FollowUp";
import { FrontDesk } from "~/components/attendance/FrontDesk";
import { MyRegisters } from "~/components/attendance/MyRegisters";
import { Report } from "~/components/attendance/Report";
import { ReportInbox } from "~/components/attendance/ReportInbox";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { loadTeaches, useTeaches } from "~/hooks/useTeaches";
import * as m from "~/i18n/messages";
import {
  absenceReportInboxQuery,
  absencesQuery,
  attendanceBoardQuery,
  followUpQuery,
  frontDeskQuery,
  attendanceDayQuery,
  attendanceReportQuery,
} from "~/queries/attendance";
import { currentUserQuery } from "~/queries/user";
import { requirePage } from "~/utils/page-access";
import { useWords } from "~/utils/words";

const TABS = [
  "mine",
  "registers",
  "desk",
  "follow",
  "absences",
  "reported",
  "reports",
] as const;
type Tab = (typeof TABS)[number];
const SCHOOL_TABS = TABS.filter((tab) => tab !== "mine");

const searchSchema = v.object({
  tab: v.fallback(v.optional(v.picklist(TABS)), undefined),
  date: v.optional(
    v.union([v.literal(""), v.pipe(v.string(), v.isoDate())]),
    "",
  ),
  states: v.optional(
    v.array(v.picklist(["not_started", "in_progress", "submitted"])),
    [],
  ),
  ...absencesQuerySchema.entries,
  span: reportQuerySchema.entries.span,
  reportFrom: reportQuerySchema.entries.from,
  reportTo: reportQuerySchema.entries.to,
  by: reportQuerySchema.entries.by,
  inbox: v.fallback(
    v.optional(v.picklist(["waiting", "all"]), "waiting"),
    "waiting",
  ),
});
type Search = v.InferOutput<typeof searchSchema>;

const DEFAULT_SEARCH = v.parse(searchSchema, {});

export const Route = createFileRoute("/_app/_staff/attendance")({
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const { queryClient } = context;
    const [user, teaches] = await Promise.all([
      queryClient.ensureQueryData(currentUserQuery),
      loadTeaches(queryClient),
    ]);
    const tabs = tabsOf(user, teaches);
    requirePage(user, "attendance:record", "attendance:manage");
    const tab = tabOf(deps, tabs);
    if (tab === "mine")
      await queryClient.ensureQueryData(attendanceDayQuery(deps.date));
    else if (tab === "registers")
      await queryClient.ensureQueryData(attendanceBoardQuery(deps.date));
    else if (tab === "absences")
      await queryClient.ensureQueryData(absencesQuery(absencesOf(deps)));
    else if (tab === "desk")
      await queryClient.ensureQueryData(frontDeskQuery(deps.date));
    else if (tab === "follow")
      await queryClient.ensureQueryData(
        followUpQuery({ date: deps.date, overduePage: 1, supportPage: 1 }),
      );
    else if (tab === "reported")
      await queryClient.ensureQueryData(
        absenceReportInboxQuery(deps.inbox === "waiting"),
      );
    else
      await queryClient.ensureQueryData(attendanceReportQuery(reportOf(deps)));
  },
  component: AttendancePage,
});

/**
 * The viewer's own registers for whoever takes them, then the school's
 * attendance for whoever manages it; an overseer who teaches nothing is
 * not offered an empty register list.
 */
function tabsOf(
  user: { capabilities: readonly Capability[] },
  teaches: boolean,
): Tab[] {
  const records = user.capabilities.includes("attendance:record");
  const manages = user.capabilities.includes("attendance:manage");
  return [
    ...(records && (teaches || !manages) ? (["mine"] as const) : []),
    ...(manages ? SCHOOL_TABS : []),
  ];
}

function tabOf(search: Search, tabs: Tab[]): Tab {
  return search.tab && tabs.includes(search.tab)
    ? search.tab
    : (tabs[0] ?? "mine");
}

function absencesOf(search: Search) {
  return { from: search.from, to: search.to, show: search.show, q: search.q };
}

function reportOf(search: Search) {
  return {
    span: search.span,
    from: search.reportFrom,
    to: search.reportTo,
    by: search.by,
    q: search.q,
  };
}

/** A report's change as the address keeps it, apart from the absences' own dates. */
function reportChange({
  from,
  to,
  ...change
}: Partial<ReturnType<typeof reportOf>>): Partial<Search> {
  return {
    ...change,
    ...(from === undefined ? {} : { reportFrom: from }),
    ...(to === undefined ? {} : { reportTo: to }),
  };
}

const TAB_LABEL: Record<Tab, () => string> = {
  mine: m.attTabMine,
  registers: m.attTabRegisters,
  desk: m.deskTab,
  follow: m.fupTab,
  absences: m.attTabAbsences,
  reported: m.repInbox,
  reports: m.attTabReports,
};

function AttendancePage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const words = useWords();
  const tabs = tabsOf(user, useTeaches());
  const tab = tabOf(search, tabs);
  const manages = user.capabilities.includes("attendance:manage");
  const patch = (change: Partial<Search>) =>
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  return (
    <Page width="list">
      <PageHeader
        title={m.attendanceTitle()}
        description={
          tab === "mine" ? m.attTeacherHint() : words(m.attAdminHintCore)()
        }
        menu={
          manages
            ? [
                {
                  label: m.attRulesTitle(),
                  icon: Settings,
                  onSelect: () =>
                    void navigate({
                      to: "/settings",
                      search: { section: "attendance" },
                    }),
                },
              ]
            : undefined
        }
      />
      {tabs.length > 1 ? (
        <RecordTabs
          label={m.attendanceTitle()}
          tabs={tabs.map((value) => ({ value, label: TAB_LABEL[value]() }))}
          value={tab}
          onChange={(next) =>
            void navigate({
              resetScroll: false,
              replace: true,
              search: { tab: next },
            })
          }
        >
          <AttendanceTab tab={tab} search={search} patch={patch} />
        </RecordTabs>
      ) : (
        <AttendanceTab tab={tab} search={search} patch={patch} />
      )}
    </Page>
  );
}

interface AttendanceTabProps {
  tab: Tab;
  search: Search;
  patch: (change: Partial<Search>) => void;
}

function AttendanceTab({ tab, search, patch }: AttendanceTabProps) {
  return tab === "mine" ? (
    <MyRegisters date={search.date} onDate={(date) => patch({ date })} />
  ) : tab === "registers" ? (
    <Board
      date={search.date}
      states={search.states}
      onChange={(change) => patch(change)}
    />
  ) : tab === "desk" ? (
    <FrontDesk date={search.date} onDate={(date) => patch({ date })} />
  ) : tab === "follow" ? (
    <FollowUp date={search.date} onDate={(date) => patch({ date })} />
  ) : tab === "absences" ? (
    <Absences query={absencesOf(search)} onChange={patch} />
  ) : tab === "reported" ? (
    <ReportInbox view={search.inbox} onView={(inbox) => patch({ inbox })} />
  ) : (
    <Report
      query={reportOf(search)}
      onChange={(change) => patch(reportChange(change))}
    />
  );
}
