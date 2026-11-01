import type { FunnelStage } from "@faridalms/domain/admissions";

import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { ChartColumn } from "lucide-react";
import * as v from "valibot";

import type { Column } from "~/components/system/DataTable";

import {
  APPLICATION_STATE_LABEL,
  ORIGIN_LABEL,
  STAGE_LABEL,
} from "~/components/admissions/application-labels";
import { DataTable } from "~/components/system/DataTable";
import { IndexToolbar, PageHeader } from "~/components/system/IndexPage";
import { RecordSection } from "~/components/system/RecordPage";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { admissionReportsQuery } from "~/queries/admissions";
import { currentUserQuery } from "~/queries/user";
import { formatNumber } from "~/utils/datetime";
import { requirePage } from "~/utils/page-access";

const searchSchema = v.object({
  year: v.optional(v.union([v.literal(""), v.pipe(v.string(), v.uuid())]), ""),
});
const DEFAULT_SEARCH = v.parse(searchSchema, {});

export const Route = createFileRoute("/_app/admissions/reports")({
  staticData: { breadcrumb: m.adrTitle },
  validateSearch: searchSchema,
  search: { middlewares: [stripSearchParams(DEFAULT_SEARCH)] },
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "admissions:read", "admissions:manage");
    await context.queryClient.ensureQueryData(admissionReportsQuery(deps.year));
  },
  component: ReportsPage,
});

type Report = Awaited<
  ReturnType<NonNullable<ReturnType<typeof admissionReportsQuery>["queryFn"]>>
>;
type Funnel = Report["funnel"];

const countAt = (funnel: Funnel, stage: FunnelStage) =>
  funnel.find((row) => row.stage === stage)?.count ?? 0;

/** How many applications reached each stage, as bars against those sent. */
function FunnelBars({ funnel }: { funnel: Funnel }) {
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

const days = (value: number | null) =>
  value === null ? m.adrNoTime() : m.adrDays({ days: formatNumber(value) });

/**
 * A year's admissions in numbers: how far applications got, by grade and
 * intake and by where the family came from, and how long applications
 * wait in each state.
 */
function ReportsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const report = useSuspenseQuery(admissionReportsQuery(search.year)).data;
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
    <>
      <PageHeader title={m.adrTitle()} description={m.adrHint()} />
      <div className="mb-6">
        <IndexToolbar
          facets={[
            {
              id: "year",
              label: m.itkFieldYear(),
              single: true,
              defaultSelected: [report.yearId ?? ""],
              selected: [report.yearId ?? ""],
              options: report.years.map((year) => ({
                value: year.id,
                label: inLocale(year.titleEn, year.titleAr),
              })),
              onChange: ([year]) =>
                void navigate({ search: { year: year ?? "" } }),
            },
          ]}
          onReset={() => void navigate({ search: {} })}
        />
      </div>
      <div className="grid gap-6">
        <RecordSection
          title={m.adrFunnel()}
          description={m.adrFunnelHint({ count: formatNumber(report.total) })}
        >
          <FunnelBars funnel={report.funnel} />
        </RecordSection>
        <RecordSection title={m.adrByIntake()}>
          <DataTable
            caption={m.adrByIntake()}
            rows={intakes}
            columns={stageColumns<IntakeRow>({
              id: "grade",
              header: m.aplColGrade(),
              primary: true,
              cell: (row) =>
                m.adrGradePlaces({
                  grade: inLocale(row.gradeEn, row.gradeAr),
                  places: formatNumber(row.capacity),
                }),
            })}
            rowLabel={(row) => inLocale(row.gradeEn, row.gradeAr)}
            card={{
              title: (row) => inLocale(row.gradeEn, row.gradeAr),
              fact: (row) =>
                m.adrCardFact({
                  sent: formatNumber(countAt(row.funnel, "submitted")),
                  enrolled: formatNumber(countAt(row.funnel, "enrolled")),
                }),
            }}
            empty={{ icon: ChartColumn, title: m.adrEmpty() }}
          />
        </RecordSection>
        <RecordSection
          title={m.adrByOrigin()}
          description={m.adrByOriginHint()}
        >
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
        </RecordSection>
        <RecordSection title={m.adrTimes()} description={m.adrTimesHint()}>
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
        </RecordSection>
      </div>
    </>
  );
}
