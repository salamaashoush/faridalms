import type {
  Currency,
  Price,
  PriceUnit,
} from "@faridalms/domain/subscriptions";
import type { GridColumn } from "@faridalms/ui/system/data-grid";

import { CURRENCIES, PRICE_UNITS } from "@faridalms/domain/subscriptions";
import {
  DataGrid,
  GridAddButton,
  GridRemoveButton,
  NumberCell,
  SelectCell,
  useFocusAfterRender,
} from "@faridalms/ui/system/data-grid";
import { EmptyState } from "@faridalms/ui/system/empty-state";

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

const priceCell = (index: number, field: string) => `price-${index}-${field}`;

const figureOf = (text: string) => {
  const value = Number(text);
  return text.trim() === "" || !Number.isFinite(value) ? null : value;
};

const written = (value: number | null) =>
  value === null ? "" : value.toFixed(2);

interface PriceGridOptions {
  drafts: PriceDraft[];
  set: (index: number, change: Partial<PriceDraft>) => void;
  remove: (index: number) => void;
}

function priceGrid({ drafts, set, remove }: PriceGridOptions) {
  const at = (draft: PriceDraft) => drafts.indexOf(draft);
  const name = (draft: PriceDraft) => `price ${at(draft) + 1}`;
  const rowHeader = {
    header: "Currency",
    cell: (draft: PriceDraft) => (
      <SelectCell
        id={priceCell(at(draft), "currency")}
        label={`Currency, ${name(draft)}`}
        value={draft.currency}
        options={CURRENCY_OPTIONS}
        size="code"
        onChange={(currency) => set(at(draft), { currency })}
      />
    ),
  };
  const columns: GridColumn<PriceDraft>[] = [
    {
      id: "unit",
      header: "Charged",
      cell: (draft) => (
        <SelectCell
          id={priceCell(at(draft), "unit")}
          label={`Charged, ${name(draft)}`}
          value={draft.unit}
          options={UNIT_OPTIONS}
          onChange={(unit) => set(at(draft), { unit })}
        />
      ),
    },
    {
      id: "amount",
      header: "Amount",
      numeric: true,
      cell: (draft) => (
        <NumberCell
          id={priceCell(at(draft), "amount")}
          label={`Amount, ${name(draft)}`}
          decimals={2}
          placeholder="350.00"
          value={figureOf(draft.amount)}
          onChange={(amount) => set(at(draft), { amount: written(amount) })}
        />
      ),
    },
    {
      id: "minimum",
      header: "At least",
      numeric: true,
      cell: (draft) => (
        <NumberCell
          id={priceCell(at(draft), "minimum")}
          label={`Least a year, ${name(draft)}`}
          decimals={2}
          placeholder="None"
          value={figureOf(draft.minimum)}
          onChange={(minimum) => set(at(draft), { minimum: written(minimum) })}
        />
      ),
    },
  ];
  const rowEnd = (draft: PriceDraft) => (
    <GridRemoveButton
      label={`Remove ${name(draft)}`}
      onRemove={() => remove(at(draft))}
    />
  );
  return { rowHeader, columns, rowEnd };
}

export interface PriceFieldsProps {
  drafts: PriceDraft[];
  onChange: (drafts: PriceDraft[]) => void;
  /** Save was tried: a price with no amount shows on its cell. */
  checked?: boolean;
}

/**
 * List prices as rows: currency and unit, the amount, and the least a
 * school pays a year, each removed by its own button.
 */
export function PriceFields({
  drafts,
  onChange,
  checked = false,
}: PriceFieldsProps) {
  const focusLater = useFocusAfterRender();
  const set = (index: number, change: Partial<PriceDraft>) =>
    onChange(
      drafts.map((draft, at) =>
        at === index ? { ...draft, ...change } : draft,
      ),
    );
  const add = (
    <GridAddButton
      label="Add a price"
      onAdd={() => {
        onChange([
          ...drafts,
          {
            currency: drafts[0]?.currency ?? "EGP",
            unit: "student_year",
            amount: "",
            minimum: "",
          },
        ]);
        focusLater(priceCell(drafts.length, "amount"));
      }}
    />
  );
  if (drafts.length === 0)
    return (
      <EmptyState
        placement="section"
        title="No list price: each contract sets its own."
        action={add}
      />
    );
  return (
    <DataGrid<PriceDraft>
      caption="Prices"
      editing
      surface="sheet"
      {...priceGrid({
        drafts,
        set,
        remove: (index) => onChange(drafts.filter((_, at) => at !== index)),
      })}
      groups={[{ id: "prices", title: "", rows: drafts }]}
      rowKey={(draft) => `price-${drafts.indexOf(draft)}`}
      issues={
        checked
          ? drafts.flatMap((draft, index) =>
              minorOf(draft.amount) === null
                ? [
                    {
                      target: priceCell(index, "amount"),
                      label: `Price ${index + 1}`,
                      message: "Give it an amount, or remove it.",
                    },
                  ]
                : [],
            )
          : []
      }
      footer={add}
    />
  );
}
