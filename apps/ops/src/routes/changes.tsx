import type { Facet } from "@faridalms/ui/system/index-toolbar";

import { RowLink } from "@faridalms/ui/system/data-table";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";

import type { ChangeLogQuery } from "../change-log";
import type { ChangeRecord } from "../server/directory";

import {
  CHANGE_PERIOD_NAMES,
  CHANGE_PERIODS,
  changeLogQuery,
  CHANGES_PER_PAGE,
} from "../change-log";
import { actorName, ChangeList } from "../components/ChangeList";
import { CHANGE_ACTION_NAMES } from "../format";
import { listChanges } from "../server/directory";

export const Route = createFileRoute("/changes")({
  validateSearch: changeLogQuery,
  search: {
    middlewares: [
      stripSearchParams({ q: "", action: [], by: [], when: "all", page: 1 }),
    ],
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listChanges({ data: deps }),
  component: Changes,
});

interface RecordCellProps {
  record: ChangeRecord;
}

/**
 * The record a change was made to, linked to where its changes are read:
 * a school's History tab, or the exam sessions. The part of it the change
 * touched, such as a web address, sits under it.
 */
function RecordCell({ record }: RecordCellProps) {
  const name = record.schoolId ? (
    <RowLink
      to="/schools/$schoolId"
      params={{ schoolId: record.schoolId }}
      search={{ tab: "history" }}
      className="whitespace-normal"
    >
      {record.name}
    </RowLink>
  ) : (
    <span dir="auto" className="block font-medium">
      {record.name}
    </span>
  );
  return (
    <span className="grid min-w-0">
      {name}
      {record.detail ? (
        <span
          dir="auto"
          className="truncate text-[13px] leading-[18px] text-muted-foreground"
        >
          {record.detail}
        </span>
      ) : null}
    </span>
  );
}

type LoggedChange = Awaited<ReturnType<typeof listChanges>>["changes"][number];

const recordCell = (change: LoggedChange) => (
  <RecordCell record={change.record} />
);

const byLabel = (a: { label: string }, b: { label: string }) =>
  a.label.localeCompare(b.label);

/**
 * The directory's audit log (GitHub's organisation audit log): every change
 * operators and the cells made to schools, their addresses and sign-in
 * domains, and the exam sessions, newest first. Filtering runs on the
 * server, so it covers the whole log rather than the page on screen.
 */
function Changes() {
  const { changes, total, counts, names, schoolNames, pages } =
    Route.useLoaderData();
  const query = Route.useSearch();
  const navigate = Route.useNavigate();
  const go = (patch: Partial<ChangeLogQuery>) =>
    void navigate({
      search: (previous) => ({ ...previous, page: 1, ...patch }),
      replace: true,
      resetScroll: false,
    });
  const facets: Facet[] = [
    {
      id: "action",
      label: "Change",
      options: counts.actions
        .map((row) => ({
          value: row.value,
          label: CHANGE_ACTION_NAMES[row.value] ?? row.value,
          count: row.count,
        }))
        .toSorted(byLabel),
      selected: query.action,
      onChange: (selected) => go({ action: selected }),
    },
    {
      id: "by",
      label: "By",
      options: counts.actors
        .map((row) => ({
          value: row.value,
          label: actorName(row.value, names),
          count: row.count,
        }))
        .toSorted(byLabel),
      selected: query.by,
      onChange: (selected) => go({ by: selected }),
    },
    {
      id: "when",
      label: "When",
      single: true,
      options: CHANGE_PERIODS.filter((period) => period !== "all").map(
        (period) => ({ value: period, label: CHANGE_PERIOD_NAMES[period] }),
      ),
      selected: query.when === "all" ? [] : [query.when],
      onChange: ([next]) => {
        const period = CHANGE_PERIODS.find((one) => one === next);
        go({ when: period ?? "all" });
      },
    },
  ];
  const toolbar = {
    search: {
      value: query.q,
      onChange: (q: string) => go({ q }),
      label: "Search changes",
      placeholder: "Search by school or reason",
    },
    facets,
    onReset: () => go({ q: "", action: [], by: [], when: "all" }),
  };
  return (
    <Page width="list">
      <PageHeader
        title="Changes"
        count={query.q ? undefined : counts.total}
        description="What operators and the platform changed on schools, their web addresses and the exam sessions, newest first."
      />
      <ChangeList
        changes={changes}
        names={names}
        schoolNames={schoolNames}
        record={recordCell}
        toolbar={toolbar}
        pagination={{
          page: query.page,
          pages,
          total,
          pageSize: CHANGES_PER_PAGE,
          onPage: (page) =>
            void navigate({ search: (previous) => ({ ...previous, page }) }),
        }}
      />
    </Page>
  );
}
