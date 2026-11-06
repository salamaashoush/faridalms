import type { InvoiceState, SchoolBilling } from "@faridalms/domain/invoices";
import type { Tone } from "@faridalms/ui/system/status";

import { InvoiceDocument } from "@faridalms/documents/InvoiceDocument";
import { Button, buttonVariants } from "@faridalms/ui/button";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { StatusText } from "@faridalms/ui/system/status";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { useState } from "react";

import { PaperSheet } from "~/components/system/PaperSheet";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { billingQuery } from "~/queries/billing";
import { formatAmount, formatDate } from "~/utils/datetime";

export const Route = createFileRoute("/_app/admin/billing")({
  staticData: { breadcrumb: m.billingTitle },
  loader: ({ context }) => context.queryClient.ensureQueryData(billingQuery),
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
    <div className="grid gap-6">
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
    </div>
  );
}

interface BillingProps {
  billing: SchoolBilling;
}

function Billing({ billing }: BillingProps) {
  const { today } = useCurrentUser();
  const language = getLocale() === "ar" ? "ar" : "en";
  const [shown, setShown] = useState<{
    invoice: Invoice;
    credit: Invoice["credits"][number] | null;
  } | null>(null);
  const bank =
    language === "ar"
      ? billing.business?.bankDetailsAr
      : billing.business?.bankDetailsEn;
  return (
    <>
      {billing.invoices.length ? (
        <ul className="grid max-w-3xl gap-3">
          {billing.invoices.map((invoice) => {
            const state =
              invoice.state === "draft" ? null : STATE[invoice.state];
            const overdue = invoice.owedMinor > 0 && invoice.dueOn < today;
            return (
              <li
                key={invoice.id}
                aria-label={m.billingInvoice({ number: invoice.number })}
                className="grid gap-2 rounded-lg border bg-card px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {m.billingInvoice({ number: invoice.number })}
                  </span>
                  <span className="flex items-center gap-2">
                    {state ? (
                      <StatusText tone={state.tone}>{state.label()}</StatusText>
                    ) : null}
                    {overdue ? (
                      <StatusText tone="danger">
                        {m.billingOverdue()}
                      </StatusText>
                    ) : null}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  {m.billingIssuedDue({
                    issued: formatDate(invoice.issuedOn, "full"),
                    due: formatDate(invoice.dueOn, "full"),
                  })}
                </p>
                <p className="tabular-nums">
                  {invoice.owedMinor > 0
                    ? m.billingOwed({
                        amount: money(invoice.owedMinor, invoice.currency),
                        total: money(invoice.totalMinor, invoice.currency),
                      })
                    : m.billingSettled({
                        total: money(invoice.totalMinor, invoice.currency),
                      })}
                </p>
                <span className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShown({ invoice, credit: null })}
                  >
                    {m.billingView()}
                  </Button>
                  {invoice.paymentLinkUrl ? (
                    <a
                      href={invoice.paymentLinkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({ size: "sm" })}
                    >
                      <CreditCard aria-hidden />
                      {m.billingPayCard()}
                    </a>
                  ) : null}
                  {invoice.credits.map((credit) => (
                    <Button
                      key={credit.id}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShown({ invoice, credit })}
                    >
                      {m.billingCreditNote({ number: credit.number })}
                    </Button>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{m.billingNone()}</p>
      )}

      {bank ? (
        <section className="grid max-w-3xl gap-1 text-sm">
          <h2 className="text-base font-semibold">{m.billingBankTitle()}</h2>
          <p className="whitespace-pre-line" dir="auto">
            {bank}
          </p>
          <p className="text-muted-foreground">{m.billingBankReference()}</p>
        </section>
      ) : null}

      <section className="grid max-w-3xl gap-1 text-sm">
        <h2 className="text-base font-semibold">{m.billingContactsTitle()}</h2>
        {billing.contacts.length ? (
          <ul className="grid gap-0.5">
            {billing.contacts.map((contact) => (
              <li
                key={`${contact.name}-${contact.email ?? contact.phone ?? ""}`}
              >
                {contact.name}
                {contact.email || contact.phone ? (
                  <span dir="ltr" className="text-muted-foreground">
                    {" "}
                    · {contact.email ?? contact.phone}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">{m.billingContactsNone()}</p>
        )}
      </section>

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
    </>
  );
}
