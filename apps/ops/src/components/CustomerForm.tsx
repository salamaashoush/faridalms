import type { CustomerRow } from "@faridalms/database/business/customers";
import type { Currency } from "@faridalms/domain/subscriptions";

import { CURRENCIES } from "@faridalms/domain/subscriptions";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { Textarea } from "@faridalms/ui/textarea";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { attemptWith } from "../actions";
import { saveCustomerDetails } from "../server/customers";
import { WhyField } from "./Why";

interface CustomerDraft {
  legalNameEn: string;
  legalNameAr: string;
  taxNumber: string;
  commercialRegistry: string;
  address: string;
  country: string;
  currency: Currency;
}

const CURRENCY_OPTIONS = CURRENCIES.map((currency) => ({
  value: currency,
  label: currency,
}));

function draftOf(customer: CustomerRow | null): CustomerDraft {
  return {
    legalNameEn: customer?.legalNameEn ?? "",
    legalNameAr: customer?.legalNameAr ?? "",
    taxNumber: customer?.taxNumber ?? "",
    commercialRegistry: customer?.commercialRegistry ?? "",
    address: customer?.address ?? "",
    country: customer?.country ?? "EG",
    currency: customer?.currency ?? "EGP",
  };
}

/**
 * A customer's legal details being written: creates one, or saves a change
 * unless someone else changed it since it was read.
 */
function useCustomerForm(
  customer: CustomerRow | null,
  onSaved: (id: string) => Promise<void> | void,
) {
  const save = useServerFn(saveCustomerDetails);
  const [fields, setFields] = useState(() => draftOf(customer));
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setSubmitted(true);
    if (!fields.legalNameEn.trim() || !fields.country.trim() || !reason.trim())
      return;
    setPending(true);
    setError(null);
    const out = await attemptWith(
      () =>
        save({
          data: {
            ...fields,
            id: customer?.id,
            expectedVersion: customer?.version,
            reason,
          },
        }),
      "The customer could not be saved.",
    );
    setPending(false);
    if (!out.ok) {
      setError(out.message);
      return;
    }
    setReason("");
    setSubmitted(false);
    await onSaved(out.value.id);
  };
  return {
    fields,
    setFields,
    reason,
    setReason,
    submitted,
    pending,
    error,
    submit,
  };
}

type CustomerForm = ReturnType<typeof useCustomerForm>;

interface CustomerFieldsProps {
  form: CustomerForm;
  creating: boolean;
}

function CustomerFields({ form, creating }: CustomerFieldsProps) {
  const { fields, setFields, submitted } = form;
  const set = (key: keyof CustomerDraft, value: string) =>
    setFields((current) => ({ ...current, [key]: value }));
  return (
    <>
      <div className="grid items-start gap-6 @md:grid-cols-2">
        <TextField
          label="Legal name in English"
          maxLength={200}
          value={fields.legalNameEn}
          errors={
            submitted && !fields.legalNameEn.trim()
              ? ["Enter the legal name in English."]
              : undefined
          }
          onChange={(event) => set("legalNameEn", event.target.value)}
        />
        <TextField
          label="Legal name in Arabic"
          optional
          dir="rtl"
          lang="ar"
          maxLength={200}
          value={fields.legalNameAr}
          onChange={(event) => set("legalNameAr", event.target.value)}
        />
        <TextField
          label="Tax registration number"
          optional
          dir="ltr"
          width="reference"
          maxLength={40}
          value={fields.taxNumber}
          onChange={(event) => set("taxNumber", event.target.value)}
        />
        <TextField
          label="Commercial registry"
          optional
          dir="ltr"
          width="reference"
          maxLength={40}
          value={fields.commercialRegistry}
          onChange={(event) => set("commercialRegistry", event.target.value)}
        />
        <TextField
          label="Country"
          hint="Two letters, such as EG."
          dir="ltr"
          width="code"
          maxLength={2}
          value={fields.country}
          errors={
            submitted && !fields.country.trim()
              ? ["Enter the country."]
              : undefined
          }
          onChange={(event) => set("country", event.target.value)}
        />
        <SelectField
          label="Currency"
          width="code"
          value={fields.currency}
          options={CURRENCY_OPTIONS}
          onChange={(currency) => set("currency", currency)}
        />
      </div>
      <FormField label="Billing address" optional>
        {(control) => (
          <Textarea
            {...control}
            maxLength={500}
            value={fields.address}
            onChange={(event) => set("address", event.target.value)}
          />
        )}
      </FormField>
      <WhyField
        value={form.reason}
        onChange={form.setReason}
        submitted={submitted}
        placeholder={
          creating
            ? "For example: won at the October fair"
            : "For example: moved to new premises"
        }
      />
    </>
  );
}

export interface NewCustomerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => Promise<void> | void;
}

/** Creates a customer from a sheet, then hands over its id. */
export function NewCustomerSheet({
  open,
  onOpenChange,
  onCreated,
}: NewCustomerSheetProps) {
  const form = useCustomerForm(null, async (id) => {
    onOpenChange(false);
    await onCreated(id);
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="New customer"
      submitLabel="Create customer"
      pending={form.pending}
      error={form.error}
      onSubmit={form.submit}
    >
      <div className="@container grid gap-6">
        <CustomerFields form={form} creating />
      </div>
    </SheetForm>
  );
}

export interface EditCustomerSheetProps {
  customer: CustomerRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
}

/** Changes a customer's legal details, unless someone changed them first. */
export function EditCustomerSheet({
  customer,
  open,
  onOpenChange,
  onSaved,
}: EditCustomerSheetProps) {
  const form = useCustomerForm(customer, async () => {
    onOpenChange(false);
    await onSaved();
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title="Edit legal details"
      submitLabel="Save details"
      pending={form.pending}
      error={form.error}
      onSubmit={form.submit}
    >
      <div className="@container grid gap-6">
        <CustomerFields form={form} creating={false} />
      </div>
    </SheetForm>
  );
}
