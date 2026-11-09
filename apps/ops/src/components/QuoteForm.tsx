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
import { Button } from "@faridalms/ui/button";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { FormFooter } from "@faridalms/ui/system/form-footer";
import { FormSection } from "@faridalms/ui/system/record-form";
import { Textarea } from "@faridalms/ui/textarea";
import { X } from "lucide-react";
import { useState } from "react";

import { minorOf } from "../format";
import { SCHEDULE_NAMES } from "./TermsFields";

const SCHEDULE_OPTIONS = BILLING_SCHEDULES.map((choice) => ({
  value: choice,
  label: SCHEDULE_NAMES[choice],
}));

const listPrice = (
  prices: { currency: Currency; amountMinor: number }[],
  currency: Currency,
) => prices.find((price) => price.currency === currency)?.amountMinor ?? 0;

const asMajor = (minor: number) => (minor / 100).toFixed(2);

interface LineDraft {
  addOnVersionId: string;
  quantity: string;
  price: string;
  discount: string;
}

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
  const [lines, setLines] = useState<LineDraft[]>(
    initial.addOns.map((addOn) => ({
      addOnVersionId: addOn.addOnVersionId,
      quantity: String(addOn.quantity),
      price: asMajor(addOn.unitPriceMinor),
      discount: String(addOn.discountPercent),
    })),
  );
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
    const added: QuoteSpec["addOns"] = [];
    for (const line of lines) {
      const linePrice = minorOf(line.price);
      const lineCount = Number(line.quantity);
      const lineOff = Number(line.discount || "0");
      if (
        linePrice === null ||
        !Number.isInteger(lineCount) ||
        lineCount < 1 ||
        !Number.isFinite(lineOff) ||
        lineOff < 0 ||
        lineOff > 100
      )
        return {
          ok: false,
          message:
            "Give each add-on a quantity, a unit price and a discount between 0 and 100.",
        };
      added.push({
        addOnVersionId: line.addOnVersionId,
        quantity: lineCount,
        unitPriceMinor: linePrice,
        discountPercent: lineOff,
      });
    }
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

  const setLine = (index: number, change: Partial<LineDraft>) =>
    setLines((current) =>
      current.map((line, at) => (at === index ? { ...line, ...change } : line)),
    );

  const currencyOptions = CURRENCIES.map((choice) => ({
    value: choice,
    label: choice,
  }));
  const addOnOptions = [
    { value: "", label: "Choose…" },
    ...addOns.map((addOn) => ({
      value: addOn.id,
      label: `${addOn.nameEn} version ${addOn.version}`,
    })),
  ];

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
        {lines.map((line, index) => {
          const addOn = addOns.find((row) => row.id === line.addOnVersionId);
          const name = addOn
            ? `${addOn.nameEn} version ${addOn.version}`
            : "Retired";
          return (
            <div
              key={`${line.addOnVersionId}-${index}`}
              className="grid gap-4 rounded-lg border bg-card p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm leading-5 font-semibold">{name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${name}`}
                  onClick={() =>
                    setLines((current) =>
                      current.filter((_, at) => at !== index),
                    )
                  }
                >
                  <X aria-hidden />
                </Button>
              </div>
              <div className="grid items-start gap-6 sm:grid-cols-3">
                <TextField
                  label="Quantity"
                  inputMode="numeric"
                  value={line.quantity}
                  onChange={(event) =>
                    setLine(index, { quantity: event.target.value })
                  }
                />
                <TextField
                  label="Unit price"
                  inputMode="decimal"
                  value={line.price}
                  onChange={(event) =>
                    setLine(index, { price: event.target.value })
                  }
                />
                <TextField
                  label="Discount (%)"
                  inputMode="decimal"
                  value={line.discount}
                  onChange={(event) =>
                    setLine(index, { discount: event.target.value })
                  }
                />
              </div>
            </div>
          );
        })}
        {addOns.length ? (
          <SelectField
            label="Add an add-on"
            width="name"
            value=""
            options={addOnOptions}
            onChange={(chosen) => {
              const addOn = addOns.find((row) => row.id === chosen);
              if (!addOn) return;
              setLines((current) => [
                ...current,
                {
                  addOnVersionId: addOn.id,
                  quantity: "1",
                  price: asMajor(listPrice(addOn.prices, currency)),
                  discount: "0",
                },
              ]);
            }}
          />
        ) : (
          <EmptyState placement="section" title="No add-ons are sold." />
        )}
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
