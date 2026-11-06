import type { PaymentMethod } from "@faridalms/domain/invoices";
import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";

import { PAYMENT_METHODS } from "@faridalms/domain/invoices";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusBadge } from "@faridalms/ui/system/status";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Banknote, Receipt } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { attempt } from "../actions";
import {
  formatDay,
  formatMoney,
  INVOICE_KIND_NAMES,
  INVOICE_STATE_NAMES,
  INVOICE_STATE_TONE,
  minorOf,
  PAYMENT_METHOD_NAMES,
} from "../format";
import { useMay } from "../may";
import {
  getBilling,
  getOpenInvoices,
  recordCustomerPayment,
} from "../server/invoicing";

export const Route = createFileRoute("/billing")({
  loader: () => getBilling(),
  component: Billing,
});

type Data = Awaited<ReturnType<typeof getBilling>>;
type Row = Data["invoices"][number];

function columnsFor(today: string): Column<Row>[] {
  return [
    {
      id: "invoice",
      header: "Invoice",
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          <RowLink to="/invoices/$invoiceId" params={{ invoiceId: row.id }}>
            {row.number ?? "Draft"}
          </RowLink>
          {row.dueOn && row.dueOn < today && row.state !== "draft" ? (
            <StatusBadge tone="danger">Overdue</StatusBadge>
          ) : null}
        </span>
      ),
    },
    { id: "customer", header: "Customer", cell: (row) => row.customerName },
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
      id: "for",
      header: "For",
      cell: (row) => (
        <span className="text-muted-foreground">
          {INVOICE_KIND_NAMES[row.kind]}, {formatDay(row.forDay)}
          {row.dueOn ? ` · due ${formatDay(row.dueOn)}` : ""}
        </span>
      ),
    },
    {
      id: "total",
      header: "Total",
      className: "text-end",
      cell: (row) => (
        <span className="tabular-nums">
          {formatMoney(row.totalMinor, row.currency)}
        </span>
      ),
    },
    {
      id: "owed",
      header: "Owed",
      className: "text-end",
      cell: (row) =>
        row.state === "draft" ? null : (
          <span className="tabular-nums">
            {formatMoney(row.owedMinor, row.currency)}
          </span>
        ),
    },
  ];
}

const CARD: DataTableCard<Row> = {
  title: (row) => (
    <RowLink to="/invoices/$invoiceId" params={{ invoiceId: row.id }}>
      {row.number ?? "Draft"}
    </RowLink>
  ),
  status: (row) => (
    <StatusBadge tone={INVOICE_STATE_TONE[row.state]}>
      {INVOICE_STATE_NAMES[row.state]}
    </StatusBadge>
  ),
  fact: (row) =>
    `${row.customerName} · ${formatMoney(row.totalMinor, row.currency)}`,
};

interface InvoiceTableProps {
  caption: string;
  rows: Row[];
  today: string;
  empty: string;
}

function InvoiceTable({ caption, rows, today, empty }: InvoiceTableProps) {
  return (
    <div className="grid gap-3">
      <h2 className="text-base leading-6 font-semibold">{caption}</h2>
      <DataTable
        caption={caption}
        rows={rows}
        columns={columnsFor(today)}
        rowLabel={(row) => row.number ?? `Draft for ${row.customerName}`}
        card={CARD}
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
    <>
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
          today={data.today}
          empty="No drafts"
        />
        <InvoiceTable
          caption="Owed"
          rows={owed}
          today={data.today}
          empty="Nothing is owed"
        />
      </div>
      {mayBill ? (
        <PaymentSheet data={data} open={paying} onOpenChange={setPaying} />
      ) : null}
    </>
  );
}

const METHOD_OPTIONS = PAYMENT_METHODS.map((choice) => ({
  value: choice,
  label: PAYMENT_METHOD_NAMES[choice],
}));

interface PaymentSheetProps {
  data: Data;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Records money received and settles it against the customer's open invoices. */
function PaymentSheet({ data, open: shown, onOpenChange }: PaymentSheetProps) {
  const router = useRouter();
  const open = useServerFn(getOpenInvoices);
  const record = useServerFn(recordCustomerPayment);
  const [customerId, setCustomerId] = useState("");
  const [invoices, setInvoices] = useState<
    Awaited<ReturnType<typeof getOpenInvoices>>
  >([]);
  const [settle, setSettle] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [amount, setAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState(data.today);
  const [reference, setReference] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const customer = data.customers.find((row) => row.id === customerId);
  const amountMinor = minorOf(amount);
  return (
    <SheetForm
      open={shown}
      onOpenChange={onOpenChange}
      title="Record a payment"
      submitLabel="Record payment"
      pending={saving}
      error={answer}
      onSubmit={async () => {
        setSubmitted(true);
        if (!customer || !amountMinor || !reference.trim()) return;
        const allocations = invoices.flatMap((invoice) => {
          const settled = minorOf(settle[invoice.id] ?? "");
          return settled
            ? [{ invoiceId: invoice.id, amountMinor: settled }]
            : [];
        });
        setSaving(true);
        setAnswer(null);
        const failed = await attempt(
          () =>
            record({
              data: {
                customerId,
                method,
                currency: customer.currency,
                amountMinor,
                receivedOn,
                reference,
                feeMinor: 0,
                allocations,
              },
            }),
          "The payment could not be recorded. It settles no more than it is.",
        );
        setSaving(false);
        if (failed) {
          setAnswer(failed);
          return;
        }
        toast.success("Payment recorded.");
        setAmount("");
        setReference("");
        setSettle({});
        setSubmitted(false);
        setInvoices(await open({ data: { customerId } }));
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      <SelectField
        label="From"
        value={customerId}
        options={[
          { value: "", label: "Choose…" },
          ...data.customers.map((row) => ({
            value: row.id,
            label: row.legalNameEn,
          })),
        ]}
        errors={submitted && !customer ? ["Choose the customer."] : undefined}
        onChange={(chosen) => {
          setCustomerId(chosen);
          setSettle({});
          void (
            chosen
              ? open({ data: { customerId: chosen } })
              : Promise.resolve([])
          ).then(setInvoices);
        }}
      />
      <SelectField
        label="How"
        value={method}
        options={METHOD_OPTIONS}
        onChange={setMethod}
      />
      <TextField
        label={`Amount${customer ? ` (${customer.currency})` : ""}`}
        inputMode="decimal"
        width="code"
        value={amount}
        errors={
          submitted && !amountMinor ? ["Give the amount received."] : undefined
        }
        onChange={(event) => setAmount(event.target.value)}
      />
      <TextField
        label="Received"
        type="date"
        width="date"
        value={receivedOn}
        onChange={(event) => setReceivedOn(event.target.value)}
      />
      <TextField
        label="Reference"
        maxLength={120}
        value={reference}
        placeholder="The bank's reference, or the certificate's number"
        errors={
          submitted && !reference.trim() ? ["Give the reference."] : undefined
        }
        onChange={(event) => setReference(event.target.value)}
      />
      {invoices.length ? (
        <fieldset className="grid gap-4">
          <legend className="mb-2 text-sm leading-5 font-medium">
            What it settles
          </legend>
          {invoices.map((invoice) => (
            <TextField
              key={invoice.id}
              label={`${invoice.number}: ${formatMoney(invoice.owedMinor, invoice.currency)} owed${invoice.dueOn ? `, due ${formatDay(invoice.dueOn)}` : ""}`}
              optional
              inputMode="decimal"
              width="code"
              value={settle[invoice.id] ?? ""}
              placeholder="0.00"
              onChange={(event) =>
                setSettle((current) => ({
                  ...current,
                  [invoice.id]: event.target.value,
                }))
              }
            />
          ))}
        </fieldset>
      ) : customerId ? (
        <p className="text-sm leading-5 text-muted-foreground">
          The customer has no open invoice: the payment is kept to settle one
          later.
        </p>
      ) : null}
    </SheetForm>
  );
}
