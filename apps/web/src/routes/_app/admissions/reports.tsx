import type { FunnelStage } from "@faridalms/domain/admissions";
import type { Column } from "@faridalms/ui/system/data-table";

import { DataTable } from "@faridalms/ui/system/data-table";
import { IndexToolbar } from "@faridalms/ui/system/index-toolbar";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordTabs } from "@faridalms/ui/system/record-page";
import { useSuspenseQueries, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { ChartColumn } from "lucide-react";
import * as v from "valibot";

import {
  APPLICATION_STATE_LABEL,
  ORIGIN_LABEL,
  STAGE_LABEL,
} from "~/components/admissions/application-labels";
import { intakeFilters } from "~/components/admissions/slots";
import { viewsOf, viewValue } from "~/components/classes/slots";
import { inLocale } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { admissionReportsQuery } from "~/queries/admissions";
import { currentUserQuery } from "~/queries/user";
import { formatNumber } from "~/utils/datetime";
import { filled } from "~/utils/extension";
import { requirePage } from "~/utils/page-access";

const REPORTS = ["stage", "intake", "origin", "time"] as const;
type ReportView = (typeof REPORTS)[number];

const REPORT_LABEL: Record<ReportView, () => string> = {
  stage: m.adrTabStage,
  intake: m.adrByIntake,
  origin: m.adrTabOrigin,
  time: m.adrTimes,
};

// Loose, so a module's view rides in the address under its own key.
const searchSchema = v.looseObject({
  report: v.fallback(v.optional(v.picklist(REPORTS), "stage"), "stage"),
});
const DEFAULT_SEARCH = v.parse(searchSchema, {});

export const Route = createFileRoute("/_app/admissions/reports")({
  staticData: { breadcrumb: m.navAdmissionReports },
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "admissions:read", "admissions:manage");
    const filters = filled(context.extensions, user.modules, intakeFilters);
    await Promise.all([
      context.queryClient.ensureQueryData(
        admissionReportsQuery(viewsOf(filters, deps)),
      ),
      ...filters.map((filter) =>
        context.queryClient.ensureQueryData(filter.query()),
      ),
    ]);
  },
  component: ReportsPage,
});

type Report = Awaited<
  ReturnType<NonNullable<ReturnType<typeof admissionReportsQuery>["queryFn"]>>
>;
type Funnel = Report["funnel"];

const countAt = (funnel: Funnel, stage: FunnelStage) =>
  funnel.find((row) => row.stage === stage)?.count ?? 0;

interface FunnelBarsProps {
  funnel: Funnel;
}

/** How many applications reached each stage, as bars against those sent. */
function FunnelBars({ funnel }: FunnelBarsProps) {
  const sent = countAt(funnel, "submitted");
  return (
    <ol className="grid gap-3">
      {funnel.map((row) => {
        const share = sent ? Math.round((row.count / sent) * 100) : 0;
        return (
          <li key={row.stage} className="grid gap-1">
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{STAGE_LABEL[row.stage]()}</span>
              <span className="text-muted-foreground tabular-nums">
                {m.adrReached({
                  count: formatNumber(row.count),
                  share: formatNumber(share),
                })}
              </span>
            </span>
            <span
              aria-hidden
              className="block h-2 overflow-hidden rounded-full bg-muted"
            >
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${String(share)}%` }}
              />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const stageColumns = <T extends { funnel: Funnel }>(
  first: Column<T>,
): Column<T>[] => [
  first,
  ...(["submitted", "decided", "offered", "accepted", "enrolled"] as const).map(
    (stage) => ({
      id: stage,
      header: STAGE_LABEL[stage](),
      cell: (row: T) => formatNumber(countAt(row.funnel, stage)),
    }),
  ),
];

type IntakeRow = Report["byIntake"][number] & { id: string };
type OriginRow = Report["byOrigin"][number] & { id: string };
type TimeRow = Report["times"][number] & { id: string };

interface MeasureProps {
  children: string;
}

/** What a report counts, where its numbers need saying how they are made. */
function Measure({ children }: MeasureProps) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

const days = (value: number | null) =>
  value === null ? m.adrNoTime() : m.adrDays({ days: formatNumber(value) });

/**
 * Admissions in numbers, one report a tab: how far applications got, by
 * intake and by where the family came from, and how long applications wait
 * in each state. A module's view chosen (a year, say) holds across the tabs.
 */
function ReportsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const filters = useSlot(intakeFilters);
  const views = viewsOf(filters, search);
  const report = useSuspenseQuery(admissionReportsQuery(views)).data;
  const reads = useSuspenseQueries({
    queries: filters.map((filter) => filter.query()),
  });
  const facets = filters.flatMap((filter, index) => {
    const facet = filter.facetOf(
      reads[index]?.data,
      viewValue(search[filter.key]),
      (value) =>
        void navigate({
          search: (previous) => ({ ...previous, [filter.key]: value }),
        }),
    );
    return facet ? [facet] : [];
  });
  const intakes: IntakeRow[] = report.byIntake.map((row) => ({
    ...row,
    id: row.intakeId,
  }));
  const origins: OriginRow[] = report.byOrigin.map((row) => ({
    ...row,
    id: row.origin,
  }));
  const times: TimeRow[] = report.times.map((row) => ({
    ...row,
    id: row.state,
  }));
  return (
    <Page width="list">
      <PageHeader title={m.adrTitle()} description={m.adrHint()} />
      {facets.length > 0 ? (
        <div className="mb-6">
          <IndexToolbar
            facets={facets}
            onReset={() =>
              void navigate({
                search: (previous) => ({ report: previous.report }),
              })
            }
          />
        </div>
      ) : null}
      <RecordTabs
        label={m.adrTitle()}
        tabs={REPORTS.map((value) => ({ value, label: REPORT_LABEL[value]() }))}
        value={search.report}
        onChange={(next) =>
          void navigate({
            resetScroll: false,
            replace: true,
            search: (previous) => ({ ...previous, report: next }),
          })
        }
      >
        {search.report === "stage" ? (
          <div className="grid gap-4">
            <Measure>
              {m.adrFunnelHint({ count: formatNumber(report.total) })}
            </Measure>
            <FunnelBars funnel={report.funnel} />
          </div>
        ) : search.report === "intake" ? (
          <DataTable
            caption={m.adrByIntake()}
            rows={intakes}
            columns={stageColumns<IntakeRow>({
              id: "intake",
              header: m.aplColIntake(),
              primary: true,
              cell: (row) =>
                m.adrGradePlaces({
                  intake: inLocale(row.titleEn, row.titleAr),
                  places: formatNumber(row.capacity),
                }),
            })}
            rowLabel={(row) => inLocale(row.titleEn, row.titleAr)}
            card={{
              title: (row) => inLocale(row.titleEn, row.titleAr),
              fact: (row) =>
                m.adrCardFact({
                  sent: formatNumber(countAt(row.funnel, "submitted")),
                  enrolled: formatNumber(countAt(row.funnel, "enrolled")),
                }),
            }}
            empty={{ icon: ChartColumn, title: m.adrEmpty() }}
          />
        ) : search.report === "origin" ? (
          <div className="grid gap-4">
            <Measure>{m.adrByOriginHint()}</Measure>
            <DataTable
              caption={m.adrByOrigin()}
              rows={origins}
              columns={stageColumns<OriginRow>({
                id: "origin",
                header: m.adrOrigin(),
                primary: true,
                cell: (row) => ORIGIN_LABEL[row.origin](),
              })}
              rowLabel={(row) => ORIGIN_LABEL[row.origin]()}
              card={{
                title: (row) => ORIGIN_LABEL[row.origin](),
                fact: (row) =>
                  m.adrCardFact({
                    sent: formatNumber(countAt(row.funnel, "submitted")),
                    enrolled: formatNumber(countAt(row.funnel, "enrolled")),
                  }),
              }}
              empty={{ icon: ChartColumn, title: m.adrEmpty() }}
            />
          </div>
        ) : (
          <div className="grid gap-4">
            <Measure>{m.adrTimesHint()}</Measure>
            <DataTable
              caption={m.adrTimes()}
              rows={times}
              columns={[
                {
                  id: "state",
                  header: m.aplColState(),
                  primary: true,
                  cell: (row) => APPLICATION_STATE_LABEL[row.state](),
                },
                {
                  id: "median",
                  header: m.adrMedian(),
                  cell: (row) => days(row.medianDays),
                },
                {
                  id: "average",
                  header: m.adrAverage(),
                  cell: (row) => days(row.averageDays),
                },
                {
                  id: "left",
                  header: m.adrLeft(),
                  cell: (row) => formatNumber(row.left),
                },
                {
                  id: "current",
                  header: m.adrCurrent(),
                  cell: (row) => formatNumber(row.current),
                },
              ]}
              rowLabel={(row) => APPLICATION_STATE_LABEL[row.state]()}
              card={{
                title: (row) => APPLICATION_STATE_LABEL[row.state](),
                fact: (row) => m.adrMedianFact({ days: days(row.medianDays) }),
              }}
              empty={{ icon: ChartColumn, title: m.adrEmpty() }}
            />
          </div>
        )}
      </RecordTabs>
    </Page>
  );
}
