import type { AgingBucket } from "@faridalms/domain/dunning";
import type { Currency } from "@faridalms/domain/subscriptions";
import type { AttentionItem } from "@faridalms/ui/system/attention-list";
import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";

import { AGING_BUCKETS, STEP_DAY } from "@faridalms/domain/dunning";
import { AttentionList } from "@faridalms/ui/system/attention-list";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { Metric, MetricGrid } from "@faridalms/ui/system/metrics";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { StatusBadge } from "@faridalms/ui/system/status";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Wallet } from "lucide-react";

import { CloseTaskButton } from "../components/TaskList";
import {
  AGING_BUCKET_NAMES,
  DUNNING_STEP_NAMES,
  formatAmount,
  formatDay,
  formatMoney,
  STANDING_NAMES,
  STANDING_TONE,
} from "../format";
import { getReceivables } from "../server/receivables";

export const Route = createFileRoute("/receivables")({
  staticData: { title: "Receivables" },
  loader: () => getReceivables(),
  component: Receivables,
});

type Data = Awaited<ReturnType<typeof getReceivables>>;
type Owing = Data["rows"][number] & { id: string };
type Call = Data["calls"][number];

interface Sums {
  buckets: Record<AgingBucket, number>;
  owed: number;
}

/** Each currency's amounts owed across every customer, by age and in all. */
function totalsOf(rows: Data["rows"]): [Currency, Sums][] {
  const totals = new Map<Currency, Sums>();
  for (const row of rows) {
    const held = totals.get(row.currency) ?? {
      buckets: Object.fromEntries(
        AGING_BUCKETS.map((bucket) => [bucket, 0]),
      ) as Record<AgingBucket, number>,
      owed: 0,
    };
    for (const bucket of AGING_BUCKETS)
      held.buckets[bucket] += row.buckets[bucket];
    held.owed += row.owedMinor;
    totals.set(row.currency, held);
  }
  return [...totals];
}

interface AmountProps {
  minor: number;
  currency: Currency;
}

/**
 * An amount in an age column, its currency left to the row's total, so
 * six columns of money fit beside the customer; a bucket with nothing in
 * it is a quiet dash.
 */
function Amount({ minor, currency }: AmountProps) {
  if (minor) return formatAmount(minor, currency);
  return (
    <span className="text-muted-foreground">
      <span aria-hidden>–</span>
      <span className="sr-only">Nothing</span>
    </span>
  );
}

/**
 * Where the oldest unpaid invoice stands: a pause of its reminders, what
 * they have told or done to the school, how late it is, or when it falls due.
 */
function standsText(row: Owing): string {
  const { oldest } = row;
  if (!oldest) return "";
  if (row.pausedUntil)
    return `Reminders paused until ${formatDay(row.pausedUntil)}`;
  if (oldest.step && STEP_DAY[oldest.step] >= STEP_DAY.restrict_notice)
    return DUNNING_STEP_NAMES[oldest.step];
  if (oldest.days > 0)
    return `${oldest.days} ${oldest.days === 1 ? "day" : "days"} overdue`;
  return oldest.days === 0 ? "Due today" : `Due ${formatDay(oldest.dueOn)}`;
}

interface OldestProps {
  row: Owing;
}

/** The customer's oldest unpaid invoice, linked, and where its reminders stand. */
function Oldest({ row }: OldestProps) {
  if (!row.oldest) return null;
  return (
    <span
      title={`${row.oldest.number} · ${standsText(row)}`}
      className="truncate text-[13px] leading-[18px] text-muted-foreground"
    >
      <Link
        to="/invoices/$invoiceId"
        params={{ invoiceId: row.oldest.invoiceId }}
        className="relative hover:text-primary hover:underline"
      >
        {row.oldest.number}
      </Link>
      {` · ${standsText(row)}`}
    </span>
  );
}

interface AccessProps {
  row: Owing;
}

/** What the clock has taken from the customer's schools. */
function Access({ row }: AccessProps) {
  return row.held ? (
    <StatusBadge tone={STANDING_TONE[row.held]}>
      {STANDING_NAMES[row.held]}
    </StatusBadge>
  ) : (
    <span className="text-muted-foreground">Full</span>
  );
}

const COLUMNS: Column<Owing>[] = [
  {
    id: "customer",
    header: "Customer",
    primary: true,
    cell: (row) => (
      <span className="grid min-w-0 py-2">
        <RowLink
          to="/customers/$customerId"
          params={{ customerId: row.customerId }}
        >
          {row.customerName}
        </RowLink>
        <Oldest row={row} />
      </span>
    ),
  },
  {
    id: "access",
    header: "Access",
    cell: (row) => <Access row={row} />,
  },
  ...AGING_BUCKETS.map((bucket): Column<Owing> => ({
    id: bucket,
    header: AGING_BUCKET_NAMES[bucket],
    align: "end",
    cell: (row) => (
      <Amount minor={row.buckets[bucket]} currency={row.currency} />
    ),
  })),
  {
    id: "owed",
    header: "Total",
    align: "end",
    cell: (row) => (
      <span className="font-medium">
        {formatMoney(row.owedMinor, row.currency)}
      </span>
    ),
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
  status: (row) =>
    row.held ? (
      <StatusBadge tone={STANDING_TONE[row.held]}>
        {STANDING_NAMES[row.held]}
      </StatusBadge>
    ) : null,
  fact: (row) =>
    `${formatMoney(row.owedMinor, row.currency)} · ${standsText(row)}`,
};

/** A call or a contract's end the round asked for, with whom to speak to. */
function callItem(data: Data, { task, customerName }: Call): AttentionItem {
  const contact = data.contacts[task.customerId];
  const late = task.dueOn < data.today;
  return {
    id: task.id,
    tone: task.kind === "contract_end" || late ? "danger" : "warning",
    title: task.title,
    detail: (
      <>
        <Link
          to="/customers/$customerId"
          params={{ customerId: task.customerId }}
          className="text-foreground hover:text-primary hover:underline"
        >
          {customerName}
        </Link>
        {" · "}
        {contact ? (
          <>
            {contact.name}
            {contact.phone ? (
              <>
                {", "}
                <a
                  href={`tel:${contact.phone.replaceAll(" ", "")}`}
                  dir="ltr"
                  className="hover:text-primary hover:underline"
                >
                  {contact.phone}
                </a>
              </>
            ) : contact.email ? (
              `, ${contact.email}`
            ) : null}
          </>
        ) : (
          "No billing contact"
        )}
        {" · "}
        {task.assigneeId
          ? `Asked of ${data.names[task.assigneeId] ?? "a former operator"}`
          : "Nobody looks after it"}
        {late ? `, since ${formatDay(task.dueOn)}` : ", today"}
      </>
    ),
    action: <CloseTaskButton task={task} />,
  };
}

/**
 * Finance's collections queue: the calls the daily round asked for, then
 * what each customer owes by how long ago it fell due, the most overdue
 * first, with where its reminders stand and what its schools may still do.
 */
function Receivables() {
  const data = Route.useLoaderData();
  const totals = totalsOf(data.rows);
  return (
    <Page width="list">
      <PageHeader
        title="Receivables"
        description="Reminders go a week before an invoice is due, on the day, then after 7 and 14 days. A school is restricted at 30 days, read-only at 60 and suspended at 90, each at the start of its weekend; paying gives access back at once."
      />
      <div className="grid gap-6">
        {totals.length ? (
          <MetricGrid label="Overdue">
            {totals.map(([currency, sums]) => {
              const overdue = sums.owed - sums.buckets.current;
              return (
                <Metric
                  key={currency}
                  label={`Overdue in ${currency}`}
                  value={formatMoney(overdue, currency)}
                  detail={
                    overdue
                      ? {
                          text: `of ${formatMoney(sums.owed, currency)} owed`,
                          tone: "danger",
                        }
                      : {
                          text: `${formatMoney(sums.owed, currency)} owed, none of it late`,
                          tone: "success",
                        }
                  }
                />
              );
            })}
          </MetricGrid>
        ) : null}
        <AttentionList
          title="Calls to make"
          items={data.calls.map((call) => callItem(data, call))}
        />
        <DataTable
          caption="Owed by age"
          rows={data.rows.map((row) => ({ ...row, id: row.customerId }))}
          columns={COLUMNS}
          rowLabel={(row) => row.customerName}
          card={CARD}
          totals={totals.map(([currency, sums]) => ({
            id: currency,
            label: `Total in ${currency}`,
            cells: {
              ...Object.fromEntries(
                AGING_BUCKETS.map((bucket) => [
                  bucket,
                  <Amount
                    key={bucket}
                    minor={sums.buckets[bucket]}
                    currency={currency}
                  />,
                ]),
              ),
              owed: formatMoney(sums.owed, currency),
            },
          }))}
          empty={{
            icon: Wallet,
            title: "Nothing is owed",
            description:
              "An invoice shows here from the day it is issued until it is paid, aged by how long ago it fell due.",
          }}
        />
      </div>
    </Page>
  );
}
