import type { InvoiceLine } from "@faridalms/domain/invoices";

import { ButtonLink } from "@faridalms/ui/system/button-link";
import { FormFooter } from "@faridalms/ui/system/form-footer";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { FormSection } from "@faridalms/ui/system/record-form";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { attemptWith } from "../actions";
import { InvoiceLines } from "../components/InvoiceLinesForm";
import { WhyField } from "../components/Why";
import { formatMoney } from "../format";
import { credit, getInvoice } from "../server/invoicing";

export const Route = createFileRoute("/invoices/$invoiceId_/credit")({
  staticData: { section: "/billing", title: "Credit note" },
  loader: async ({ params }) => {
    const data = await getInvoice({ data: { id: params.invoiceId } });
    const { state } = data.invoice;
    if (state === "draft" || state === "credited")
      throw redirect({
        to: "/invoices/$invoiceId",
        params: { invoiceId: params.invoiceId },
        search: {},
      });
    return data;
  },
  component: CreditNote,
});

/**
 * A credit note against an issued invoice, which never changes once
 * issued: the lines it takes back, each added in its own sheet, totalled
 * at the invoice's VAT, and why.
 */
function CreditNote() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const send = useServerFn(credit);
  const { invoice, customer } = data;
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const back = { invoiceId: invoice.id };
  return (
    <Page width="form">
      <PageHeader
        title={`Credit invoice ${invoice.number ?? ""}`}
        description={`For ${customer.legalNameEn}, which was invoiced ${formatMoney(invoice.totalMinor, invoice.currency)}. An issued invoice is never changed: a credit note takes back what was agreed, at the invoice's VAT, and the invoice is issued again if need be.`}
      />
      <form
        aria-label="Credit it"
        noValidate
        className="grid gap-10"
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitted(true);
          if (lines.length === 0) {
            setAnswer("Add a line.");
            return;
          }
          if (!reason.trim()) return;
          setSaving(true);
          setAnswer(null);
          const out = await attemptWith(
            () => send({ data: { invoiceId: invoice.id, lines, reason } }),
            "It could not be credited.",
          );
          setSaving(false);
          if (!out.ok) {
            setAnswer(out.message);
            return;
          }
          toast.success(`Credited as ${out.value.number}.`);
          await navigate({
            to: "/invoices/$invoiceId",
            params: back,
            search: { tab: "credits" },
          });
        }}
      >
        <FormSection title="Lines">
          <InvoiceLines
            caption="Lines"
            currency={invoice.currency}
            lines={lines}
            vat={{
              percent: Number(invoice.vatPercent),
              name: data.vatName?.en ?? null,
            }}
            from={{ label: "Take back a line", lines: data.lines }}
            onSave={(next) => {
              setLines(next);
              if (next.length) setAnswer(null);
              return null;
            }}
            empty={{
              title: "Add what it takes back",
              description:
                "Each line is what is credited, in English and Arabic, with its quantity and price; the VAT and total are worked out under them.",
            }}
          />
        </FormSection>
        <WhyField value={reason} onChange={setReason} submitted={submitted} />
        <FormFooter
          submitLabel="Issue credit note"
          pending={saving}
          error={answer}
          secondary={
            <ButtonLink
              to="/invoices/$invoiceId"
              params={back}
              variant="outline"
            >
              Cancel
            </ButtonLink>
          }
        />
      </form>
    </Page>
  );
}
