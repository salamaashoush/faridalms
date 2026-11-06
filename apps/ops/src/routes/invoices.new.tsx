import { businessToday } from "@faridalms/domain/subscriptions";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { TextField } from "@faridalms/ui/system/form-field";
import { FormFooter } from "@faridalms/ui/system/form-footer";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { FormSection } from "@faridalms/ui/system/record-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { attemptWith } from "../actions";
import {
  blankLine,
  InvoiceLinesFields,
  linesOf,
} from "../components/InvoiceLinesForm";
import { getCustomer } from "../server/customers";
import { addInvoice } from "../server/invoicing";

export const Route = createFileRoute("/invoices/new")({
  validateSearch: v.object({ customerId: v.pipe(v.string(), v.uuid()) }),
  staticData: { section: "/billing", title: "New invoice" },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getCustomer({ data: { id: deps.customerId } }),
  component: NewInvoice,
});

/** An invoice by hand: a service sold once, or anything off the schedule. */
function NewInvoice() {
  const { customer } = Route.useLoaderData();
  const navigate = useNavigate();
  const add = useServerFn(addInvoice);
  const [drafts, setDrafts] = useState(() => [blankLine()]);
  const [forDay, setForDay] = useState(businessToday());
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <div className="grid">
      <PageHeader
        title="New invoice"
        description={`For ${customer.legalNameEn}, in ${customer.currency} with the VAT its country is charged. It stays a draft until it is issued.`}
      />
      <form
        aria-label="New invoice"
        noValidate
        className="grid max-w-3xl gap-10"
        onSubmit={async (event) => {
          event.preventDefault();
          const read = linesOf(drafts);
          if (!read.ok) {
            setAnswer(read.message);
            return;
          }
          setSaving(true);
          setAnswer(null);
          const out = await attemptWith(
            () =>
              add({
                data: { customerId: customer.id, forDay, lines: read.lines },
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
        <FormSection title="When">
          <TextField
            label="For the day"
            type="date"
            width="date"
            value={forDay}
            onChange={(event) => setForDay(event.target.value)}
          />
        </FormSection>
        <FormSection title="Lines">
          <InvoiceLinesFields
            currency={customer.currency}
            drafts={drafts}
            onChange={setDrafts}
          />
        </FormSection>
        <FormFooter
          submitLabel="Save the draft"
          pending={saving}
          error={answer}
          secondary={
            <ButtonLink
              to="/customers/$customerId"
              params={{ customerId: customer.id }}
              variant="outline"
            >
              Cancel
            </ButtonLink>
          }
        />
      </form>
    </div>
  );
}
