import type {
  Currency,
  Price,
  PriceUnit,
} from "@faridalms/domain/subscriptions";

import { CURRENCIES, PRICE_UNITS } from "@faridalms/domain/subscriptions";
import { Button } from "@faridalms/ui/button";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { Plus } from "lucide-react";

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

/**
 * List prices, each a group of its own: currency and unit, the amount, and
 * the least a school pays a year. A heading above names the list, so its
 * legend is for screen readers.
 */
export function PriceFields({ drafts, onChange }: PriceFieldsProps) {
  const set = (index: number, change: Partial<PriceDraft>) =>
    onChange(
      drafts.map((draft, at) =>
        at === index ? { ...draft, ...change } : draft,
      ),
    );
  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend className="sr-only">Prices</legend>
      {drafts.length === 0 ? (
        <EmptyState
          placement="section"
          title="No list price: each contract sets its own."
        />
      ) : null}
      {drafts.map((draft, index) => (
        <fieldset
          key={index}
          className="grid min-w-0 gap-4 rounded-lg border px-4 pt-2 pb-4"
        >
          <legend className="sr-only">Price {index + 1}</legend>
          <div className="flex min-h-8 items-center justify-between gap-2">
            <span aria-hidden className="text-sm leading-5 font-medium">
              Price {index + 1}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-me-2 text-muted-foreground"
              aria-label={`Remove price ${index + 1}`}
              onClick={() => onChange(drafts.filter((_, at) => at !== index))}
            >
              Remove
            </Button>
          </div>
          <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-4">
            <SelectField
              label="Currency"
              value={draft.currency}
              options={CURRENCY_OPTIONS}
              onChange={(currency) => set(index, { currency })}
            />
            <SelectField
              label="Charged"
              value={draft.unit}
              options={UNIT_OPTIONS}
              onChange={(unit) => set(index, { unit })}
            />
          </div>
          <div className="grid grid-cols-2 items-start gap-4">
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
          </div>
        </fieldset>
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
