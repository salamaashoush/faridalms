import type { PaymentMethod } from "@faridalms/domain/invoices";
import type { Currency } from "@faridalms/domain/subscriptions";

import { PAYMENT_METHODS } from "@faridalms/domain/invoices";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { attempt } from "../actions";
import {
  formatDay,
  formatMoney,
  minorOf,
  PAYMENT_METHOD_NAMES,
} from "../format";
import { getOpenInvoices, recordCustomerPayment } from "../server/invoicing";

/** A customer a payment may come from. */
export interface PayingCustomer {
  id: string;
  legalNameEn: string;
  currency: Currency;
}

const METHOD_OPTIONS = PAYMENT_METHODS.map((choice) => ({
  value: choice,
  label: PAYMENT_METHOD_NAMES[choice],
}));

export interface PaymentSheetProps {
  /** The customers to choose from, or the one customer the payment is from. */
  customers: readonly PayingCustomer[];
  today: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Records money received and settles it against the customer's open
 * invoices. Given one customer it is from them; given several it asks.
 */
export function PaymentSheet({
  customers,
  today,
  open: shown,
  onOpenChange,
}: PaymentSheetProps) {
  const router = useRouter();
  const open = useServerFn(getOpenInvoices);
  const record = useServerFn(recordCustomerPayment);
  const only = customers.length === 1 ? customers[0] : undefined;
  const [customerId, setCustomerId] = useState(only?.id ?? "");
  const [invoices, setInvoices] = useState<
    Awaited<ReturnType<typeof getOpenInvoices>>
  >([]);
  const [settle, setSettle] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [amount, setAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState(today);
  const [reference, setReference] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const customer = customers.find((row) => row.id === customerId);
  const amountMinor = minorOf(amount);
  const onlyId = only?.id;
  useEffect(() => {
    if (!shown || !onlyId) return undefined;
    let current = true;
    void open({ data: { customerId: onlyId } }).then((rows) => {
      if (current) setInvoices(rows);
    });
    return () => {
      current = false;
    };
  }, [shown, onlyId, open]);
  return (
    <SheetForm
      open={shown}
      onOpenChange={onOpenChange}
      title="Record a payment"
      submitLabel="Record payment"
      pending={saving}
      error={answer}
      onSubmit={async () => {
        setSubmitted(true);
        if (!customer || !amountMinor || !reference.trim()) return;
        const allocations = invoices.flatMap((invoice) => {
          const settled = minorOf(settle[invoice.id] ?? "");
          return settled
            ? [{ invoiceId: invoice.id, amountMinor: settled }]
            : [];
        });
        setSaving(true);
        setAnswer(null);
        const failed = await attempt(
          () =>
            record({
              data: {
                customerId,
                method,
                currency: customer.currency,
                amountMinor,
                receivedOn,
                reference,
                feeMinor: 0,
                allocations,
              },
            }),
          "The payment could not be recorded. It settles no more than it is.",
        );
        setSaving(false);
        if (failed) {
          setAnswer(failed);
          return;
        }
        toast.success("Payment recorded.");
        setAmount("");
        setReference("");
        setSettle({});
        setSubmitted(false);
        setInvoices(await open({ data: { customerId } }));
        onOpenChange(false);
        await router.invalidate();
      }}
    >
      {only ? null : (
        <SelectField
          label="From"
          value={customerId}
          options={[
            { value: "", label: "Choose…" },
            ...customers.map((row) => ({
              value: row.id,
              label: row.legalNameEn,
            })),
          ]}
          errors={submitted && !customer ? ["Choose the customer."] : undefined}
          onChange={(chosen) => {
            setCustomerId(chosen);
            setSettle({});
            void (
              chosen
                ? open({ data: { customerId: chosen } })
                : Promise.resolve([])
            ).then(setInvoices);
          }}
        />
      )}
      <SelectField
        label="How"
        value={method}
        options={METHOD_OPTIONS}
        onChange={setMethod}
      />
      <TextField
        label={`Amount${customer ? ` (${customer.currency})` : ""}`}
        inputMode="decimal"
        width="code"
        value={amount}
        errors={
          submitted && !amountMinor ? ["Give the amount received."] : undefined
        }
        onChange={(event) => setAmount(event.target.value)}
      />
      <TextField
        label="Received"
        type="date"
        width="date"
        value={receivedOn}
        onChange={(event) => setReceivedOn(event.target.value)}
      />
      <TextField
        label="Reference"
        maxLength={120}
        value={reference}
        placeholder="The bank's reference, or the certificate's number"
        errors={
          submitted && !reference.trim() ? ["Give the reference."] : undefined
        }
        onChange={(event) => setReference(event.target.value)}
      />
      {invoices.length ? (
        <fieldset className="grid gap-4">
          <legend className="mb-2 text-sm leading-5 font-medium">
            What it settles
          </legend>
          {invoices.map((invoice) => (
            <TextField
              key={invoice.id}
              label={`${invoice.number}: ${formatMoney(invoice.owedMinor, invoice.currency)} owed${invoice.dueOn ? `, due ${formatDay(invoice.dueOn)}` : ""}`}
              optional
              inputMode="decimal"
              width="code"
              value={settle[invoice.id] ?? ""}
              placeholder="0.00"
              onChange={(event) =>
                setSettle((current) => ({
                  ...current,
                  [invoice.id]: event.target.value,
                }))
              }
            />
          ))}
        </fieldset>
      ) : customerId ? (
        <p className="text-sm leading-5 text-muted-foreground">
          The customer has no open invoice: the payment is kept to settle one
          later.
        </p>
      ) : null}
    </SheetForm>
  );
}
