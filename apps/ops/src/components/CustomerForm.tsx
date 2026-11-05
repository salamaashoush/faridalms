import type { CustomerRow } from "@faridalms/database/business/customers";

import { CURRENCIES } from "@faridalms/domain/subscriptions";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { Textarea } from "@faridalms/ui/textarea";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { failure } from "../actions";
import { saveCustomerDetails } from "../server/customers";

/**
 * A customer's legal details as invoices carry them: creates one, or saves
 * a change unless someone else changed it since it was read.
 */
export function CustomerForm({
  customer,
  onSaved,
}: {
  customer: CustomerRow | null;
  onSaved: (id: string) => Promise<void> | void;
}) {
  const save = useServerFn(saveCustomerDetails);
  const [fields, setFields] = useState({
    legalNameEn: customer?.legalNameEn ?? "",
    legalNameAr: customer?.legalNameAr ?? "",
    taxNumber: customer?.taxNumber ?? "",
    commercialRegistry: customer?.commercialRegistry ?? "",
    address: customer?.address ?? "",
    country: customer?.country ?? "EG",
    currency: customer?.currency ?? "EGP",
  });
  const [reason, setReason] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set =
    (key: keyof typeof fields) => (event: { target: { value: string } }) =>
      setFields((current) => ({ ...current, [key]: event.target.value }));
  const text = (
    key: Exclude<keyof typeof fields, "currency">,
    label: string,
    options: { required?: boolean; dir?: "ltr" | "rtl"; max: number },
  ) => (
    <div className="grid gap-1.5 text-sm">
      <label htmlFor={`customer-${key}`} className="font-medium">
        {label}
      </label>
      <Input
        id={`customer-${key}`}
        required={options.required}
        dir={options.dir}
        maxLength={options.max}
        value={fields[key]}
        onChange={set(key)}
      />
    </div>
  );
  return (
    <form
      aria-label={customer ? "Customer details" : "New customer"}
      className="grid max-w-2xl gap-4 rounded-lg border p-6"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        setAnswer(null);
        try {
          const out = await save({
            data: {
              ...fields,
              id: customer?.id,
              expectedVersion: customer?.version,
              reason,
            },
          });
          if (out.ok) {
            setReason("");
            await onSaved(out.id);
          } else setAnswer(out.message);
        } catch (error) {
          setAnswer(failure(error, "The customer could not be saved."));
        } finally {
          setSaving(false);
        }
      }}
    >
      <h2 className="text-base font-semibold">
        {customer ? "Details" : "New customer"}
      </h2>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        {text("legalNameEn", "Legal name in English", {
          required: true,
          max: 200,
        })}
        {text("legalNameAr", "Legal name in Arabic", { dir: "rtl", max: 200 })}
        {text("taxNumber", "Tax registration number", { dir: "ltr", max: 40 })}
        {text("commercialRegistry", "Commercial registry", {
          dir: "ltr",
          max: 40,
        })}
        {text("country", "Country", { required: true, dir: "ltr", max: 2 })}
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="customer-currency" className="font-medium">
            Currency
          </label>
          <select
            id="customer-currency"
            value={fields.currency}
            onChange={set("currency")}
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-1.5 text-sm">
        <label htmlFor="customer-address" className="font-medium">
          Billing address
        </label>
        <Textarea
          id="customer-address"
          maxLength={500}
          value={fields.address}
          onChange={set("address")}
        />
      </div>
      <div className="grid gap-1.5 text-sm">
        <label htmlFor="customer-reason" className="font-medium">
          Why
        </label>
        <Input
          id="customer-reason"
          required
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={
            customer
              ? "For example: moved to new premises"
              : "For example: won at the October fair"
          }
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
        {saving ? "Saving…" : customer ? "Save details" : "Create customer"}
      </Button>
    </form>
  );
}
