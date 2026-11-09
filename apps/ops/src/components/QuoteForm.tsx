import type {
  AddOnVersionRow,
  PlanVersionRow,
} from "@faridalms/database/business/catalogue";
import type { QuoteSpec } from "@faridalms/domain/quotes";
import type {
  BillingSchedule,
  Currency,
} from "@faridalms/domain/subscriptions";
import type { ReactNode } from "react";

import { BILLING_SCHEDULES, CURRENCIES } from "@faridalms/domain/subscriptions";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { FormFooter } from "@faridalms/ui/system/form-footer";
import { FormSection } from "@faridalms/ui/system/record-form";
import { Textarea } from "@faridalms/ui/textarea";
import { useState } from "react";

import type { QuoteAddOn } from "./QuoteAddOns";

import { minorOf } from "../format";
import { listPrice, QuoteAddOns } from "./QuoteAddOns";
import { SCHEDULE_NAMES } from "./TermsFields";

const SCHEDULE_OPTIONS = BILLING_SCHEDULES.map((choice) => ({
  value: choice,
  label: SCHEDULE_NAMES[choice],
}));

const asMajor = (minor: number) => (minor / 100).toFixed(2);

export interface QuoteFormProps {
  initial: QuoteSpec;
  plans: PlanVersionRow[];
  addOns: AddOnVersionRow[];
  submitLabel: string;
  /** Saves the quote; resolves to what went wrong, or null. */
  onSubmit: (spec: QuoteSpec) => Promise<string | null>;
  /** Beside the submit button, such as Cancel. */
  secondary?: ReactNode;
}

/**
 * A quote as an operator builds it from what is sold: a plan and add-ons,
 * each with its quantity, price and discount, the term and its billing,
 * how long the offer stands, and notes in both languages.
 */
export function QuoteForm({
  initial,
  plans,
  addOns,
  submitLabel,
  onSubmit,
  secondary,
}: QuoteFormProps) {
  const [currency, setCurrency] = useState<Currency>(initial.currency);
  const [planVersionId, setPlanVersionId] = useState(
    initial.planVersionId ?? "",
  );
  const [quantity, setQuantity] = useState(String(initial.quantity));
  const [price, setPrice] = useState(asMajor(initial.unitPriceMinor));
  const [discount, setDiscount] = useState(String(initial.discountPercent));
  const [lines, setLines] = useState<QuoteAddOn[]>(initial.addOns);
  const [termStartsOn, setTermStartsOn] = useState(initial.termStartsOn);
  const [termEndsOn, setTermEndsOn] = useState(initial.termEndsOn);
  const [schedule, setSchedule] = useState<BillingSchedule>(initial.schedule);
  const [validUntil, setValidUntil] = useState(initial.validUntil);
  const [notesEn, setNotesEn] = useState(initial.notesEn ?? "");
  const [notesAr, setNotesAr] = useState(initial.notesAr ?? "");
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const read = ():
    | { ok: true; spec: QuoteSpec }
    | { ok: false; message: string } => {
    const count = Number(quantity);
    const unitPriceMinor = minorOf(price);
    const off = Number(discount || "0");
    if (
      planVersionId &&
      (!Number.isInteger(count) || count < 1 || unitPriceMinor === null)
    )
      return {
        ok: false,
        message: "Give the plan a quantity and a unit price.",
      };
    if (!Number.isFinite(off) || off < 0 || off > 100)
      return {
        ok: false,
        message: "A discount is between 0 and 100 per cent.",
      };
    const added = lines;
    if (!planVersionId && added.length === 0)
      return {
        ok: false,
        message: "A quote sells a plan or at least one add-on.",
      };
    if (!termStartsOn || !termEndsOn || termEndsOn <= termStartsOn)
      return { ok: false, message: "Give the term, ending after it starts." };
    return {
      ok: true,
      spec: {
        currency,
        planVersionId: planVersionId || null,
        quantity: planVersionId ? count : 1,
        unitPriceMinor: planVersionId ? (unitPriceMinor ?? 0) : 0,
        discountPercent: planVersionId ? off : 0,
        addOns: added,
        termStartsOn,
        termEndsOn,
        schedule,
        validUntil,
        notesEn: notesEn.trim() || null,
        notesAr: notesAr.trim() || null,
      },
    };
  };

  const currencyOptions = CURRENCIES.map((choice) => ({
    value: choice,
    label: choice,
  }));

  return (
    <form
      aria-label="Quote"
      noValidate
      className="grid gap-10"
      onSubmit={async (event) => {
        event.preventDefault();
        const out = read();
        if (!out.ok) {
          setAnswer(out.message);
          return;
        }
        setSaving(true);
        setAnswer(await onSubmit(out.spec));
        setSaving(false);
      }}
    >
      <FormSection title="What is sold">
        <div className="grid items-start gap-6 sm:grid-cols-2">
          <SelectField
            label="Currency"
            width="code"
            value={currency}
            options={currencyOptions}
            onChange={setCurrency}
          />
          <TextField
            label="Valid until"
            type="date"
            width="date"
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
          />
        </div>
        <SelectField
          label="Plan"
          value={planVersionId}
          options={[
            { value: "", label: "No plan: add-ons alone" },
            ...plans.map((plan) => ({
              value: plan.id,
              label: `${plan.nameEn} version ${plan.version}`,
            })),
          ]}
          onChange={(chosen) => {
            setPlanVersionId(chosen);
            const plan = plans.find((row) => row.id === chosen);
            setPrice(asMajor(plan ? listPrice(plan.prices, currency) : 0));
          }}
        />
        {planVersionId ? (
          <div className="grid items-start gap-6 sm:grid-cols-3">
            <TextField
              label="Quantity"
              inputMode="numeric"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
            <TextField
              label={`Unit price (${currency})`}
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
            <TextField
              label="Discount (%)"
              inputMode="decimal"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
            />
          </div>
        ) : null}
      </FormSection>

      <FormSection title="Add-ons">
        <QuoteAddOns
          lines={lines}
          onChange={setLines}
          addOns={addOns}
          currency={currency}
        />
      </FormSection>

      <FormSection title="Term">
        <div className="grid items-start gap-6 sm:grid-cols-3">
          <TextField
            label="Term starts"
            type="date"
            value={termStartsOn}
            onChange={(event) => setTermStartsOn(event.target.value)}
          />
          <TextField
            label="Term ends"
            type="date"
            value={termEndsOn}
            onChange={(event) => setTermEndsOn(event.target.value)}
          />
          <SelectField
            label="Billing"
            value={schedule}
            options={SCHEDULE_OPTIONS}
            onChange={setSchedule}
          />
        </div>
      </FormSection>

      <FormSection title="Notes">
        <div className="grid items-start gap-6 sm:grid-cols-2">
          <FormField label="Notes in English" optional>
            {(control) => (
              <Textarea
                {...control}
                maxLength={2000}
                value={notesEn}
                onChange={(event) => setNotesEn(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Notes in Arabic" optional>
            {(control) => (
              <Textarea
                {...control}
                dir="rtl"
                lang="ar"
                maxLength={2000}
                value={notesAr}
                onChange={(event) => setNotesAr(event.target.value)}
              />
            )}
          </FormField>
        </div>
      </FormSection>

      <FormFooter
        submitLabel={submitLabel}
        pending={saving}
        error={answer}
        secondary={secondary}
      />
    </form>
  );
}
