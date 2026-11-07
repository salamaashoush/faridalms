import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";

import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { StatusBadge, StatusText } from "@faridalms/ui/system/status";
import { createFileRoute } from "@tanstack/react-router";
import { Banknote, Receipt } from "lucide-react";
import { useState } from "react";

import { PaymentSheet } from "../components/PaymentSheet";
import {
  formatDay,
  formatMoney,
  INVOICE_KIND_NAMES,
  INVOICE_STATE_NAMES,
  INVOICE_STATE_TONE,
} from "../format";
import { useMay } from "../may";
import { getBilling } from "../server/invoicing";

export const Route = createFileRoute("/billing")({
  loader: () => getBilling(),
  component: Billing,
});

type Data = Awaited<ReturnType<typeof getBilling>>;
type Row = Data["invoices"][number];

const forOf = (row: Row) =>
  `${INVOICE_KIND_NAMES[row.kind]}, ${formatDay(row.forDay)}`;

const money = (minor: number, row: Row) => (
  <span className="tabular-nums">{formatMoney(minor, row.currency)}</span>
);

/** A draft has no number yet, so it is known by its customer and what it is for. */
const DRAFT_COLUMNS: Column<Row>[] = [
  {
    id: "customer",
    header: "Customer",
    primary: true,
    cell: (row) => (
      <RowLink to="/invoices/$invoiceId" params={{ invoiceId: row.id }}>
        {row.customerName}
      </RowLink>
    ),
  },
  {
    id: "for",
    header: "For",
    cell: (row) => <span className="text-muted-foreground">{forOf(row)}</span>,
  },
  {
    id: "total",
    header: "Total",
    align: "end",
    cell: (row) => money(row.totalMinor, row),
  },
];

const DRAFT_CARD: DataTableCard<Row> = {
  title: (row) => (
    <RowLink to="/invoices/$invoiceId" params={{ invoiceId: row.id }}>
      {row.customerName}
    </RowLink>
  ),
  fact: (row) => `${forOf(row)} · ${formatMoney(row.totalMinor, row.currency)}`,
};

function owedColumns(today: string): Column<Row>[] {
  return [
    {
      id: "invoice",
      header: "Invoice",
      primary: true,
      cell: (row) => (
        <RowLink to="/invoices/$invoiceId" params={{ invoiceId: row.id }}>
          {row.number}
        </RowLink>
      ),
    },
    { id: "customer", header: "Customer", cell: (row) => row.customerName },
    {
      id: "due",
      header: "Due",
      cell: (row) =>
        row.dueOn ? (
          row.dueOn < today ? (
            <StatusText tone="danger">
              Overdue since {formatDay(row.dueOn)}
            </StatusText>
          ) : (
            formatDay(row.dueOn)
          )
        ) : null,
    },
    {
      id: "state",
      header: "State",
      cell: (row) => (
        <StatusBadge tone={INVOICE_STATE_TONE[row.state]}>
          {INVOICE_STATE_NAMES[row.state]}
        </StatusBadge>
      ),
    },
    {
      id: "total",
      header: "Total",
      align: "end",
      cell: (row) => money(row.totalMinor, row),
    },
    {
      id: "owed",
      header: "Owed",
      align: "end",
      cell: (row) => money(row.owedMinor, row),
    },
  ];
}

const OWED_CARD: DataTableCard<Row> = {
  title: (row) => (
    <RowLink to="/invoices/$invoiceId" params={{ invoiceId: row.id }}>
      {row.number}
    </RowLink>
  ),
  status: (row) => (
    <StatusBadge tone={INVOICE_STATE_TONE[row.state]}>
      {INVOICE_STATE_NAMES[row.state]}
    </StatusBadge>
  ),
  fact: (row) =>
    `${row.customerName} · ${formatMoney(row.owedMinor, row.currency)} owed`,
};

interface InvoiceTableProps {
  caption: string;
  rows: Row[];
  columns: Column<Row>[];
  card: DataTableCard<Row>;
  empty: string;
}

function InvoiceTable({
  caption,
  rows,
  columns,
  card,
  empty,
}: InvoiceTableProps) {
  return (
    <div className="grid gap-3">
      <h2 className="text-base leading-6 font-semibold">{caption}</h2>
      <DataTable
        caption={caption}
        rows={rows}
        columns={columns}
        rowLabel={(row) => row.number ?? `Draft for ${row.customerName}`}
        card={card}
        empty={{ icon: Receipt, title: empty }}
      />
    </div>
  );
}

/**
 * The daily round drafts each contract's invoices before they fall due;
 * finance checks and issues them, records what is paid and credits what is
 * agreed. An issued invoice never changes.
 */
function Billing() {
  const data = Route.useLoaderData();
  const mayBill = useMay("billing");
  const [paying, setPaying] = useState(false);
  const drafts = data.invoices.filter((row) => row.state === "draft");
  const owed = data.invoices.filter((row) => row.state !== "draft");
  return (
    <Page width="list">
      <PageHeader
        title="Billing"
        description="Drafts are checked and issued here; an issued invoice never changes."
        action={
          mayBill
            ? {
                label: "Record a payment",
                icon: Banknote,
                onClick: () => setPaying(true),
              }
            : undefined
        }
      />
      <div className="grid gap-8">
        <InvoiceTable
          caption="Drafts to issue"
          rows={drafts}
          columns={DRAFT_COLUMNS}
          card={DRAFT_CARD}
          empty="No drafts"
        />
        <InvoiceTable
          caption="Owed"
          rows={owed}
          columns={owedColumns(data.today)}
          card={OWED_CARD}
          empty="Nothing is owed"
        />
      </div>
      {mayBill ? (
        <PaymentSheet
          customers={data.customers}
          today={data.today}
          open={paying}
          onOpenChange={setPaying}
        />
      ) : null}
    </Page>
  );
}
