import type { Currency } from "@faridalms/domain/subscriptions";
import type {
  ActionItem,
  PrimaryAction,
} from "@faridalms/ui/system/action-menu";
import type { AttentionItem } from "@faridalms/ui/system/attention-list";
import type {
  Column,
  DataTableCard,
  RowAction,
} from "@faridalms/ui/system/data-table";
import type { RecordTab } from "@faridalms/ui/system/record-page";

import { InvoiceDocument } from "@faridalms/documents/InvoiceDocument";
import { Button, buttonVariants } from "@faridalms/ui/button";
import { AttentionList } from "@faridalms/ui/system/attention-list";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { CellWithNote } from "@faridalms/ui/system/cell-note";
import { CopyButton } from "@faridalms/ui/system/copy-button";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { DocumentView } from "@faridalms/ui/system/document-view";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { Metric, MetricGrid } from "@faridalms/ui/system/metrics";
import { Page } from "@faridalms/ui/system/page";
import { Segmented } from "@faridalms/ui/system/panel";
import { RecordHeader, RecordTabs } from "@faridalms/ui/system/record-page";
import { SheetForm, useSheet } from "@faridalms/ui/system/sheet-form";
import { SummaryList } from "@faridalms/ui/system/summary-list";
import { Value } from "@faridalms/ui/system/value";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Banknote,
  BellOff,
  CreditCard,
  ExternalLink,
  FileCheck,
  HandCoins,
  Pencil,
  Printer,
  ReceiptText,
  Send,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type { TaxIdDocument } from "../components/TaxIdSheet";

import { attempt, attemptWith, failure } from "../actions";
import { EventList } from "../components/EventList";
import {
  blankLine,
  InvoiceLinesFields,
  lineDraftOf,
  linesOf,
} from "../components/InvoiceLinesForm";
import { PauseSheet } from "../components/PauseSheet";
import { PaymentSheet } from "../components/PaymentSheet";
import { TaxIdSheet } from "../components/TaxIdSheet";
import { WhyField } from "../components/Why";
import {
  DUNNING_STEP_NAMES,
  formatDay,
  formatMoney,
  INVOICE_KIND_NAMES,
  INVOICE_STANDING_NAMES,
  INVOICE_STANDING_TONE,
  minorOf,
  PAYMENT_METHOD_NAMES,
  standingOf,
} from "../format";
import { useMay } from "../may";
import {
  credit,
  getInvoice,
  issue,
  makePaymentLink,
  saveInvoiceDraft,
  settleFromPayment,
} from "../server/invoicing";

const INVOICE_TABS = [
  "document",
  "payments",
  "credits",
  "reminders",
  "history",
] as const;
type InvoiceTab = (typeof INVOICE_TABS)[number];

const TAB_NAMES: Record<InvoiceTab, string> = {
  document: "Document",
  payments: "Payments",
  credits: "Credit notes",
  reminders: "Reminders",
  history: "History",
};

export const Route = createFileRoute("/invoices/$invoiceId")({
  validateSearch: v.object({
    tab: v.fallback(v.optional(v.picklist(INVOICE_TABS)), undefined),
    language: v.fallback(v.optional(v.picklist(["en", "ar"])), undefined),
    /** A credit note of the invoice to show instead of the invoice. */
    credit: v.fallback(v.optional(v.pipe(v.string(), v.uuid())), undefined),
  }),
  staticData: { section: "/billing", title: "Invoice" },
  loader: ({ params }) => getInvoice({ data: { id: params.invoiceId } }),
  component: InvoicePage,
});

type Data = Awaited<ReturnType<typeof getInvoice>>;
type CreditRow = Data["credits"][number];

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
] as const;

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString("en")} ${count === 1 ? one : many}`;

/**
 * One invoice: the paper the customer receives first, then what paid it,
 * what credited it, the reminders its clock sent and its history. A draft
 * is checked and issued here; an open one is settled or credited.
 */
function InvoicePage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const mayBill = useMay("billing");
  const { invoice, customer, today } = data;
  const draft = invoice.state === "draft";
  const standing = standingOf(
    { state: invoice.state, dueOn: invoice.dueOn, owedMinor: data.owedMinor },
    today,
  );
  const open = invoice.state === "issued" || invoice.state === "partly_paid";
  const issuing = useIssue(data);
  const editing = useSheet();
  const crediting = useSheet();
  const settling = useSheet();
  const paying = useSheet();
  const pausing = useSheet();
  const recording = useSheet();
  const [taxDocument, setTaxDocument] = useState<TaxIdDocument | null>(null);
  const makeLink = useMakeLink(data);
  const mayCredit = mayBill && !draft && invoice.state !== "credited";
  const maySettle = mayBill && open && data.unsettled.length > 0;
  const mayLink = mayBill && open && data.cards && invoice.currency === "EGP";
  const recordTaxId = (document: TaxIdDocument) => {
    setTaxDocument(document);
    recording.show();
  };
  const invoiceTaxId: TaxIdDocument = {
    kind: "invoice",
    id: invoice.id,
    number: invoice.number,
    held: invoice.taxAuthorityId,
  };
  const tabs: RecordTab<InvoiceTab>[] = INVOICE_TABS.filter(
    (value) => !draft || value === "document" || value === "history",
  ).map((value) => ({
    value,
    label: TAB_NAMES[value],
    count:
      value === "payments"
        ? data.allocations.length
        : value === "credits"
          ? data.credits.length
          : value === "reminders"
            ? data.reminders.length
            : undefined,
  }));
  const tab =
    search.tab && tabs.some((one) => one.value === search.tab)
      ? search.tab
      : "document";
  const print = () => {
    if (tab !== "document")
      void navigate({
        search: (previous) => ({ ...previous, tab: undefined }),
        replace: true,
        resetScroll: false,
      }).then(() => requestAnimationFrame(() => window.print()));
    else window.print();
  };
  const action: PrimaryAction | undefined = !mayBill
    ? undefined
    : draft
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
        : open
          ? { label: "Record a payment", icon: Banknote, onClick: paying.show }
          : undefined;
  const menu: ActionItem[] = [
    ...(mayBill && draft
      ? [{ label: "Edit the draft", icon: Pencil, onSelect: editing.show }]
      : []),
    ...(mayBill && open && action?.label !== "Record a payment"
      ? [{ label: "Record a payment", icon: Banknote, onSelect: paying.show }]
      : []),
    ...(maySettle && action?.label !== "Settle from a payment"
      ? [
          {
            label: "Settle from a payment",
            icon: HandCoins,
            onSelect: settling.show,
          },
        ]
      : []),
    ...(mayLink
      ? [
          {
            label: invoice.paymentLinkUrl
              ? "Make a new payment link"
              : "Make a payment link",
            icon: CreditCard,
            onSelect: makeLink,
          },
        ]
      : []),
    ...(mayBill && open
      ? [{ label: "Pause reminders", icon: BellOff, onSelect: pausing.show }]
      : []),
    ...(mayCredit
      ? [{ label: "Credit it", icon: ReceiptText, onSelect: crediting.show }]
      : []),
    ...(mayBill && !draft
      ? [
          {
            label: invoice.taxAuthorityId
              ? "Change the tax authority id"
              : "Record the tax authority id",
            icon: FileCheck,
            onSelect: () => recordTaxId(invoiceTaxId),
          },
        ]
      : []),
    { label: "Print or save as PDF", icon: Printer, onSelect: print },
  ];
  return (
    <Page width="record">
      <div className="print:hidden">
        <RecordHeader
          title={invoice.number ? `Invoice ${invoice.number}` : "Draft invoice"}
          status={{
            label: INVOICE_STANDING_NAMES[standing],
            tone: INVOICE_STANDING_TONE[standing],
          }}
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
            ...(invoice.taxAuthorityId
              ? [
                  {
                    label: "Tax authority id",
                    value: (
                      <>
                        Tax authority id{" "}
                        <span dir="ltr">{invoice.taxAuthorityId}</span>
                      </>
                    ),
                  },
                ]
              : []),
          ]}
          action={action}
          menu={menu}
        />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
        {draft ? null : (
          <div className="print:hidden">
            <Figures data={data} />
          </div>
        )}
        <div className="empty:hidden print:hidden">
          <ToDo data={data} onRecordTaxId={recordTaxId} />
        </div>
        <RecordTabs
          label="The invoice's records"
          tabs={tabs}
          value={tab}
          onChange={(next) =>
            void navigate({
              search: (previous) => ({
                ...previous,
                tab: next === "document" ? undefined : next,
              }),
              replace: true,
              resetScroll: false,
            })
          }
        >
          {tab === "payments" ? (
            <PaymentsTab
              data={data}
              onPay={open && mayBill ? paying.show : null}
            />
          ) : tab === "credits" ? (
            <CreditsTab
              data={data}
              onCredit={mayCredit ? crediting.show : null}
              onRecordTaxId={mayBill ? recordTaxId : null}
            />
          ) : tab === "reminders" ? (
            <RemindersTab
              data={data}
              onPause={open && mayBill ? pausing.show : null}
            />
          ) : tab === "history" ? (
            <EventList events={data.history} names={data.names} />
          ) : (
            <DocumentTab
              data={data}
              onEdit={mayBill && draft ? editing.show : null}
              onPrint={print}
            />
          )}
        </RecordTabs>
      </div>
      {mayBill && draft ? (
        <DraftSheet
          key={`edit-${editing.key}`}
          data={data}
          open={editing.open}
          onOpenChange={editing.onOpenChange}
        />
      ) : null}
      {mayCredit ? (
        <CreditSheet
          key={`credit-${crediting.key}`}
          data={data}
          open={crediting.open}
          onOpenChange={crediting.onOpenChange}
        />
      ) : null}
      {maySettle ? (
        <SettleSheet
          key={`settle-${settling.key}`}
          data={data}
          open={settling.open}
          onOpenChange={settling.onOpenChange}
        />
      ) : null}
      {mayBill && open ? (
        <>
          <PaymentSheet
            key={`pay-${paying.key}`}
            customers={[
              {
                id: customer.id,
                legalNameEn: customer.legalNameEn,
                currency: customer.currency,
              },
            ]}
            today={today}
            open={paying.open}
            onOpenChange={paying.onOpenChange}
          />
          <PauseSheet
            key={`pause-${pausing.key}`}
            customerId={customer.id}
            today={today}
            open={pausing.open}
            onOpenChange={pausing.onOpenChange}
          />
        </>
      ) : null}
      {mayBill && taxDocument ? (
        <TaxIdSheet
          key={`tax-${recording.key}`}
          document={taxDocument}
          open={recording.open}
          onOpenChange={recording.onOpenChange}
        />
      ) : null}
    </Page>
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

/** Makes a Paymob link for what is owed, which the school's Billing page offers. */
function useMakeLink(data: Data): () => Promise<void> {
  const router = useRouter();
  const make = useServerFn(makePaymentLink);
  return async () => {
    try {
      const out = await make({ data: { id: data.invoice.id } });
      if (out.ok) {
        toast.success("Payment link made.");
        await router.invalidate();
      } else toast.error(out.message);
    } catch (error) {
      const said = failure(error, "The link could not be made.");
      if (said) toast.error(said);
    }
  };
}

/** What the invoice comes to, what has come in against it, and what is left. */
function Figures({ data }: InvoiceProps) {
  const { invoice, today } = data;
  const money = (minor: number) => formatMoney(minor, invoice.currency);
  const last = data.allocations.at(-1);
  const overdue =
    data.owedMinor > 0 && invoice.dueOn !== null && invoice.dueOn < today;
  return (
    <MetricGrid label="At a glance">
      <Metric
        label="Total"
        value={money(invoice.totalMinor)}
        detail={
          invoice.issuedOn
            ? { text: `Issued ${formatDay(invoice.issuedOn)}` }
            : undefined
        }
      />
      {last ? (
        <Metric
          label="Paid"
          value={money(data.paidMinor)}
          detail={{
            text: `Last received ${formatDay(last.payment.receivedOn)}`,
          }}
        />
      ) : null}
      {data.creditedMinor > 0 ? (
        <Metric
          label="Credited"
          value={money(data.creditedMinor)}
          detail={{
            text: plural(data.credits.length, "credit note", "credit notes"),
          }}
        />
      ) : null}
      <Metric
        label="Owed"
        value={money(data.owedMinor)}
        detail={
          data.owedMinor === 0
            ? { text: "Settled", tone: "success" }
            : overdue && invoice.dueOn
              ? {
                  text: `Overdue since ${formatDay(invoice.dueOn)}`,
                  tone: "danger",
                }
              : invoice.dueOn
                ? { text: `Due ${formatDay(invoice.dueOn)}` }
                : undefined
        }
      />
    </MetricGrid>
  );
}

interface ToDoProps extends InvoiceProps {
  onRecordTaxId: (document: TaxIdDocument) => void;
}

/** What stops a draft being issued, and the ids still to copy from the tax authority. */
function ToDo({ data, onRecordTaxId }: ToDoProps) {
  const mayBill = useMay("billing");
  const { invoice, customer } = data;
  const items: AttentionItem[] = [];
  if (invoice.state === "draft") {
    if (invoice.reverseCharge && !customer.taxNumber)
      items.push({
        id: "tax-number",
        tone: "warning",
        title: "The customer's tax registration number is missing",
        detail:
          "It accounts for the VAT itself, so the invoice must cite its number before it is issued.",
        action: (
          <ButtonLink
            variant="outline"
            size="sm"
            to="/customers/$customerId"
            params={{ customerId: customer.id }}
          >
            Open the customer
          </ButtonLink>
        ),
      });
    if (!data.business)
      items.push({
        id: "business",
        tone: "warning",
        title: "The business's legal details are missing",
        detail: "Every invoice carries them, so none can be issued yet.",
        action: (
          <ButtonLink variant="outline" size="sm" to="/settings">
            Open settings
          </ButtonLink>
        ),
      });
  } else if (!invoice.taxAuthorityId)
    items.push({
      id: "tax-id",
      tone: "info",
      title: "Its tax authority id is not recorded",
      detail:
        "Submit it as an e-invoice, then record the id the tax authority gives it.",
      action: mayBill ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onRecordTaxId({
              kind: "invoice",
              id: invoice.id,
              number: invoice.number,
              held: null,
            })
          }
        >
          Record its id
        </Button>
      ) : undefined,
    });
  for (const note of data.credits)
    if (!note.taxAuthorityId)
      items.push({
        id: `credit-${note.id}`,
        tone: "info",
        title: `Credit note ${note.number} has no tax authority id`,
        detail: "Submit it as an e-invoice too, then record its id.",
        action: mayBill ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onRecordTaxId({
                kind: "credit_note",
                id: note.id,
                number: note.number,
                held: null,
              })
            }
          >
            Record the id of {note.number}
          </Button>
        ) : undefined,
      });
  return <AttentionList title="To do" items={items} />;
}

interface DocumentTabProps extends InvoiceProps {
  onEdit: (() => void) | null;
  onPrint: () => void;
}

/**
 * The paper as the customer receives it, in either language; a credit
 * note opened from its tab in its place. A draft says first what may still
 * change before it is issued.
 */
function DocumentTab({ data, onEdit, onPrint }: DocumentTabProps) {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { invoice, customer } = data;
  const language = search.language ?? invoice.language;
  const shown = data.credits.find((note) => note.id === search.credit);
  const open = invoice.state === "issued" || invoice.state === "partly_paid";
  const link = open ? invoice.paymentLinkUrl : null;
  const label = shown
    ? `Credit note ${shown.number}`
    : invoice.number
      ? `Invoice ${invoice.number}`
      : "Draft invoice";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      {invoice.state === "draft" ? (
        <SummaryList
          title="Before it is issued"
          align="start"
          action={
            onEdit ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Edit the draft"
                onClick={onEdit}
              >
                <Pencil aria-hidden />
                Edit
              </Button>
            ) : undefined
          }
          items={[
            {
              id: "po",
              label: "Customer's purchase order",
              value: (
                <Value>
                  {invoice.purchaseOrder ? (
                    <span dir="auto">{invoice.purchaseOrder}</span>
                  ) : null}
                </Value>
              ),
            },
            {
              id: "language",
              label: "Written in",
              value: invoice.language === "ar" ? "Arabic" : "English",
            },
            {
              id: "lines",
              label: "Lines",
              value: `${plural(data.lines.length, "line", "lines")}, ${formatMoney(invoice.totalMinor, invoice.currency)} in all`,
            },
          ]}
        />
      ) : null}
      <DocumentView
        label={label}
        tools={
          <>
            <Segmented
              label="Show in"
              value={language}
              options={[...LANGUAGES]}
              onChange={(next) =>
                void navigate({
                  search: (previous) => ({ ...previous, language: next }),
                  replace: true,
                  resetScroll: false,
                })
              }
            />
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
          </>
        }
        actions={
          <>
            {link && !shown ? (
              <span className="flex items-center gap-1">
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  <ExternalLink aria-hidden />
                  Payment link
                </a>
                <CopyButton value={link} label="Copy the payment link" />
              </span>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="max-md:h-10"
              onClick={onPrint}
            >
              <Printer aria-hidden />
              Print or save as PDF
            </Button>
          </>
        }
      >
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
      </DocumentView>
    </div>
  );
}

type Settlement = Data["allocations"][number] & { id: string };

const SETTLEMENT_COLUMNS: Column<Settlement>[] = [
  {
    id: "received",
    header: "Received",
    primary: true,
    cell: ({ payment }) => formatDay(payment.receivedOn),
  },
  {
    id: "how",
    header: "How",
    cell: ({ payment }) => PAYMENT_METHOD_NAMES[payment.method],
  },
  {
    id: "reference",
    header: "Reference",
    cell: ({ payment }) => (
      <span dir="ltr" className="text-muted-foreground">
        {payment.reference}
      </span>
    ),
  },
  {
    id: "settled",
    header: "Settled",
    align: "end",
    cell: ({ allocation, payment }) =>
      formatMoney(allocation.amountMinor, payment.currency),
  },
];

const SETTLEMENT_CARD: DataTableCard<Settlement> = {
  title: ({ allocation, payment }) =>
    formatMoney(allocation.amountMinor, payment.currency),
  fact: ({ payment }) =>
    `${PAYMENT_METHOD_NAMES[payment.method]} · ${formatDay(payment.receivedOn)}`,
};

interface PaymentsTabProps extends InvoiceProps {
  onPay: (() => void) | null;
}

/** The payments that settled the invoice, oldest first, and how much of each. */
function PaymentsTab({ data, onPay }: PaymentsTabProps) {
  const rows = data.allocations.map((row) => ({
    ...row,
    id: row.allocation.id,
  }));
  const record = onPay ? (
    <Button type="button" variant="outline" size="sm" onClick={onPay}>
      <Banknote aria-hidden />
      Record a payment
    </Button>
  ) : null;
  return (
    <DataTable
      caption="Payments"
      rows={rows}
      columns={SETTLEMENT_COLUMNS}
      rowLabel={({ payment }) => payment.reference}
      card={SETTLEMENT_CARD}
      actions={record}
      totals={
        rows.length > 1
          ? [
              {
                id: "paid",
                label: "Paid",
                cells: {
                  settled: formatMoney(data.paidMinor, data.invoice.currency),
                },
              },
            ]
          : undefined
      }
      empty={{
        icon: Banknote,
        title: "Record what it was paid",
        description:
          "A transfer, a cheque or a withholding certificate is recorded here; a card payment through its payment link records itself.",
        action: record,
      }}
    />
  );
}

function creditColumns(
  invoiceId: string,
  currency: Currency,
): Column<CreditRow>[] {
  return [
    {
      id: "number",
      header: "Credit note",
      primary: true,
      cell: (note) => (
        <CellWithNote note={note.reason}>
          <RowLink
            to="/invoices/$invoiceId"
            params={{ invoiceId: invoiceId }}
            search={{ credit: note.id }}
          >
            {note.number}
          </RowLink>
        </CellWithNote>
      ),
    },
    {
      id: "issued",
      header: "Issued",
      cell: (note) => formatDay(note.issuedOn),
    },
    {
      id: "taxId",
      header: "Tax authority id",
      cell: (note) => (
        <Value>
          {note.taxAuthorityId ? (
            <span dir="ltr">{note.taxAuthorityId}</span>
          ) : null}
        </Value>
      ),
    },
    {
      id: "amount",
      header: "Amount",
      align: "end",
      cell: (note) => formatMoney(note.totalMinor, currency),
    },
  ];
}

function creditCard(
  invoiceId: string,
  currency: Currency,
): DataTableCard<CreditRow> {
  return {
    title: (note) => (
      <RowLink
        to="/invoices/$invoiceId"
        params={{ invoiceId: invoiceId }}
        search={{ credit: note.id }}
      >
        {note.number}
      </RowLink>
    ),
    fact: (note) =>
      `${formatMoney(note.totalMinor, currency)} · ${formatDay(note.issuedOn)}`,
  };
}

interface CreditsTabProps extends InvoiceProps {
  onCredit: (() => void) | null;
  onRecordTaxId: ((document: TaxIdDocument) => void) | null;
}

/** The credit notes taken against the invoice, each with why and its tax authority id. */
function CreditsTab({ data, onCredit, onRecordTaxId }: CreditsTabProps) {
  const navigate = Route.useNavigate();
  const { invoice } = data;
  const columns = creditColumns(invoice.id, invoice.currency);
  const card = creditCard(invoice.id, invoice.currency);
  const rowActions = (note: CreditRow): RowAction[] => [
    {
      label: "Show it",
      icon: ReceiptText,
      onSelect: () =>
        void navigate({
          search: (previous) => ({
            ...previous,
            tab: undefined,
            credit: note.id,
          }),
        }),
    },
    ...(onRecordTaxId
      ? [
          {
            label: note.taxAuthorityId
              ? "Change its tax authority id"
              : "Record its tax authority id",
            icon: FileCheck,
            onSelect: () =>
              onRecordTaxId({
                kind: "credit_note",
                id: note.id,
                number: note.number,
                held: note.taxAuthorityId,
              }),
          },
        ]
      : []),
  ];
  const creditIt = onCredit ? (
    <Button type="button" variant="outline" size="sm" onClick={onCredit}>
      <ReceiptText aria-hidden />
      Credit it
    </Button>
  ) : null;
  return (
    <DataTable
      caption="Credit notes"
      rows={data.credits}
      columns={columns}
      rowLabel={(note) => note.number}
      card={card}
      rowActions={rowActions}
      actions={creditIt}
      totals={
        data.credits.length > 1
          ? [
              {
                id: "credited",
                label: "Credited",
                cells: {
                  amount: formatMoney(data.creditedMinor, invoice.currency),
                },
              },
            ]
          : undefined
      }
      empty={{
        icon: ReceiptText,
        title: "Credit what was agreed",
        description:
          "An issued invoice never changes: a credit note takes back part or all of it at its VAT, with why.",
        action: creditIt,
      }}
    />
  );
}

type Reminder = Data["reminders"][number] & { id: string };

const REMINDER_COLUMNS: Column<Reminder>[] = [
  {
    id: "step",
    header: "Step",
    primary: true,
    cell: (reminder) => DUNNING_STEP_NAMES[reminder.step],
  },
  {
    id: "taken",
    header: "Taken",
    cell: (reminder) => formatDay(reminder.takenOn),
  },
  {
    id: "emailed",
    header: "Emailed to",
    width: "wide",
    cell: (reminder) =>
      reminder.emailedTo.length ? (
        <span dir="ltr">{reminder.emailedTo.join(", ")}</span>
      ) : (
        <span className="text-muted-foreground">
          Nobody: no billing contact
        </span>
      ),
  },
];

const REMINDER_CARD: DataTableCard<Reminder> = {
  title: (reminder) => DUNNING_STEP_NAMES[reminder.step],
  fact: (reminder) => formatDay(reminder.takenOn),
};

interface RemindersTabProps extends InvoiceProps {
  onPause: (() => void) | null;
}

/** Each step the payment clock took for the invoice, and who its email went to. */
function RemindersTab({ data, onPause }: RemindersTabProps) {
  const rows = data.reminders.map((reminder) => ({
    ...reminder,
    id: reminder.step,
  }));
  const pause = onPause ? (
    <Button type="button" variant="outline" size="sm" onClick={onPause}>
      <BellOff aria-hidden />
      Pause reminders
    </Button>
  ) : null;
  return (
    <DataTable
      caption="Reminders"
      rows={rows}
      columns={REMINDER_COLUMNS}
      rowLabel={(reminder) => DUNNING_STEP_NAMES[reminder.step]}
      card={REMINDER_CARD}
      actions={pause}
      empty={{
        icon: BellOff,
        title: "No reminder sent yet",
        description:
          "The payment clock emails the billing contact a week before the due day, on it, and as the invoice becomes overdue; each email shows here.",
        action: pause,
      }}
    />
  );
}

interface InvoiceSheetProps extends InvoiceProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ar", label: "Arabic" },
] as const;

/** A draft's customer order number, its language and its lines, before it is issued. */
function DraftSheet({ data, open, onOpenChange }: InvoiceSheetProps) {
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
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Edit the draft"
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
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      <TextField
        label="Customer's purchase order"
        optional
        maxLength={60}
        value={purchaseOrder}
        onChange={(event) => setPurchaseOrder(event.target.value)}
      />
      <SelectField
        label="Written in"
        hint="The language the customer receives it in."
        value={language}
        options={LANGUAGE_OPTIONS}
        onChange={setLanguage}
      />
      <InvoiceLinesFields
        currency={data.invoice.currency}
        drafts={drafts}
        onChange={setDrafts}
        vat={{
          percent: Number(data.invoice.vatPercent),
          name: data.vatName?.en ?? null,
        }}
      />
    </SheetForm>
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
        hint={`${formatMoney(data.owedMinor, data.invoice.currency)} is owed.`}
        inputMode="decimal"
        width="code"
        value={amount}
        errors={submitted && !amountMinor ? ["Give the amount."] : undefined}
        onChange={(event) => setAmount(event.target.value)}
      />
    </SheetForm>
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
        vat={{
          percent: Number(data.invoice.vatPercent),
          name: data.vatName?.en ?? null,
        }}
      />
      <WhyField value={reason} onChange={setReason} submitted={submitted} />
    </SheetForm>
  );
}
