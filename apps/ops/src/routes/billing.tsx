import type { PaymentMethod } from "@faridalms/domain/invoices";

import { PAYMENT_METHODS } from "@faridalms/domain/invoices";
import { Badge } from "@faridalms/ui/badge";
import { Button, buttonVariants } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@faridalms/ui/table";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { failure } from "../actions";
import {
  formatDay,
  formatMoney,
  INVOICE_KIND_NAMES,
  INVOICE_STATE_NAMES,
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

function InvoiceTable({ rows, today }: { rows: Row[]; today: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>For</TableHead>
            <TableHead className="text-end">Total</TableHead>
            <TableHead className="text-end">Owed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Link
                  to="/invoices/$invoiceId"
                  params={{ invoiceId: row.id }}
                  className="font-medium underline"
                >
                  {row.number ?? "Draft"}
                </Link>
                <span className="ms-2 inline-flex gap-1">
                  <Badge variant="secondary">
                    {INVOICE_STATE_NAMES[row.state]}
                  </Badge>
                  {row.dueOn && row.dueOn < today ? (
                    <Badge variant="outline">Overdue</Badge>
                  ) : null}
                </span>
              </TableCell>
              <TableCell>{row.customerName}</TableCell>
              <TableCell className="text-muted-foreground">
                {INVOICE_KIND_NAMES[row.kind]}, {formatDay(row.forDay)}
                {row.dueOn ? ` · due ${formatDay(row.dueOn)}` : ""}
              </TableCell>
              <TableCell className="text-end tabular-nums">
                {formatMoney(row.totalMinor, row.currency)}
              </TableCell>
              <TableCell className="text-end tabular-nums">
                {row.state === "draft"
                  ? ""
                  : formatMoney(row.owedMinor, row.currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function Billing() {
  const data = Route.useLoaderData();
  const mayBill = useMay("billing");
  const drafts = data.invoices.filter((row) => row.state === "draft");
  const owed = data.invoices.filter((row) => row.state !== "draft");
  return (
    <div className="grid gap-8">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">Billing</h1>
          <Link
            to="/receivables"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Receivables
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          The daily round drafts each contract's invoices before they fall due;
          finance checks and issues them, records what is paid and credits what
          is agreed. An issued invoice never changes.
        </p>
      </div>
      <section aria-label="Drafts to issue" className="grid gap-3">
        <h2 className="text-base font-semibold">Drafts to issue</h2>
        {drafts.length ? (
          <InvoiceTable rows={drafts} today={data.today} />
        ) : (
          <p className="text-sm text-muted-foreground">No drafts.</p>
        )}
      </section>
      <section aria-label="Owed" className="grid gap-3">
        <h2 className="text-base font-semibold">Owed</h2>
        {owed.length ? (
          <InvoiceTable rows={owed} today={data.today} />
        ) : (
          <p className="text-sm text-muted-foreground">Nothing is owed.</p>
        )}
      </section>
      {mayBill ? <PaymentForm data={data} /> : null}
    </div>
  );
}

/** Records money received and settles it against the customer's open invoices. */
function PaymentForm({ data }: { data: Data }) {
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
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const customer = data.customers.find((row) => row.id === customerId);
  return (
    <form
      aria-label="Record a payment"
      className="grid max-w-3xl gap-4 rounded-lg border p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        const amountMinor = minorOf(amount);
        if (!customer || !amountMinor) {
          setAnswer("Choose the customer and give the amount received.");
          return;
        }
        const allocations = invoices.flatMap((invoice) => {
          const settled = minorOf(settle[invoice.id] ?? "");
          return settled
            ? [{ invoiceId: invoice.id, amountMinor: settled }]
            : [];
        });
        setSaving(true);
        setAnswer(null);
        try {
          const out = await record({
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
          });
          if (out.ok) {
            toast.success("Payment recorded.");
            setAmount("");
            setReference("");
            setSettle({});
            setInvoices(await open({ data: { customerId } }));
            await router.invalidate();
          } else setAnswer(out.message);
        } catch (error) {
          setAnswer(
            failure(
              error,
              "The payment could not be recorded. It settles no more than it is.",
            ),
          );
        } finally {
          setSaving(false);
        }
      }}
    >
      <h2 className="text-base font-semibold">Record a payment</h2>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="payment-customer" className="font-medium">
            From
          </label>
          <select
            id="payment-customer"
            required
            value={customerId}
            onChange={async (event) => {
              setCustomerId(event.target.value);
              setSettle({});
              setInvoices(
                event.target.value
                  ? await open({ data: { customerId: event.target.value } })
                  : [],
              );
            }}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Choose…</option>
            {data.customers.map((row) => (
              <option key={row.id} value={row.id}>
                {row.legalNameEn}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="payment-method" className="font-medium">
            How
          </label>
          <select
            id="payment-method"
            value={method}
            onChange={(event) => setMethod(event.target.value as PaymentMethod)}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {PAYMENT_METHODS.map((choice) => (
              <option key={choice} value={choice}>
                {PAYMENT_METHOD_NAMES[choice]}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="payment-amount" className="font-medium">
            Amount{customer ? ` (${customer.currency})` : ""}
          </label>
          <Input
            id="payment-amount"
            inputMode="decimal"
            required
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="payment-received" className="font-medium">
            Received
          </label>
          <Input
            id="payment-received"
            type="date"
            required
            value={receivedOn}
            onChange={(event) => setReceivedOn(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5 text-sm sm:col-span-2">
          <label htmlFor="payment-reference" className="font-medium">
            Reference
          </label>
          <Input
            id="payment-reference"
            required
            maxLength={120}
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="The bank's reference, or the certificate's number"
          />
        </div>
      </div>
      {invoices.length ? (
        <fieldset className="grid gap-2 text-sm">
          <legend className="mb-1 font-medium">What it settles</legend>
          {invoices.map((invoice) => (
            <div
              key={invoice.id}
              className="grid items-center gap-2 sm:grid-cols-[1fr_auto]"
            >
              <label htmlFor={`settle-${invoice.id}`}>
                {invoice.number}:{" "}
                {formatMoney(invoice.owedMinor, invoice.currency)} owed
                {invoice.dueOn ? `, due ${formatDay(invoice.dueOn)}` : ""}
              </label>
              <Input
                id={`settle-${invoice.id}`}
                inputMode="decimal"
                value={settle[invoice.id] ?? ""}
                placeholder="0.00"
                onChange={(event) =>
                  setSettle((current) => ({
                    ...current,
                    [invoice.id]: event.target.value,
                  }))
                }
              />
            </div>
          ))}
        </fieldset>
      ) : customerId ? (
        <p className="text-sm text-muted-foreground">
          The customer has no open invoice: the payment is kept to settle one
          later.
        </p>
      ) : null}
      {answer ? (
        <p role="alert" className="text-sm text-destructive">
          {answer}
        </p>
      ) : null}
      <Button type="submit" disabled={saving} className="justify-self-start">
        {saving ? "Recording…" : "Record payment"}
      </Button>
    </form>
  );
}
