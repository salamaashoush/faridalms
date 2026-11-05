import type {
  Currency,
  Price,
  PriceUnit,
} from "@faridalms/domain/subscriptions";

import { CURRENCIES, PRICE_UNITS } from "@faridalms/domain/subscriptions";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";

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

/** List prices, one row each: currency, unit, amount and a yearly minimum. */
export function PriceFields({
  prefix,
  drafts,
  onChange,
}: {
  prefix: string;
  drafts: PriceDraft[];
  onChange: (drafts: PriceDraft[]) => void;
}) {
  const set = (index: number, change: Partial<PriceDraft>) =>
    onChange(
      drafts.map((draft, at) =>
        at === index ? { ...draft, ...change } : draft,
      ),
    );
  return (
    <fieldset className="grid gap-3 text-sm">
      <legend className="mb-1 font-medium">Prices</legend>
      {drafts.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No list price: each contract sets its own.
        </p>
      ) : null}
      {drafts.map((draft, index) => (
        <div
          key={index}
          className="grid items-end gap-2 sm:grid-cols-[auto_auto_1fr_1fr_auto]"
        >
          <select
            aria-label={`Price ${index + 1} currency`}
            value={draft.currency}
            onChange={(event) =>
              set(index, { currency: event.target.value as Currency })
            }
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
          <select
            aria-label={`Price ${index + 1} unit`}
            value={draft.unit}
            onChange={(event) =>
              set(index, { unit: event.target.value as PriceUnit })
            }
            className="h-9 rounded-md border bg-background px-2 text-sm"
          >
            {PRICE_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {UNIT_NAMES[unit]}
              </option>
            ))}
          </select>
          <div className="grid gap-1">
            <label
              htmlFor={`${prefix}-price-${index}`}
              className="text-xs text-muted-foreground"
            >
              Amount
            </label>
            <Input
              id={`${prefix}-price-${index}`}
              inputMode="decimal"
              value={draft.amount}
              placeholder="350.00"
              onChange={(event) => set(index, { amount: event.target.value })}
            />
          </div>
          <div className="grid gap-1">
            <label
              htmlFor={`${prefix}-minimum-${index}`}
              className="text-xs text-muted-foreground"
            >
              Least a year
            </label>
            <Input
              id={`${prefix}-minimum-${index}`}
              inputMode="decimal"
              value={draft.minimum}
              placeholder="None"
              onChange={(event) => set(index, { minimum: event.target.value })}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(drafts.filter((_, at) => at !== index))}
          >
            Remove
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
        Add a price
      </Button>
    </fieldset>
  );
}
