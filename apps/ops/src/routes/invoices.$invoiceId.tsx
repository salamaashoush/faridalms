import { InvoiceDocument } from "@faridalms/documents/InvoiceDocument";
import { Button } from "@faridalms/ui/button";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import {
  Fact,
  Facts,
  RecordColumns,
  RecordEmpty,
  RecordHeader,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SettingsSection } from "@faridalms/ui/system/settings-section";
import { SheetForm, useSheet } from "@faridalms/ui/system/sheet-form";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarX, HandCoins, Printer, ReceiptText, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { attempt, attemptWith, failure } from "../actions";
import { EventList } from "../components/EventList";
import {
  blankLine,
  InvoiceLinesFields,
  lineDraftOf,
  linesOf,
} from "../components/InvoiceLinesForm";
import { WhyField } from "../components/Why";
import {
  DUNNING_STEP_NAMES,
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
  staticData: { section: "/billing", title: "Invoice" },
  loader: ({ params }) => getInvoice({ data: { id: params.invoiceId } }),
  component: InvoicePage,
});

type Data = Awaited<ReturnType<typeof getInvoice>>;

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
] as const;

function InvoicePage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const mayBill = useMay("billing");
  const { invoice, customer } = data;
  const language = search.language ?? invoice.language;
  const shown = data.credits.find((note) => note.id === search.credit);
  const open = invoice.state === "issued" || invoice.state === "partly_paid";
  const issuing = useIssue(data);
  const crediting = useSheet();
  const settling = useSheet();
  const mayCredit =
    mayBill && invoice.state !== "draft" && invoice.state !== "credited";
  const maySettle = mayBill && open && data.unsettled.length > 0;
  return (
    <>
      <div className="print:hidden">
        <RecordHeader
          title={invoice.number ? `Invoice ${invoice.number}` : "Draft invoice"}
          status={{
            label: INVOICE_STATE_NAMES[invoice.state],
            tone: INVOICE_STATE_TONE[invoice.state],
          }}
          alerts={
            open && invoice.dueOn && invoice.dueOn < data.today
              ? [{ label: "Overdue", tone: "danger", icon: CalendarX }]
              : []
          }
          facts={[
            {
              label: "Customer",
              value: (
                <Link
                  to="/customers/$customerId"
                  params={{ customerId: customer.id }}
                  className="hover:text-primary hover:underline"
                >
                  {customer.legalNameEn}
                </Link>
              ),
            },
            {
              label: "For",
              value: `${INVOICE_KIND_NAMES[invoice.kind]} for ${formatDay(invoice.forDay)}`,
            },
            ...(invoice.state === "draft"
              ? []
              : [
                  {
                    label: "Owed",
                    value: `${formatMoney(data.owedMinor, invoice.currency)} owed of ${formatMoney(invoice.totalMinor, invoice.currency)}`,
                  },
                ]),
            ...(invoice.taxAuthorityId
              ? [
                  {
                    label: "Tax authority",
                    value: `Tax authority ${invoice.taxAuthorityId}`,
                  },
                ]
              : []),
          ]}
          action={
            mayBill && invoice.state === "draft"
              ? {
                  label: "Issue this invoice",
                  icon: Send,
                  onClick: () => void issuing.run(),
                  pending: issuing.pending,
                }
              : maySettle
                ? {
                    label: "Settle from a payment",
                    icon: HandCoins,
                    onClick: settling.show,
                  }
                : undefined
          }
          menu={
            mayCredit
              ? [
                  {
                    label: "Credit it",
                    icon: ReceiptText,
                    onSelect: crediting.show,
                  },
                ]
              : []
          }
        />
      </div>
      <RecordColumns
        main={
          <>
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
                <nav
                  aria-label="Print in"
                  className="flex gap-1 rounded-lg bg-muted p-1"
                >
                  {LANGUAGES.map((choice) => (
                    <Link
                      key={choice.value}
                      to="/invoices/$invoiceId"
                      params={{ invoiceId: invoice.id }}
                      search={{ language: choice.value, credit: search.credit }}
                      aria-current={
                        choice.value === language ? "true" : undefined
                      }
                      className="inline-flex min-h-8 items-center rounded-md px-3 text-[13px] font-medium text-muted-foreground hover:text-foreground aria-[current=true]:bg-background aria-[current=true]:text-foreground aria-[current=true]:shadow-sm"
                    >
                      {choice.label}
                    </Link>
                  ))}
                </nav>
                <span className="flex items-center gap-2">
                  {shown ? (
                    <ButtonLink
                      to="/invoices/$invoiceId"
                      params={{ invoiceId: invoice.id }}
                      search={{ language: search.language }}
                      variant="ghost"
                      size="sm"
                    >
                      Show the invoice
                    </ButtonLink>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => window.print()}
                  >
                    <Printer aria-hidden />
                    Print or save as PDF
                  </Button>
                </span>
              </div>
              <div className="rounded-lg border bg-card p-2 shadow-sm print:border-0 print:p-0 print:shadow-none">
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
            </div>
            {mayBill && invoice.state === "draft" ? (
              <DraftForm data={data} key={invoice.totalMinor} />
            ) : null}

            <div className="print:hidden">
              <RecordSection title="History">
                <EventList events={data.history} names={data.names} />
              </RecordSection>
            </div>
          </>
        }
        aside={
          invoice.state === "draft" ? undefined : (
            <div className="grid gap-6 print:hidden">
              <Settlements data={data} />
              {data.cards && open && mayBill ? (
                <PaymentLink data={data} />
              ) : null}
              <Reminders data={data} />
              <Credits data={data} />
              <TaxAuthority
                document="invoice"
                id={invoice.id}
                held={invoice.taxAuthorityId}
              />
            </div>
          )
        }
      />
      {mayCredit ? (
        <CreditSheet
          key={crediting.key}
          data={data}
          open={crediting.open}
          onOpenChange={crediting.onOpenChange}
        />
      ) : null}
      {maySettle ? (
        <SettleSheet
          key={settling.key}
          data={data}
          open={settling.open}
          onOpenChange={settling.onOpenChange}
        />
      ) : null}
    </>
  );
}

interface InvoiceProps {
  data: Data;
}

interface Issue {
  run: () => Promise<void>;
  pending: boolean;
}

/** Issues a draft, numbering it; after that it is only ever credited. */
function useIssue(data: Data): Issue {
  const router = useRouter();
  const send = useServerFn(issue);
  const [pending, setPending] = useState(false);
  return {
    pending,
    run: async () => {
      setPending(true);
      const out = await attemptWith(
        () => send({ data: { id: data.invoice.id } }),
        "It could not be issued.",
      );
      setPending(false);
      if (!out.ok) {
        toast.error(out.message);
        return;
      }
      toast.success(`Issued as ${out.value.number}.`);
      await router.invalidate();
    },
  };
}

interface InvoiceSheetProps extends InvoiceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
] as const;

/** A draft's lines, its customer's order number and its language, before it is issued. */
function DraftForm({ data }: InvoiceProps) {
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
    <SettingsSection
      title="Before it is issued"
      description="The lines, the customer's order number and the language it is written in."
      submitLabel="Save draft"
      pending={saving}
      error={answer}
      onSubmit={async () => {
        const read = linesOf(drafts);
        if (!read.ok) {
          setAnswer(read.message);
          return;
        }
        setSaving(true);
        setAnswer(null);
        const failed = await attempt(
          () =>
            save({
              data: {
                id: data.invoice.id,
                lines: read.lines,
                purchaseOrder,
                language,
              },
            }),
          "The draft could not be saved.",
        );
        setSaving(false);
        if (failed) {
          setAnswer(failed);
          return;
        }
        toast.success("Draft saved.");
        await router.invalidate();
      }}
    >
      <div className="grid items-start gap-6 @md:grid-cols-2">
        <TextField
          label="The customer's purchase order"
          optional
          maxLength={60}
          value={purchaseOrder}
          onChange={(event) => setPurchaseOrder(event.target.value)}
        />
        <SelectField
          label="Written in"
          value={language}
          options={LANGUAGE_OPTIONS}
          onChange={setLanguage}
        />
      </div>
      <InvoiceLinesFields
        currency={data.invoice.currency}
        drafts={drafts}
        onChange={setDrafts}
      />
    </SettingsSection>
  );
}

interface TaxIdProps {
  document: "invoice" | "credit_note";
  id: string;
  held: string | null;
}

/** The tax authority's id for the invoice, which finance enters from its e-invoice. */
function TaxAuthority({ document, id, held }: TaxIdProps) {
  const mayBill = useMay("billing");
  const sheet = useSheet();
  return (
    <RecordSection
      title="Tax authority"
      edit={
        mayBill
          ? { label: "Record the tax authority's id", onClick: sheet.show }
          : undefined
      }
    >
      <Facts>
        <Fact label="Its id for the invoice">
          {held ? <span dir="ltr">{held}</span> : null}
        </Fact>
      </Facts>
      {mayBill ? (
        <TaxIdSheet
          key={sheet.key}
          document={document}
          id={id}
          held={held}
          open={sheet.open}
          onOpenChange={sheet.onOpenChange}
        />
      ) : null}
    </RecordSection>
  );
}

interface TaxIdSheetProps extends TaxIdProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Records the tax authority's id for an issued invoice or credit note. */
function TaxIdSheet({
  document,
  id,
  held,
  open,
  onOpenChange,
}: TaxIdSheetProps) {
  const router = useRouter();
  const save = useServerFn(recordTaxId);
  const [value, setValue] = useState(held ?? "");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title={
        document === "invoice"
          ? "The tax authority's id"
          : "The credit note's tax authority id"
      }
      pending={saving}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (!value.trim()) return;
        if (value === held) {
          onOpenChange(false);
          return;
        }
        setSaving(true);
        setError(null);
        const failed = await attempt(
          () => save({ data: { document, id, taxAuthorityId: value } }),
          "The id could not be saved.",
        );
        setSaving(false);
        if (failed) {
          setError(failed);
          return;
        }
        toast.success("Tax authority's id saved.");
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      <TextField
        label="The tax authority's id for it"
        dir="ltr"
        maxLength={80}
        value={value}
        placeholder="From the e-invoice once it is submitted"
        errors={submitted && !value.trim() ? ["Enter the id."] : undefined}
        onChange={(event) => setValue(event.target.value)}
      />
    </SheetForm>
  );
}

function PaymentLink({ data }: InvoiceProps) {
  const router = useRouter();
  const make = useServerFn(makePaymentLink);
  const [saving, setSaving] = useState(false);
  return (
    <RecordSection title="Pay by card">
      <div className="grid gap-3 text-sm leading-5">
        {data.invoice.paymentLinkUrl ? (
          <p>
            <a
              href={data.invoice.paymentLinkUrl}
              className="break-all text-primary underline-offset-4 hover:underline"
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
          type="button"
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
      </div>
    </RecordSection>
  );
}

function Settlements({ data }: InvoiceProps) {
  return (
    <RecordSection title="Paid">
      {data.allocations.length ? (
        <RecordList>
          {data.allocations.map(({ allocation, payment }) => (
            <li
              key={allocation.id}
              className="flex flex-wrap justify-between gap-2 py-3 text-sm leading-5"
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
        </RecordList>
      ) : (
        <RecordEmpty>Nothing yet.</RecordEmpty>
      )}
    </RecordSection>
  );
}

/** Settles what is left of a payment already received against this invoice. */
function SettleSheet({ data, open, onOpenChange }: InvoiceSheetProps) {
  const router = useRouter();
  const send = useServerFn(settleFromPayment);
  const [paymentId, setPaymentId] = useState(data.unsettled[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountMinor = minorOf(amount);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Settle from a payment received"
      submitLabel="Settle"
      pending={saving}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (!amountMinor) return;
        setSaving(true);
        setError(null);
        const failed = await attempt(
          () =>
            send({
              data: { paymentId, invoiceId: data.invoice.id, amountMinor },
            }),
          "It could not be settled.",
        );
        setSaving(false);
        if (failed) {
          setError(failed);
          return;
        }
        toast.success("Settled.");
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      <SelectField
        label="From a payment received"
        value={paymentId}
        options={data.unsettled.map((payment) => ({
          value: payment.id,
          label: `${PAYMENT_METHOD_NAMES[payment.method]} ${payment.reference}, ${formatMoney(payment.leftMinor, data.invoice.currency)} left`,
        }))}
        onChange={setPaymentId}
      />
      <TextField
        label="Amount"
        inputMode="decimal"
        width="code"
        value={amount}
        errors={submitted && !amountMinor ? ["Give the amount."] : undefined}
        onChange={(event) => setAmount(event.target.value)}
      />
    </SheetForm>
  );
}

/** The steps of the clock taken for the invoice, and who each email went to. */
function Reminders({ data }: InvoiceProps) {
  if (data.reminders.length === 0) return null;
  return (
    <RecordSection title="Reminders">
      <RecordList>
        {data.reminders.map((reminder) => (
          <li key={reminder.step} className="grid gap-0.5 py-3">
            <span className="text-sm leading-5">
              {DUNNING_STEP_NAMES[reminder.step]}
            </span>
            <span className="text-[13px] leading-[18px] text-muted-foreground">
              {formatDay(reminder.takenOn)} ·{" "}
              {reminder.emailedTo.length
                ? reminder.emailedTo.join(", ")
                : "nobody emailed"}
            </span>
          </li>
        ))}
      </RecordList>
    </RecordSection>
  );
}

/** The credit notes taken against the invoice, each with its tax authority id. */
function Credits({ data }: InvoiceProps) {
  if (data.credits.length === 0) return null;
  return (
    <RecordSection title="Credit notes">
      <RecordList>
        {data.credits.map((note) => (
          <CreditNoteItem key={note.id} data={data} note={note} />
        ))}
      </RecordList>
    </RecordSection>
  );
}

interface CreditNoteItemProps extends InvoiceProps {
  note: Data["credits"][number];
}

function CreditNoteItem({ data, note }: CreditNoteItemProps) {
  const mayBill = useMay("billing");
  const sheet = useSheet();
  return (
    <li className="grid gap-1 py-3">
      <span className="flex flex-wrap justify-between gap-2 text-sm leading-5">
        <Link
          to="/invoices/$invoiceId"
          params={{ invoiceId: data.invoice.id }}
          search={{ credit: note.id }}
          className="font-medium hover:text-primary hover:underline"
        >
          {note.number}
        </Link>
        <span className="tabular-nums">
          {formatMoney(note.totalMinor, data.invoice.currency)}
        </span>
      </span>
      <span className="text-[13px] leading-[18px] text-muted-foreground">
        {formatDay(note.issuedOn)} · {note.reason}
      </span>
      <span className="flex flex-wrap items-center justify-between gap-2 text-[13px] leading-[18px] text-muted-foreground">
        {note.taxAuthorityId ? (
          <span>
            Tax authority <span dir="ltr">{note.taxAuthorityId}</span>
          </span>
        ) : (
          <span>No tax authority id yet</span>
        )}
        {mayBill ? (
          <Button type="button" variant="ghost" size="sm" onClick={sheet.show}>
            {note.taxAuthorityId ? "Change id" : "Record id"}
          </Button>
        ) : null}
      </span>
      {mayBill ? (
        <TaxIdSheet
          key={sheet.key}
          document="credit_note"
          id={note.id}
          held={note.taxAuthorityId}
          open={sheet.open}
          onOpenChange={sheet.onOpenChange}
        />
      ) : null}
    </li>
  );
}

/** Credits the invoice, in part or whole, with why. */
function CreditSheet({ data, open, onOpenChange }: InvoiceSheetProps) {
  const router = useRouter();
  const send = useServerFn(credit);
  const [drafts, setDrafts] = useState(() => [blankLine()]);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Credit it"
      destructive
      submitLabel="Issue credit note"
      pending={saving}
      error={answer}
      onSubmit={async () => {
        setSubmitted(true);
        const read = linesOf(drafts);
        if (!read.ok) {
          setAnswer(read.message);
          return;
        }
        if (!reason.trim()) return;
        setSaving(true);
        setAnswer(null);
        const out = await attemptWith(
          () =>
            send({
              data: { invoiceId: data.invoice.id, lines: read.lines, reason },
            }),
          "It could not be credited.",
        );
        setSaving(false);
        if (!out.ok) {
          setAnswer(out.message);
          return;
        }
        toast.success(`Credited as ${out.value.number}.`);
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        An issued invoice is never changed: a credit note takes back what was
        agreed, at the invoice's VAT, and the invoice is issued again if need
        be.
      </p>
      <InvoiceLinesFields
        currency={data.invoice.currency}
        drafts={drafts}
        onChange={setDrafts}
      />
      <WhyField value={reason} onChange={setReason} submitted={submitted} />
    </SheetForm>
  );
}
