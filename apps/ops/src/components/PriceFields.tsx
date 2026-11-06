import type {
  Currency,
  Price,
  PriceUnit,
} from "@faridalms/domain/subscriptions";

import { CURRENCIES, PRICE_UNITS } from "@faridalms/domain/subscriptions";
import { Button } from "@faridalms/ui/button";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { Plus, X } from "lucide-react";

import { formatMoney, minorOf } from "../format";

export const UNIT_NAMES: Record<PriceUnit, string> = {
  student_year: "per student a year",
  school_year: "per school a year",
  once: "once",
};

export function formatPrice(price: Price): string {
  const amount = `${formatMoney(price.amountMinor, price.currency)} ${UNIT_NAMES[price.unit]}`;
  return price.minimumMinor > 0
    ? `${amount}, at least ${formatMoney(price.minimumMinor, price.currency)} a year`
    : amount;
}

export interface PriceDraft {
  currency: Currency;
  unit: PriceUnit;
  amount: string;
  minimum: string;
}

export const priceDraftOf = (price: Price): PriceDraft => ({
  currency: price.currency,
  unit: price.unit,
  amount: (price.amountMinor / 100).toFixed(2),
  minimum: price.minimumMinor ? (price.minimumMinor / 100).toFixed(2) : "",
});

/** The prices the drafts set, or null while one has no amount. */
export function pricesOf(drafts: PriceDraft[]): Price[] | null {
  const prices: Price[] = [];
  for (const draft of drafts) {
    const amountMinor = minorOf(draft.amount);
    if (amountMinor === null) return null;
    prices.push({
      currency: draft.currency,
      unit: draft.unit,
      amountMinor,
      minimumMinor: minorOf(draft.minimum) ?? 0,
    });
  }
  return prices;
}

const CURRENCY_OPTIONS = CURRENCIES.map((currency) => ({
  value: currency,
  label: currency,
}));

const UNIT_OPTIONS = PRICE_UNITS.map((unit) => ({
  value: unit,
  label: UNIT_NAMES[unit],
}));

export interface PriceFieldsProps {
  drafts: PriceDraft[];
  onChange: (drafts: PriceDraft[]) => void;
}

/** List prices, one row each: currency, unit, amount and a yearly minimum. */
export function PriceFields({ drafts, onChange }: PriceFieldsProps) {
  const set = (index: number, change: Partial<PriceDraft>) =>
    onChange(
      drafts.map((draft, at) =>
        at === index ? { ...draft, ...change } : draft,
      ),
    );
  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend className="mb-2 text-sm leading-5 font-medium">Prices</legend>
      {drafts.length === 0 ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          No list price: each contract sets its own.
        </p>
      ) : null}
      {drafts.map((draft, index) => (
        <div
          key={index}
          className="grid items-start gap-4 rounded-lg border p-4 @md:grid-cols-[6rem_1fr_1fr_1fr_auto]"
        >
          <SelectField
            label={`Price ${index + 1} currency`}
            value={draft.currency}
            options={CURRENCY_OPTIONS}
            onChange={(currency) => set(index, { currency })}
          />
          <SelectField
            label={`Price ${index + 1} unit`}
            value={draft.unit}
            options={UNIT_OPTIONS}
            onChange={(unit) => set(index, { unit })}
          />
          <TextField
            label="Amount"
            inputMode="decimal"
            value={draft.amount}
            placeholder="350.00"
            onChange={(event) => set(index, { amount: event.target.value })}
          />
          <TextField
            label="Least a year"
            optional
            inputMode="decimal"
            value={draft.minimum}
            placeholder="None"
            onChange={(event) => set(index, { minimum: event.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="@md:mt-7"
            aria-label={`Remove price ${index + 1}`}
            onClick={() => onChange(drafts.filter((_, at) => at !== index))}
          >
            <X aria-hidden />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={() =>
          onChange([
            ...drafts,
            {
              currency: drafts[0]?.currency ?? "EGP",
              unit: "student_year",
              amount: "",
              minimum: "",
            },
          ])
        }
      >
        <Plus aria-hidden />
        Add a price
      </Button>
    </fieldset>
  );
}
