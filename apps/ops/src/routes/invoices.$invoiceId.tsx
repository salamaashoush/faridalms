import { InvoiceDocument } from "@faridalms/documents/InvoiceDocument";
import { Badge } from "@faridalms/ui/badge";
import { Button, buttonVariants } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { Textarea } from "@faridalms/ui/textarea";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { failure } from "../actions";
import { EventList } from "../components/EventList";
import {
  blankLine,
  InvoiceLinesFields,
  lineDraftOf,
  linesOf,
} from "../components/InvoiceLinesForm";
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
  credit,
  getInvoice,
  issue,
  makePaymentLink,
  recordTaxId,
  saveInvoiceDraft,
  settleFromPayment,
} from "../server/invoicing";

export const Route = createFileRoute("/invoices/$invoiceId")({
  validateSearch: v.object({
    language: v.optional(v.picklist(["en", "ar"])),
    /** A credit note of the invoice to show instead of the invoice. */
    credit: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  loader: ({ params }) => getInvoice({ data: { id: params.invoiceId } }),
  component: InvoicePage,
});

type Data = Awaited<ReturnType<typeof getInvoice>>;

function InvoicePage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const mayBill = useMay("billing");
  const { invoice, customer } = data;
  const language = search.language ?? invoice.language;
  const shown = data.credits.find((note) => note.id === search.credit);
  const open = invoice.state === "issued" || invoice.state === "partly_paid";
  return (
    <div className="grid gap-8">
      <div className="grid gap-1 print:hidden">
        <Link
          to="/billing"
          className="text-sm text-muted-foreground hover:underline"
        >
          Billing
        </Link>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold">
          {invoice.number ? `Invoice ${invoice.number}` : "Draft invoice"}
          <Badge variant="secondary">
            {INVOICE_STATE_NAMES[invoice.state]}
          </Badge>
          {open && invoice.dueOn && invoice.dueOn < data.today ? (
            <Badge variant="outline">Overdue</Badge>
          ) : null}
        </h1>
        <p className="text-sm text-muted-foreground">
          <Link
            to="/customers/$customerId"
            params={{ customerId: customer.id }}
            className="text-foreground underline"
          >
            {customer.legalNameEn}
          </Link>{" "}
          · {INVOICE_KIND_NAMES[invoice.kind]} for {formatDay(invoice.forDay)}
          {invoice.state === "draft"
            ? ""
            : ` · ${formatMoney(data.owedMinor, invoice.currency)} owed of ${formatMoney(invoice.totalMinor, invoice.currency)}`}
          {invoice.taxAuthorityId
            ? ` · tax authority ${invoice.taxAuthorityId}`
            : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <span className="text-sm text-muted-foreground">Print in</span>
        {(["en", "ar"] as const).map((choice) => (
          <Link
            key={choice}
            to="/invoices/$invoiceId"
            params={{ invoiceId: invoice.id }}
            search={{ language: choice, credit: search.credit }}
            className={buttonVariants({
              variant: choice === language ? "secondary" : "ghost",
              size: "sm",
            })}
          >
            {choice === "en" ? "English" : "Arabic"}
          </Link>
        ))}
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          Print or save as PDF
        </Button>
        {shown ? (
          <Link
            to="/invoices/$invoiceId"
            params={{ invoiceId: invoice.id }}
            search={{ language: search.language }}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Show the invoice
          </Link>
        ) : null}
      </div>

      <div className="max-w-3xl">
        <InvoiceDocument
          language={language}
          business={data.business}
          vatName={data.vatName}
          party={{
            name: customer.legalNameEn,
            nameAr: customer.legalNameAr,
            address: customer.address,
            taxNumber: customer.taxNumber,
          }}
          document={
            shown
              ? {
                  kind: "credit_note",
                  number: shown.number,
                  issuedOn: shown.issuedOn,
                  dueOn: null,
                  currency: invoice.currency,
                  purchaseOrder: invoice.purchaseOrder,
                  vatPercent: invoice.vatPercent,
                  reverseCharge: invoice.reverseCharge,
                  subtotalMinor: shown.subtotalMinor,
                  vatMinor: shown.vatMinor,
                  totalMinor: shown.totalMinor,
                  lines: shown.lines,
                  creditFor: {
                    number: invoice.number ?? "",
                    reason: shown.reason,
                  },
                }
              : {
                  kind: "invoice",
                  number: invoice.number,
                  issuedOn: invoice.issuedOn,
                  dueOn: invoice.dueOn,
                  currency: invoice.currency,
                  purchaseOrder: invoice.purchaseOrder,
                  vatPercent: invoice.vatPercent,
                  reverseCharge: invoice.reverseCharge,
                  subtotalMinor: invoice.subtotalMinor,
                  vatMinor: invoice.vatMinor,
                  totalMinor: invoice.totalMinor,
                  lines: data.lines,
                }
          }
        />
      </div>

      {mayBill && invoice.state === "draft" ? (
        <div className="grid gap-6 print:hidden">
          <IssueButton data={data} />
          <DraftForm data={data} key={invoice.totalMinor} />
        </div>
      ) : null}

      {invoice.state !== "draft" ? (
        <div className="grid gap-6 print:hidden">
          {mayBill ? (
            <TaxId
              document="invoice"
              id={invoice.id}
              held={invoice.taxAuthorityId}
            />
          ) : null}
          {data.cards && open && mayBill ? <PaymentLink data={data} /> : null}
          <Settlements data={data} />
          {mayBill && open && data.unsettled.length ? (
            <SettleFromPayment data={data} />
          ) : null}
          <Credits data={data} />
          {mayBill && invoice.state !== "credited" ? (
            <CreditForm data={data} />
          ) : null}
        </div>
      ) : null}

      <section className="grid gap-3 print:hidden">
        <h2 className="text-base font-semibold">History</h2>
        <EventList events={data.history} names={data.names} />
      </section>
    </div>
  );
}

function IssueButton({ data }: { data: Data }) {
  const router = useRouter();
  const send = useServerFn(issue);
  const [saving, setSaving] = useState(false);
  return (
    <Button
      className="justify-self-start"
      disabled={saving}
      onClick={async () => {
        setSaving(true);
        try {
          const out = await send({ data: { id: data.invoice.id } });
          if (out.ok) {
            toast.success(`Issued as ${out.number}.`);
            await router.invalidate();
          } else toast.error(out.message);
        } catch (error) {
          const said = failure(error, "It could not be issued.");
          if (said) toast.error(said);
        } finally {
          setSaving(false);
        }
      }}
    >
      {saving ? "Issuing…" : "Issue this invoice"}
    </Button>
  );
}

/** A draft's lines, its customer's order number and its language, before it is issued. */
function DraftForm({ data }: { data: Data }) {
  const router = useRouter();
  const save = useServerFn(saveInvoiceDraft);
  const [drafts, setDrafts] = useState(() => data.lines.map(lineDraftOf));
  const [purchaseOrder, setPurchaseOrder] = useState(
    data.invoice.purchaseOrder ?? "",
  );
  const [language, setLanguage] = useState(data.invoice.language);
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <form
      aria-label="Draft"
      className="grid max-w-3xl gap-4 rounded-lg border p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        const read = linesOf(drafts);
        if (!read.ok) {
          setAnswer(read.message);
          return;
        }
        setSaving(true);
        setAnswer(null);
        try {
          const out = await save({
            data: {
              id: data.invoice.id,
              lines: read.lines,
              purchaseOrder,
              language,
            },
          });
          if (out.ok) {
            toast.success("Draft saved.");
            await router.invalidate();
          } else setAnswer(out.message);
        } catch (error) {
          setAnswer(failure(error, "The draft could not be saved."));
        } finally {
          setSaving(false);
        }
      }}
    >
      <h2 className="text-base font-semibold">Before it is issued</h2>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="draft-po" className="font-medium">
            The customer's purchase order
          </label>
          <Input
            id="draft-po"
            maxLength={60}
            value={purchaseOrder}
            onChange={(event) => setPurchaseOrder(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="draft-language" className="font-medium">
            Written in
          </label>
          <select
            id="draft-language"
            value={language}
            onChange={(event) =>
              setLanguage(event.target.value === "ar" ? "ar" : "en")
            }
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            <option value="en">English</option>
            <option value="ar">Arabic</option>
          </select>
        </div>
      </div>
      <InvoiceLinesFields
        prefix="draft"
        currency={data.invoice.currency}
        drafts={drafts}
        onChange={setDrafts}
      />
      {answer ? (
        <p role="alert" className="text-sm text-destructive">
          {answer}
        </p>
      ) : null}
      <Button type="submit" disabled={saving} className="justify-self-start">
        {saving ? "Saving…" : "Save draft"}
      </Button>
    </form>
  );
}

/** The tax authority's id for an issued document, which finance enters from it. */
function TaxId({
  document,
  id,
  held,
}: {
  document: "invoice" | "credit_note";
  id: string;
  held: string | null;
}) {
  const router = useRouter();
  const save = useServerFn(recordTaxId);
  const [value, setValue] = useState(held ?? "");
  const [saving, setSaving] = useState(false);
  return (
    <form
      aria-label={
        document === "invoice" ? "Tax authority" : "Credit note's tax authority"
      }
      className="flex max-w-2xl flex-wrap items-end gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
          await save({ data: { document, id, taxAuthorityId: value } });
          toast.success("Tax authority's id saved.");
          await router.invalidate();
        } catch (error) {
          const said = failure(error, "The id could not be saved.");
          if (said) toast.error(said);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="grid min-w-48 flex-1 gap-1 text-sm">
        <label htmlFor={`tax-id-${id}`} className="font-medium">
          The tax authority's id for it
        </label>
        <Input
          id={`tax-id-${id}`}
          dir="ltr"
          maxLength={80}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="From the e-invoice once it is submitted"
        />
      </div>
      <Button
        type="submit"
        variant="outline"
        disabled={saving || !value.trim() || value === held}
      >
        Save
      </Button>
    </form>
  );
}

function PaymentLink({ data }: { data: Data }) {
  const router = useRouter();
  const make = useServerFn(makePaymentLink);
  const [saving, setSaving] = useState(false);
  return (
    <section className="grid max-w-2xl gap-2 text-sm">
      <h2 className="text-base font-semibold">Pay by card</h2>
      {data.invoice.paymentLinkUrl ? (
        <p>
          <a
            href={data.invoice.paymentLinkUrl}
            className="break-all underline"
            target="_blank"
            rel="noreferrer"
          >
            {data.invoice.paymentLinkUrl}
          </a>
        </p>
      ) : (
        <p className="text-muted-foreground">
          A Paymob link for what is owed, which the school's Billing page
          offers; its payment is recorded when Paymob says it is made.
        </p>
      )}
      <Button
        variant="outline"
        className="justify-self-start"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            const out = await make({ data: { id: data.invoice.id } });
            if (out.ok) {
              toast.success("Payment link made.");
              await router.invalidate();
            } else toast.error(out.message);
          } catch (error) {
            const said = failure(error, "The link could not be made.");
            if (said) toast.error(said);
          } finally {
            setSaving(false);
          }
        }}
      >
        {data.invoice.paymentLinkUrl
          ? "Make a new link for what is owed"
          : "Make a payment link"}
      </Button>
    </section>
  );
}

function Settlements({ data }: { data: Data }) {
  return (
    <section className="grid max-w-2xl gap-2">
      <h2 className="text-base font-semibold">Paid</h2>
      {data.allocations.length ? (
        <ul className="divide-y rounded-lg border text-sm">
          {data.allocations.map(({ allocation, payment }) => (
            <li
              key={allocation.id}
              className="flex flex-wrap justify-between gap-2 px-4 py-3"
            >
              <span>
                {PAYMENT_METHOD_NAMES[payment.method]} · {payment.reference} ·{" "}
                {formatDay(payment.receivedOn)}
              </span>
              <span className="tabular-nums">
                {formatMoney(allocation.amountMinor, payment.currency)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing yet.</p>
      )}
    </section>
  );
}

/** Settles what is left of a payment already received against this invoice. */
function SettleFromPayment({ data }: { data: Data }) {
  const router = useRouter();
  const send = useServerFn(settleFromPayment);
  const [paymentId, setPaymentId] = useState(data.unsettled[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form
      aria-label="Settle from a payment received"
      className="flex max-w-2xl flex-wrap items-end gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const amountMinor = minorOf(amount);
        if (!amountMinor) return;
        setSaving(true);
        try {
          const out = await send({
            data: { paymentId, invoiceId: data.invoice.id, amountMinor },
          });
          if (out.ok) {
            toast.success("Settled.");
            setAmount("");
            await router.invalidate();
          } else toast.error(out.message);
        } catch (error) {
          const said = failure(error, "It could not be settled.");
          if (said) toast.error(said);
        } finally {
          setSaving(false);
        }
      }}
    >
      <div className="grid gap-1 text-sm">
        <label htmlFor="settle-payment" className="font-medium">
          From a payment received
        </label>
        <select
          id="settle-payment"
          value={paymentId}
          onChange={(event) => setPaymentId(event.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          {data.unsettled.map((payment) => (
            <option key={payment.id} value={payment.id}>
              {PAYMENT_METHOD_NAMES[payment.method]} {payment.reference},{" "}
              {formatMoney(payment.leftMinor, data.invoice.currency)} left
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1 text-sm">
        <label htmlFor="settle-amount" className="font-medium">
          Amount
        </label>
        <Input
          id="settle-amount"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </div>
      <Button type="submit" variant="outline" disabled={saving || !amount}>
        Settle
      </Button>
    </form>
  );
}

function Credits({ data }: { data: Data }) {
  const mayBill = useMay("billing");
  if (data.credits.length === 0) return null;
  return (
    <section className="grid max-w-2xl gap-2">
      <h2 className="text-base font-semibold">Credit notes</h2>
      <ul className="grid gap-3">
        {data.credits.map((note) => (
          <li
            key={note.id}
            className="grid gap-2 rounded-lg border px-4 py-3 text-sm"
          >
            <span className="flex flex-wrap justify-between gap-2">
              <Link
                to="/invoices/$invoiceId"
                params={{ invoiceId: data.invoice.id }}
                search={{ credit: note.id }}
                className="font-medium underline"
              >
                {note.number}
              </Link>
              <span className="tabular-nums">
                {formatMoney(note.totalMinor, data.invoice.currency)}
              </span>
            </span>
            <span className="text-muted-foreground">
              {formatDay(note.issuedOn)} · {note.reason}
            </span>
            {mayBill ? (
              <TaxId
                document="credit_note"
                id={note.id}
                held={note.taxAuthorityId}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Credits the invoice, in part or whole, with why. */
function CreditForm({ data }: { data: Data }) {
  const router = useRouter();
  const send = useServerFn(credit);
  const [drafts, setDrafts] = useState(() => [blankLine()]);
  const [reason, setReason] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <form
      aria-label="Credit it"
      className="grid max-w-3xl gap-4 rounded-lg border p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        const read = linesOf(drafts);
        if (!read.ok) {
          setAnswer(read.message);
          return;
        }
        setSaving(true);
        setAnswer(null);
        try {
          const out = await send({
            data: { invoiceId: data.invoice.id, lines: read.lines, reason },
          });
          if (out.ok) {
            toast.success(`Credited as ${out.number}.`);
            setDrafts([blankLine()]);
            setReason("");
            await router.invalidate();
          } else setAnswer(out.message);
        } catch (error) {
          setAnswer(failure(error, "It could not be credited."));
        } finally {
          setSaving(false);
        }
      }}
    >
      <h2 className="text-base font-semibold">Credit it</h2>
      <p className="text-sm text-muted-foreground">
        An issued invoice is never changed: a credit note takes back what was
        agreed, at the invoice's VAT, and the invoice is issued again if need
        be.
      </p>
      <InvoiceLinesFields
        prefix="credit"
        currency={data.invoice.currency}
        drafts={drafts}
        onChange={setDrafts}
      />
      <div className="grid gap-1.5 text-sm">
        <label htmlFor="credit-reason" className="font-medium">
          Why
        </label>
        <Textarea
          id="credit-reason"
          required
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      {answer ? (
        <p role="alert" className="text-sm text-destructive">
          {answer}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={saving || !reason.trim()}
        className="justify-self-start"
      >
        {saving ? "Crediting…" : "Issue credit note"}
      </Button>
    </form>
  );
}
