import type { InvoiceState, SchoolBilling } from "@faridalms/domain/invoices";
import type {
  Column,
  DataTableCard,
  RowAction,
} from "@faridalms/ui/system/data-table";
import type { Tone } from "@faridalms/ui/system/status";

import { InvoiceDocument } from "@faridalms/documents/InvoiceDocument";
import { Button } from "@faridalms/ui/button";
import { DataTable } from "@faridalms/ui/system/data-table";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import {
  RecordList,
  RecordSection,
  RecordStack,
} from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, ReceiptText } from "lucide-react";
import { useState } from "react";

import { PaperSheet } from "~/components/system/PaperSheet";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { billingQuery } from "~/queries/billing";
import { currentUserQuery } from "~/queries/user";
import { formatAmount, formatDate } from "~/utils/datetime";
import { requirePage } from "~/utils/page-access";

export const Route = createFileRoute("/_app/_staff/billing")({
  staticData: { breadcrumb: m.billingTitle },
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    requirePage(user, "billing:read");
    await context.queryClient.ensureQueryData(billingQuery);
  },
  component: BillingPage,
});

type Invoice = SchoolBilling["invoices"][number];

const STATE: Record<
  Exclude<InvoiceState, "draft">,
  { label: () => string; tone: Tone }
> = {
  issued: { label: m.billingStateIssued, tone: "warning" },
  partly_paid: { label: m.billingStatePartlyPaid, tone: "warning" },
  paid: { label: m.billingStatePaid, tone: "success" },
  credited: { label: m.billingStateCredited, tone: "neutral" },
};

const money = (minor: number, currency: string) =>
  formatAmount(minor / 100, currency);

/**
 * The school's invoices from the platform's business, for administrators
 * who may see them: what each owes, its paper in the school's language, a
 * card link where one was made, the bank to transfer to, and who receives
 * the invoices. When the business cannot be reached, it says so and
 * nothing else is affected.
 */
function BillingPage() {
  const { data } = useSuspenseQuery(billingQuery);
  return (
    <Page width="record">
      <PageHeader
        title={m.billingTitle()}
        description={m.billingDescription()}
      />
      {data.available ? (
        <Billing billing={data} />
      ) : (
        <output className="block max-w-2xl rounded-lg border bg-card px-4 py-3 text-sm">
          {m.billingUnavailable()}
        </output>
      )}
    </Page>
  );
}

interface Shown {
  invoice: Invoice;
  credit: Invoice["credits"][number] | null;
}

interface InvoiceRow extends Invoice {
  overdue: boolean;
}

type View = (shown: Shown) => void;

function invoiceColumns(view: View): Column<InvoiceRow>[] {
  return [
    {
      id: "invoice",
      header: m.billingColInvoice(),
      primary: true,
      cell: (row) => (
        <Button
          type="button"
          variant="link"
          className="h-auto max-w-full justify-start truncate p-0 text-foreground"
          onClick={() => view({ invoice: row, credit: null })}
        >
          {m.billingInvoice({ number: row.number })}
        </Button>
      ),
    },
    {
      id: "state",
      header: m.billingColStatus(),
      cell: (row) => <InvoiceStatus row={row} />,
    },
    {
      id: "issued",
      header: m.billingColIssued(),
      cell: (row) => formatDate(row.issuedOn),
    },
    {
      id: "due",
      header: m.billingColDue(),
      cell: (row) => formatDate(row.dueOn),
    },
    {
      id: "total",
      header: m.billingColTotal(),
      align: "end",
      cell: (row) => money(row.totalMinor, row.currency),
    },
    {
      id: "owed",
      header: m.billingColOwed(),
      align: "end",
      cell: (row) => money(row.owedMinor, row.currency),
    },
  ];
}

interface InvoiceStatusProps {
  row: InvoiceRow;
}

function InvoiceStatus({ row }: InvoiceStatusProps) {
  const state = row.state === "draft" ? null : STATE[row.state];
  return (
    <span className="flex flex-wrap items-center gap-x-2">
      {state ? (
        <StatusText tone={state.tone}>{state.label()}</StatusText>
      ) : null}
      {row.overdue ? (
        <StatusText tone="danger">{m.billingOverdue()}</StatusText>
      ) : null}
    </span>
  );
}

const INVOICE_CARD: DataTableCard<InvoiceRow> = {
  title: (row) => m.billingInvoice({ number: row.number }),
  status: (row) => <InvoiceStatus row={row} />,
  fact: (row) =>
    row.owedMinor > 0
      ? m.billingOwed({
          amount: money(row.owedMinor, row.currency),
          total: money(row.totalMinor, row.currency),
        })
      : m.billingSettled({ total: money(row.totalMinor, row.currency) }),
};

function invoiceActions(row: InvoiceRow, view: View): RowAction[] {
  const link = row.paymentLinkUrl;
  return [
    ...(link
      ? [
          {
            label: m.billingPayCard(),
            icon: CreditCard,
            inline: true,
            href: link,
            onSelect: () => {
              window.open(link, "_blank", "noreferrer");
            },
          },
        ]
      : []),
    {
      label: m.billingView(),
      onSelect: () => view({ invoice: row, credit: null }),
    },
    ...row.credits.map((credit) => ({
      label: m.billingCreditNote({ number: credit.number }),
      onSelect: () => view({ invoice: row, credit }),
    })),
  ];
}

interface BillingProps {
  billing: SchoolBilling;
}

function Billing({ billing }: BillingProps) {
  const { today } = useCurrentUser();
  const language = getLocale() === "ar" ? "ar" : "en";
  const [shown, setShown] = useState<Shown | null>(null);
  const bank =
    language === "ar"
      ? billing.business?.bankDetailsAr
      : billing.business?.bankDetailsEn;
  const rows: InvoiceRow[] = billing.invoices.map((invoice) => ({
    ...invoice,
    overdue: invoice.owedMinor > 0 && invoice.dueOn < today,
  }));
  return (
    <RecordStack>
      <RecordSection title={m.billingInvoicesTitle()}>
        <DataTable
          caption={m.billingInvoicesTitle()}
          rows={rows}
          columns={invoiceColumns(setShown)}
          rowLabel={(row) => m.billingInvoice({ number: row.number })}
          rowActions={(row) => invoiceActions(row, setShown)}
          card={INVOICE_CARD}
          empty={{
            icon: ReceiptText,
            title: m.billingNone(),
            description: m.billingNoneBody(),
          }}
        />
      </RecordSection>

      {bank ? (
        <RecordSection
          title={m.billingBankTitle()}
          description={m.billingBankReference()}
        >
          <p className="text-sm leading-5 whitespace-pre-line" dir="auto">
            {bank}
          </p>
        </RecordSection>
      ) : null}

      <RecordSection title={m.billingContactsTitle()}>
        {billing.contacts.length ? (
          <RecordList>
            {billing.contacts.map((contact) => (
              <li
                key={`${contact.name}-${contact.email ?? contact.phone ?? ""}`}
                className="grid gap-0.5 py-3 text-sm leading-5"
              >
                <span dir="auto" className="font-medium">
                  {contact.name}
                </span>
                {contact.email || contact.phone ? (
                  <span
                    dir="ltr"
                    className="justify-self-start text-muted-foreground"
                  >
                    {contact.email ?? contact.phone}
                  </span>
                ) : null}
              </li>
            ))}
          </RecordList>
        ) : (
          <EmptyState placement="section" title={m.billingContactsNone()} />
        )}
      </RecordSection>

      {shown && billing.customer ? (
        <PaperSheet
          title={
            shown.credit
              ? m.billingCreditNote({ number: shown.credit.number })
              : m.billingInvoice({ number: shown.invoice.number })
          }
          hint={m.billingPrint()}
          onDone={() => setShown(null)}
        >
          <div className="w-[190mm] max-w-full">
            <InvoiceDocument
              language={language}
              business={billing.business ?? null}
              vatName={billing.vatName ?? null}
              party={billing.customer}
              document={
                shown.credit
                  ? {
                      kind: "credit_note",
                      number: shown.credit.number,
                      issuedOn: shown.credit.issuedOn,
                      dueOn: null,
                      currency: shown.invoice.currency,
                      purchaseOrder: shown.invoice.purchaseOrder,
                      vatPercent: shown.invoice.vatPercent,
                      reverseCharge: shown.invoice.reverseCharge,
                      subtotalMinor: shown.credit.subtotalMinor,
                      vatMinor: shown.credit.vatMinor,
                      totalMinor: shown.credit.totalMinor,
                      lines: shown.credit.lines,
                      creditFor: {
                        number: shown.invoice.number,
                        reason: shown.credit.reason,
                      },
                    }
                  : {
                      kind: "invoice",
                      number: shown.invoice.number,
                      issuedOn: shown.invoice.issuedOn,
                      dueOn: shown.invoice.dueOn,
                      currency: shown.invoice.currency,
                      purchaseOrder: shown.invoice.purchaseOrder,
                      vatPercent: shown.invoice.vatPercent,
                      reverseCharge: shown.invoice.reverseCharge,
                      subtotalMinor: shown.invoice.subtotalMinor,
                      vatMinor: shown.invoice.vatMinor,
                      totalMinor: shown.invoice.totalMinor,
                      lines: shown.invoice.lines,
                    }
              }
            />
          </div>
        </PaperSheet>
      ) : null}
    </RecordStack>
  );
}
