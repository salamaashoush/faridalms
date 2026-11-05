import type {
  AddOnVersionRow,
  PlanVersionRow,
} from "@faridalms/database/business/catalogue";
import type { QuoteSpec } from "@faridalms/domain/quotes";
import type {
  BillingSchedule,
  Currency,
} from "@faridalms/domain/subscriptions";

import { BILLING_SCHEDULES, CURRENCIES } from "@faridalms/domain/subscriptions";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { Textarea } from "@faridalms/ui/textarea";
import { useState } from "react";

import { minorOf } from "../format";
import { SCHEDULE_NAMES } from "./TermsFields";

const SELECT = "h-9 rounded-md border bg-background px-2 text-sm";
const FIELD = "grid gap-1.5 text-sm";

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
}: {
  initial: QuoteSpec;
  plans: PlanVersionRow[];
  addOns: AddOnVersionRow[];
  submitLabel: string;
  onSubmit: (spec: QuoteSpec) => Promise<string | null>;
}) {
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

  return (
    <form
      aria-label="Quote"
      className="grid max-w-3xl gap-6 rounded-lg border p-6"
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
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className={FIELD}>
          <label htmlFor="quote-currency" className="font-medium">
            Currency
          </label>
          <select
            id="quote-currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value as Currency)}
            className={SELECT}
          >
            {CURRENCIES.map((choice) => (
              <option key={choice} value={choice}>
                {choice}
              </option>
            ))}
          </select>
        </div>
        <div className={FIELD}>
          <label htmlFor="quote-valid" className="font-medium">
            Valid until
          </label>
          <Input
            id="quote-valid"
            type="date"
            required
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
          />
        </div>
        <div className={`${FIELD} sm:col-span-2`}>
          <label htmlFor="quote-plan" className="font-medium">
            Plan
          </label>
          <select
            id="quote-plan"
            value={planVersionId}
            onChange={(event) => {
              setPlanVersionId(event.target.value);
              const plan = plans.find((row) => row.id === event.target.value);
              setPrice(asMajor(plan ? listPrice(plan.prices, currency) : 0));
            }}
            className={SELECT}
          >
            <option value="">No plan: add-ons alone</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.nameEn} version {plan.version}
              </option>
            ))}
          </select>
        </div>
        {planVersionId ? (
          <>
            <div className={FIELD}>
              <label htmlFor="quote-quantity" className="font-medium">
                Quantity
              </label>
              <Input
                id="quote-quantity"
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
            <div className={FIELD}>
              <label htmlFor="quote-price" className="font-medium">
                Unit price ({currency})
              </label>
              <Input
                id="quote-price"
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </div>
            <div className={FIELD}>
              <label htmlFor="quote-discount" className="font-medium">
                Discount (%)
              </label>
              <Input
                id="quote-discount"
                inputMode="decimal"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
              />
            </div>
          </>
        ) : null}
      </div>

      <fieldset className="grid gap-3 text-sm">
        <legend className="mb-1 font-medium">Add-ons</legend>
        {lines.map((line, index) => {
          const addOn = addOns.find((row) => row.id === line.addOnVersionId);
          return (
            <div
              key={`${line.addOnVersionId}-${index}`}
              className="grid items-end gap-2 border-t pt-3 sm:grid-cols-[1fr_auto_auto_auto_auto]"
            >
              <span className="font-medium">
                {addOn ? `${addOn.nameEn} version ${addOn.version}` : "Retired"}
              </span>
              <div className="grid gap-1">
                <label
                  htmlFor={`quote-add-on-${index}-count`}
                  className="text-xs"
                >
                  Quantity
                </label>
                <Input
                  id={`quote-add-on-${index}-count`}
                  inputMode="numeric"
                  value={line.quantity}
                  onChange={(event) =>
                    setLine(index, { quantity: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-1">
                <label
                  htmlFor={`quote-add-on-${index}-price`}
                  className="text-xs"
                >
                  Unit price
                </label>
                <Input
                  id={`quote-add-on-${index}-price`}
                  inputMode="decimal"
                  value={line.price}
                  onChange={(event) =>
                    setLine(index, { price: event.target.value })
                  }
                />
              </div>
              <div className="grid gap-1">
                <label
                  htmlFor={`quote-add-on-${index}-discount`}
                  className="text-xs"
                >
                  Discount (%)
                </label>
                <Input
                  id={`quote-add-on-${index}-discount`}
                  inputMode="decimal"
                  value={line.discount}
                  onChange={(event) =>
                    setLine(index, { discount: event.target.value })
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  setLines((current) => current.filter((_, at) => at !== index))
                }
              >
                Remove
              </Button>
            </div>
          );
        })}
        {addOns.length ? (
          <div className="grid max-w-sm gap-1.5">
            <label htmlFor="quote-add-on" className="font-medium">
              Add an add-on
            </label>
            <select
              id="quote-add-on"
              value=""
              onChange={(event) => {
                const addOn = addOns.find(
                  (row) => row.id === event.target.value,
                );
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
              className={SELECT}
            >
              <option value="">Choose…</option>
              {addOns.map((addOn) => (
                <option key={addOn.id} value={addOn.id}>
                  {addOn.nameEn} version {addOn.version}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </fieldset>

      <div className="grid items-start gap-4 sm:grid-cols-3">
        <div className={FIELD}>
          <label htmlFor="quote-starts" className="font-medium">
            Term starts
          </label>
          <Input
            id="quote-starts"
            type="date"
            required
            value={termStartsOn}
            onChange={(event) => setTermStartsOn(event.target.value)}
          />
        </div>
        <div className={FIELD}>
          <label htmlFor="quote-ends" className="font-medium">
            Term ends
          </label>
          <Input
            id="quote-ends"
            type="date"
            required
            value={termEndsOn}
            onChange={(event) => setTermEndsOn(event.target.value)}
          />
        </div>
        <div className={FIELD}>
          <label htmlFor="quote-schedule" className="font-medium">
            Billing
          </label>
          <select
            id="quote-schedule"
            value={schedule}
            onChange={(event) =>
              setSchedule(event.target.value as BillingSchedule)
            }
            className={SELECT}
          >
            {BILLING_SCHEDULES.map((choice) => (
              <option key={choice} value={choice}>
                {SCHEDULE_NAMES[choice]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div className={FIELD}>
          <label htmlFor="quote-notes-en" className="font-medium">
            Notes in English
          </label>
          <Textarea
            id="quote-notes-en"
            maxLength={2000}
            value={notesEn}
            onChange={(event) => setNotesEn(event.target.value)}
          />
        </div>
        <div className={FIELD}>
          <label htmlFor="quote-notes-ar" className="font-medium">
            Notes in Arabic
          </label>
          <Textarea
            id="quote-notes-ar"
            dir="rtl"
            lang="ar"
            maxLength={2000}
            value={notesAr}
            onChange={(event) => setNotesAr(event.target.value)}
          />
        </div>
      </div>

      {answer ? (
        <p role="alert" className="text-sm text-destructive">
          {answer}
        </p>
      ) : null}
      <Button type="submit" disabled={saving} className="justify-self-start">
        {saving ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
