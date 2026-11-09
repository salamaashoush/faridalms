import type { InvoiceLine } from "@faridalms/domain/invoices";

import { ButtonLink } from "@faridalms/ui/system/button-link";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { FormFooter } from "@faridalms/ui/system/form-footer";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { FormSection } from "@faridalms/ui/system/record-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { attemptWith } from "../actions";
import { InvoiceLines } from "../components/InvoiceLinesForm";
import { addInvoice, getInvoiceCustomers } from "../server/invoicing";

export const Route = createFileRoute("/invoices/new")({
  validateSearch: v.object({
    customerId: v.optional(v.pipe(v.string(), v.uuid())),
  }),
  staticData: { section: "/billing", title: "New invoice" },
  loader: () => getInvoiceCustomers(),
  component: NewInvoice,
});

/**
 * An invoice by hand: a service sold once, or anything off the schedule.
 * Opened from a customer it is for that customer; opened from Billing it
 * asks whom it is for first.
 */
function NewInvoice() {
  const { customers, today } = Route.useLoaderData();
  const { customerId: given } = Route.useSearch();
  const navigate = useNavigate();
  const add = useServerFn(addInvoice);
  const fixed = customers.find((row) => row.id === given);
  const [customerId, setCustomerId] = useState(fixed?.id ?? "");
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [forDay, setForDay] = useState(today);
  const [submitted, setSubmitted] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const customer = customers.find((row) => row.id === customerId);
  return (
    <Page width="form">
      <PageHeader
        title="New invoice"
        description={
          fixed
            ? `For ${fixed.legalNameEn}, in ${fixed.currency}. It stays a draft until it is issued.`
            : "It stays a draft until it is issued."
        }
      />
      <form
        aria-label="New invoice"
        noValidate
        className="grid gap-10"
        onSubmit={async (event) => {
          event.preventDefault();
          setSubmitted(true);
          if (!customer) return;
          if (lines.length === 0) {
            setAnswer("Add a line.");
            return;
          }
          setSaving(true);
          setAnswer(null);
          const out = await attemptWith(
            () =>
              add({
                data: { customerId: customer.id, forDay, lines },
              }),
            "The invoice could not be drafted.",
          );
          setSaving(false);
          if (!out.ok) {
            setAnswer(out.message);
            return;
          }
          toast.success("Draft saved.");
          await navigate({
            to: "/invoices/$invoiceId",
            params: { invoiceId: out.value.id },
          });
        }}
      >
        <FormSection title={fixed ? "When" : "Who and when"}>
          {fixed ? null : (
            <SelectField
              label="Customer"
              value={customerId}
              options={[
                { value: "", label: "Choose…" },
                ...customers.map((row) => ({
                  value: row.id,
                  label: row.legalNameEn,
                })),
              ]}
              hint={
                customer
                  ? `Invoiced in ${customer.currency}, ${customer.vatName ?? "VAT"} at ${customer.vatPercent.toLocaleString("en")}%.`
                  : undefined
              }
              errors={
                submitted && !customer ? ["Choose the customer."] : undefined
              }
              onChange={setCustomerId}
            />
          )}
          <TextField
            label="For the day"
            hint="The day the service is for; the customer's invoices are ordered by it."
            type="date"
            width="date"
            value={forDay}
            onChange={(event) => setForDay(event.target.value)}
          />
        </FormSection>
        <FormSection title="Lines">
          <InvoiceLines
            caption="Lines"
            currency={customer?.currency ?? null}
            lines={lines}
            onSave={(next) => {
              setLines(next);
              if (next.length) setAnswer(null);
              return null;
            }}
            vat={
              customer
                ? { percent: customer.vatPercent, name: customer.vatName }
                : undefined
            }
            empty={{
              title: "Add what the invoice is for",
              description:
                "Each line is a service or an item, in English and Arabic, with its quantity, price and any discount; the VAT and total are worked out under them.",
            }}
          />
        </FormSection>
        <FormFooter
          submitLabel="Save the draft"
          pending={saving}
          error={answer}
          secondary={
            fixed ? (
              <ButtonLink
                to="/customers/$customerId"
                params={{ customerId: fixed.id }}
                variant="outline"
              >
                Cancel
              </ButtonLink>
            ) : (
              <ButtonLink to="/billing" variant="outline">
                Cancel
              </ButtonLink>
            )
          }
        />
      </form>
    </Page>
  );
}
