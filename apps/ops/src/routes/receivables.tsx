import type { AgingBucket } from "@faridalms/domain/dunning";
import type { Currency } from "@faridalms/domain/subscriptions";
import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";

import { AGING_BUCKETS } from "@faridalms/domain/dunning";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { Metric, MetricGrid } from "@faridalms/ui/system/metrics";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useDesignSystem } from "@faridalms/ui/system/provider";
import { RecordSection } from "@faridalms/ui/system/record-page";
import { StatusBadge } from "@faridalms/ui/system/status";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Wallet } from "lucide-react";

import { TaskList } from "../components/TaskList";
import {
  AGING_BUCKET_NAMES,
  DUNNING_STEP_NAMES,
  formatDay,
  formatMoney,
  STANDING_NAMES,
} from "../format";
import { getReceivables } from "../server/receivables";

export const Route = createFileRoute("/receivables")({
  staticData: { title: "Receivables" },
  loader: () => getReceivables(),
  component: Receivables,
});

type Data = Awaited<ReturnType<typeof getReceivables>>;

/** Each currency's amounts owed across every customer, by age. */
function totalsOf(rows: Data["rows"]) {
  const totals = new Map<Currency, Record<AgingBucket, number>>();
  for (const row of rows) {
    const held =
      totals.get(row.currency) ??
      (Object.fromEntries(AGING_BUCKETS.map((bucket) => [bucket, 0])) as Record<
        AgingBucket,
        number
      >);
    for (const bucket of AGING_BUCKETS) held[bucket] += row.buckets[bucket];
    totals.set(row.currency, held);
  }
  return [...totals];
}

type Owing = Data["rows"][number] & { id: string };

const COLUMNS: Column<Owing>[] = [
  {
    id: "customer",
    header: "Customer",
    primary: true,
    cell: (row) => (
      <span className="flex min-w-0 items-center gap-2">
        <RowLink
          to="/customers/$customerId"
          params={{ customerId: row.customerId }}
        >
          {row.customerName}
        </RowLink>
        <Held row={row} />
      </span>
    ),
  },
  ...AGING_BUCKETS.map((bucket): Column<Owing> => ({
    id: bucket,
    header: AGING_BUCKET_NAMES[bucket],
    align: "end",
    cell: (row) =>
      row.buckets[bucket] ? formatMoney(row.buckets[bucket], row.currency) : "",
  })),
  {
    id: "oldest",
    header: "Oldest",
    cell: (row) =>
      row.oldest ? (
        <span className="text-muted-foreground">
          <Link
            to="/invoices/$invoiceId"
            params={{ invoiceId: row.oldest.invoiceId }}
            className="relative text-foreground hover:text-primary hover:underline"
          >
            {row.oldest.number}
          </Link>
          {row.oldest.step ? `, ${DUNNING_STEP_NAMES[row.oldest.step]}` : ""}
        </span>
      ) : null,
  },
];

const CARD: DataTableCard<Owing> = {
  title: (row) => (
    <RowLink
      to="/customers/$customerId"
      params={{ customerId: row.customerId }}
    >
      {row.customerName}
    </RowLink>
  ),
  status: (row) => <Held row={row} />,
  fact: (row) =>
    formatMoney(
      AGING_BUCKETS.reduce((sum, bucket) => sum + row.buckets[bucket], 0),
      row.currency,
    ),
};

interface HeldProps {
  row: Owing;
}

/** Whether the clock has held back the customer's schools, and any pause of it. */
function Held({ row }: HeldProps) {
  if (!row.held && !row.pausedUntil) return null;
  return (
    <span className="flex flex-wrap gap-1.5">
      {row.held ? (
        <StatusBadge tone="danger">{STANDING_NAMES[row.held]}</StatusBadge>
      ) : null}
      {row.pausedUntil ? (
        <StatusBadge tone="info">
          Paused until {formatDay(row.pausedUntil)}
        </StatusBadge>
      ) : null}
    </span>
  );
}

/**
 * What each customer owes, by how long ago it fell due, with the calls the
 * account owners are asked to make.
 */
function Receivables() {
  const data = Route.useLoaderData();
  const { formatNumber } = useDesignSystem();
  const totals = totalsOf(data.rows);
  return (
    <>
      <PageHeader
        title="Receivables"
        description="Reminders go a week before an invoice is due, on the day, then after 7 and 14 days. A school is restricted at 30 days, read-only at 60 and suspended at 90, each at the start of its weekend; paying gives access back at once."
      />
      <div className="grid gap-6">
        {totals.length ? (
          <MetricGrid label="Totals">
            {totals.map(([currency, buckets]) => {
              const all = AGING_BUCKETS.reduce(
                (sum, bucket) => sum + buckets[bucket],
                0,
              );
              const late = all - buckets[AGING_BUCKETS[0]];
              return (
                <Metric
                  key={currency}
                  label={`Owed in ${currency}`}
                  value={formatMoney(all, currency)}
                  detail={
                    late
                      ? {
                          text: `${formatMoney(late, currency)} past due`,
                          tone: "danger",
                        }
                      : { text: "None past due" }
                  }
                />
              );
            })}
            <Metric
              label="Customers who owe"
              value={formatNumber(data.rows.length)}
            />
            <Metric
              label="Calls to make"
              value={formatNumber(data.calls.length)}
            />
          </MetricGrid>
        ) : null}
        <div className="grid gap-3">
          <h2 className="text-base leading-6 font-semibold">Owed by age</h2>
          <DataTable
            caption="Owed by age"
            rows={data.rows.map((row) => ({ ...row, id: row.customerId }))}
            columns={COLUMNS}
            rowLabel={(row) => row.customerName}
            card={CARD}
            totals={totals.map(([currency, buckets]) => ({
              id: currency,
              label: `Total in ${currency}`,
              cells: Object.fromEntries(
                AGING_BUCKETS.map((bucket) => [
                  bucket,
                  formatMoney(buckets[bucket], currency),
                ]),
              ),
            }))}
            empty={{
              icon: Wallet,
              title: "Nothing is owed",
              description: "Every issued invoice is paid.",
            }}
          />
        </div>
        <RecordSection
          title="Calls to make"
          description="Asked of each account owner when an invoice is two weeks overdue."
        >
          <TaskList
            rows={data.calls}
            names={data.names}
            today={data.today}
            showCustomer
          />
        </RecordSection>
      </div>
    </>
  );
}
