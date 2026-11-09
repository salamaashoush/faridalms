import type {
  ApplicationListQuery,
  ApplicationView,
} from "@faridalms/domain/admissions";
import type { Column } from "@faridalms/ui/system/data-table";

import {
  applicationListSchema,
  LIVE_STATES,
} from "@faridalms/domain/admissions";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import { Value } from "@faridalms/ui/system/value";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { FileUser } from "lucide-react";
import * as v from "valibot";

import {
  APPLICATION_STATE_LABEL,
  APPLICATION_STATE_TONE,
  PRIORITY_LABEL,
} from "~/components/admissions/application-labels";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { applicationsQuery } from "~/queries/admissions";
import { currentUserQuery } from "~/queries/user";
import {
  formatInstant,
  formatDate,
  formatList,
  formatNumber,
} from "~/utils/datetime";
import { requirePage } from "~/utils/page-access";

const DEFAULT_SEARCH = v.parse(applicationListSchema, {});

export const Route = createFileRoute("/_app/admissions/applications/")({
  staticData: { breadcrumb: m.aplTitle },
  validateSearch: applicationListSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "admissions:read", "admissions:manage");
    await context.queryClient.ensureQueryData(applicationsQuery(deps));
  },
  component: ApplicationsPage,
});

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof applicationsQuery>["queryFn"]>>
>;
type Row = Data["rows"][number];

interface ChildProps {
  row: Row;
}

function Child({ row }: ChildProps) {
  return (
    <span className="grid min-w-0 gap-0.5">
      <RowLink
        to="/admissions/applications/$applicationId"
        params={{ applicationId: row.id }}
        className="justify-self-start"
      >
        {inLocale(row.applicantEn, row.applicantAr)}
      </RowLink>
      <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
        {row.reference ? <bdi dir="ltr">{row.reference}</bdi> : m.aplNoNumber()}
        {row.birthDate
          ? ` · ${m.aplBorn({ date: formatDate(row.birthDate) })}`
          : ""}
      </span>
    </span>
  );
}

interface StateProps {
  row: Row;
}

const State = ({ row }: StateProps) => (
  <StatusText tone={APPLICATION_STATE_TONE[row.state]}>
    {APPLICATION_STATE_LABEL[row.state]()}
  </StatusText>
);

function columns(): Column<Row>[] {
  return [
    {
      id: "child",
      header: m.aplColChild(),
      primary: true,
      cell: (row) => <Child row={row} />,
    },
    {
      id: "grade",
      header: m.aplColGrade(),
      cell: (row) => inLocale(row.gradeEn, row.gradeAr),
    },
    {
      id: "family",
      header: m.aplColFamily(),
      cell: (row) => <bdi>{inLocale(row.familyEn, row.familyAr)}</bdi>,
    },
    {
      id: "priorities",
      header: m.aplColPriorities(),
      cell: (row) =>
        row.priorities.length ? (
          formatList(row.priorities.map((rule) => PRIORITY_LABEL[rule]()))
        ) : (
          <Value absent={m.aplNoPriority()} />
        ),
    },
    {
      id: "outstanding",
      header: m.aplColOutstanding(),
      cell: (row) =>
        row.outstanding ? (
          <StatusText tone="warning">
            {m.aplOutstanding({ count: formatNumber(row.outstanding) })}
          </StatusText>
        ) : (
          <StatusText tone="success">{m.aplChecklistDone()}</StatusText>
        ),
    },
    {
      id: "sent",
      header: m.aplColSent(),
      cell: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {row.submittedAt ? formatInstant(row.submittedAt) : m.aplNotSent()}
        </span>
      ),
    },
    {
      id: "state",
      header: m.aplColState(),
      cell: (row) => <State row={row} />,
    },
  ];
}

const CARD = {
  title: (row: Row) => <Child row={row} />,
  status: (row: Row) => <State row={row} />,
  fact: (row: Row) =>
    `${inLocale(row.gradeEn, row.gradeAr)} · ${inLocale(row.familyEn, row.familyAr)}`,
};

const VIEWS: ApplicationView[] = [
  "live",
  "submitted",
  "in_review",
  "draft",
  "withdrawn",
  "all",
];

const viewLabel = (view: ApplicationView) =>
  view === "live"
    ? m.aplViewLive()
    : view === "all"
      ? m.aplViewAll()
      : APPLICATION_STATE_LABEL[view]();

function ApplicationsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const data = useSuspenseQuery(applicationsQuery(search)).data;
  const update = (next: Partial<ApplicationListQuery>) =>
    void navigate({
      search: (previous) => ({ ...previous, page: 1, ...next }),
    });
  // States with no application are missing from the counts, not zero.
  const counts: Partial<Record<string, number>> = data.counts;
  const countOf = (state: string) => counts[state] ?? 0;
  const count = (view: ApplicationView) =>
    view === "all"
      ? Object.values(data.counts).reduce((sum, n) => sum + n, 0)
      : view === "live"
        ? LIVE_STATES.reduce((sum, state) => sum + countOf(state), 0)
        : countOf(view);
  const intake = data.intakes.find((row) => row.id === search.intake);
  return (
    <>
      <PageHeader
        title={m.aplTitle()}
        count={search.q ? undefined : count("live")}
        description={
          intake
            ? m.aplPlaces({
                grade: inLocale(intake.gradeEn, intake.gradeAr),
                places: formatNumber(intake.capacity),
                live: formatNumber(intake.live),
              })
            : m.aplHint()
        }
      />
      <RecordTabs
        label={m.aplViews()}
        tabs={VIEWS.map((value) => ({
          value,
          label:
            value === "all"
              ? viewLabel(value)
              : m.admViewCount({
                  view: viewLabel(value),
                  count: formatNumber(count(value)),
                }),
        }))}
        value={search.state}
        onChange={(state) => update({ state })}
      >
        <div className="grid gap-4">
          <IndexToolbar
            search={{
              value: search.q,
              onChange: (q) => update({ q }),
              label: m.aplSearch(),
              placeholder: m.aplSearchPlaceholder(),
            }}
            facets={[
              {
                id: "year",
                label: m.itkFieldYear(),
                single: true,
                defaultSelected: [data.yearId ?? ""],
                selected: [search.year || (data.yearId ?? "")],
                options: data.years.map((year) => ({
                  value: year.id,
                  label: inLocale(year.titleEn, year.titleAr),
                })),
                onChange: ([year]) => update({ year: year ?? "", intake: "" }),
              },
              {
                id: "intake",
                label: m.aplColGrade(),
                single: true,
                defaultSelected: [""],
                selected: [search.intake],
                options: [
                  { value: "", label: m.aplAnyGrade() },
                  ...data.intakes.map((row) => ({
                    value: row.id,
                    label: inLocale(row.gradeEn, row.gradeAr),
                  })),
                ],
                onChange: ([intakeId]) => update({ intake: intakeId ?? "" }),
              },
            ]}
            onReset={() => void navigate({ search: { state: search.state } })}
          />
          <DataTable
            caption={m.aplCaption({ view: viewLabel(search.state) })}
            rows={data.rows}
            columns={columns()}
            rowLabel={(row) => inLocale(row.applicantEn, row.applicantAr)}
            card={CARD}
            pagination={{
              page: data.page,
              pages: data.pages,
              total: data.total,
              pageSize: data.pageSize,
              onPage: (page) =>
                void navigate({
                  search: (previous) => ({ ...previous, page }),
                }),
            }}
            empty={{
              icon: FileUser,
              title: m.aplEmpty({ view: viewLabel(search.state) }),
              description: m.aplEmptyBody(),
            }}
          />
        </div>
      </RecordTabs>
    </>
  );
}
