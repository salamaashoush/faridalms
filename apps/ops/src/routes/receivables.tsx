import type { AgingBucket } from "@faridalms/domain/dunning";
import type { Currency } from "@faridalms/domain/subscriptions";

import { AGING_BUCKETS } from "@faridalms/domain/dunning";
import { Badge } from "@faridalms/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@faridalms/ui/table";
import { createFileRoute, Link } from "@tanstack/react-router";

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

function Receivables() {
  const data = Route.useLoaderData();
  const totals = totalsOf(data.rows);
  return (
    <div className="grid gap-8">
      <div className="grid gap-1">
        <Link
          to="/billing"
          className="text-sm text-muted-foreground hover:underline"
        >
          Billing
        </Link>
        <h1 className="text-2xl font-semibold">Receivables</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          What each customer owes, by how long ago it fell due. The daily round
          reminds billing contacts a week before an invoice is due and on the
          day, then after 7 and 14 days, when the account owner is asked to
          call. A school is restricted at 30 days, read-only at 60 and suspended
          at 90, each at the start of its weekend and after a notice; paying
          gives access back at once.
        </p>
      </div>

      <section aria-label="Owed by age" className="grid gap-3">
        <h2 className="text-base font-semibold">Owed by age</h2>
        {data.rows.length ? (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  {AGING_BUCKETS.map((bucket) => (
                    <TableHead key={bucket} className="text-end">
                      {AGING_BUCKET_NAMES[bucket]}
                    </TableHead>
                  ))}
                  <TableHead>Oldest</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row) => (
                  <TableRow key={row.customerId}>
                    <TableCell>
                      <Link
                        to="/customers/$customerId"
                        params={{ customerId: row.customerId }}
                        className="font-medium underline"
                      >
                        {row.customerName}
                      </Link>
                      <span className="ms-2 inline-flex flex-wrap gap-1">
                        {row.held ? (
                          <Badge variant="outline">
                            {STANDING_NAMES[row.held]}
                          </Badge>
                        ) : null}
                        {row.pausedUntil ? (
                          <Badge variant="secondary">
                            Paused until {formatDay(row.pausedUntil)}
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    {AGING_BUCKETS.map((bucket) => (
                      <TableCell key={bucket} className="text-end tabular-nums">
                        {row.buckets[bucket]
                          ? formatMoney(row.buckets[bucket], row.currency)
                          : ""}
                      </TableCell>
                    ))}
                    <TableCell className="text-muted-foreground">
                      {row.oldest ? (
                        <>
                          <Link
                            to="/invoices/$invoiceId"
                            params={{ invoiceId: row.oldest.invoiceId }}
                            className="underline"
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
                  <TableRow key={currency} className="font-medium">
                    <TableCell>Total in {currency}</TableCell>
                    {AGING_BUCKETS.map((bucket) => (
                      <TableCell key={bucket} className="text-end tabular-nums">
                        {formatMoney(buckets[bucket], currency)}
                      </TableCell>
                    ))}
                    <TableCell />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nothing is owed.</p>
        )}
      </section>

      <section aria-label="Calls to make" className="grid max-w-3xl gap-3">
        <h2 className="text-base font-semibold">Calls to make</h2>
        <TaskList
          rows={data.calls}
          names={data.names}
          today={data.today}
          showCustomer
        />
      </section>
    </div>
  );
}
