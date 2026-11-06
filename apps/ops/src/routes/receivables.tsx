import type { AgingBucket } from "@faridalms/domain/dunning";
import type { Currency } from "@faridalms/domain/subscriptions";

import { AGING_BUCKETS } from "@faridalms/domain/dunning";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { Metric, MetricGrid } from "@faridalms/ui/system/metrics";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useDesignSystem } from "@faridalms/ui/system/provider";
import { RecordSection } from "@faridalms/ui/system/record-page";
import { StatusBadge } from "@faridalms/ui/system/status";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@faridalms/ui/table";
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
        <section aria-label="Owed by age" className="grid gap-3">
          <h2 className="text-base leading-6 font-semibold">Owed by age</h2>
          {data.rows.length ? (
            <div className="overflow-hidden rounded-lg border bg-card">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-muted/40">
                    <TableRow>
                      <TableHead className="h-10 ps-4">Customer</TableHead>
                      {AGING_BUCKETS.map((bucket) => (
                        <TableHead key={bucket} className="h-10 text-end">
                          {AGING_BUCKET_NAMES[bucket]}
                        </TableHead>
                      ))}
                      <TableHead className="h-10 pe-4">Oldest</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((row) => (
                      <TableRow key={row.customerId} className="h-12">
                        <TableCell className="ps-4">
                          <span className="flex flex-wrap items-center gap-2">
                            <Link
                              to="/customers/$customerId"
                              params={{ customerId: row.customerId }}
                              className="font-medium hover:text-primary hover:underline"
                            >
                              {row.customerName}
                            </Link>
                            {row.held ? (
                              <StatusBadge tone="danger">
                                {STANDING_NAMES[row.held]}
                              </StatusBadge>
                            ) : null}
                            {row.pausedUntil ? (
                              <StatusBadge tone="info">
                                Paused until {formatDay(row.pausedUntil)}
                              </StatusBadge>
                            ) : null}
                          </span>
                        </TableCell>
                        {AGING_BUCKETS.map((bucket) => (
                          <TableCell
                            key={bucket}
                            className="text-end tabular-nums"
                          >
                            {row.buckets[bucket]
                              ? formatMoney(row.buckets[bucket], row.currency)
                              : ""}
                          </TableCell>
                        ))}
                        <TableCell className="pe-4 text-muted-foreground">
                          {row.oldest ? (
                            <>
                              <Link
                                to="/invoices/$invoiceId"
                                params={{ invoiceId: row.oldest.invoiceId }}
                                className="text-foreground hover:text-primary hover:underline"
                              >
                                {row.oldest.number}
                              </Link>
                              {row.oldest.step
                                ? `, ${DUNNING_STEP_NAMES[row.oldest.step]}`
                                : ""}
                            </>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                    {totals.map(([currency, buckets]) => (
                      <TableRow
                        key={currency}
                        className="h-12 bg-muted/40 font-medium"
                      >
                        <TableCell className="ps-4">
                          Total in {currency}
                        </TableCell>
                        {AGING_BUCKETS.map((bucket) => (
                          <TableCell
                            key={bucket}
                            className="text-end tabular-nums"
                          >
                            {formatMoney(buckets[bucket], currency)}
                          </TableCell>
                        ))}
                        <TableCell className="pe-4" />
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Wallet}
              title="Nothing is owed"
              description="Every issued invoice is paid."
            />
          )}
        </section>
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
