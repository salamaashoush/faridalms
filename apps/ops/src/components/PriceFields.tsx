import type {
  Currency,
  Price,
  PriceUnit,
} from "@faridalms/domain/subscriptions";
import type {
  Column,
  DataTableCard,
  RowAction,
} from "@faridalms/ui/system/data-table";

import { CURRENCIES, PRICE_UNITS } from "@faridalms/domain/subscriptions";
import { Button } from "@faridalms/ui/button";
import { DataTable, RowButton } from "@faridalms/ui/system/data-table";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { SheetForm, useSheet } from "@faridalms/ui/system/sheet-form";
import { Value } from "@faridalms/ui/system/value";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { useState } from "react";

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

const CURRENCY_OPTIONS = CURRENCIES.map((currency) => ({
  value: currency,
  label: currency,
}));

const UNIT_OPTIONS = PRICE_UNITS.map((unit) => ({
  value: unit,
  label: UNIT_NAMES[unit],
}));

const MOST_MINOR = 10 ** 12;

const typedAmount = (minor: number) => (minor / 100).toFixed(2);

const priceName = (price: Price) =>
  `the price in ${price.currency} ${UNIT_NAMES[price.unit]}`;

export interface PriceSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The price being changed, or null for a new one. */
  price: Price | null;
  /** The currency a new price starts in: the one the others are in. */
  currency: Currency;
  onSave: (price: Price) => void;
}

/**
 * One list price of the version being made: its currency, how it is
 * charged, the amount, and the least a school pays a year at it.
 */
export function PriceSheet({
  open,
  onOpenChange,
  price,
  currency: startIn,
  onSave,
}: PriceSheetProps) {
  const [currency, setCurrency] = useState<Currency>(
    price?.currency ?? startIn,
  );
  const [unit, setUnit] = useState<PriceUnit>(price?.unit ?? "student_year");
  const [amount, setAmount] = useState(
    price ? typedAmount(price.amountMinor) : "",
  );
  const [minimum, setMinimum] = useState(
    price?.minimumMinor ? typedAmount(price.minimumMinor) : "",
  );
  const [submitted, setSubmitted] = useState(false);
  const amountMinor = minorOf(amount);
  const minimumMinor = minimum.trim() ? minorOf(minimum) : 0;
  const amountWrong =
    amountMinor === null || amountMinor > MOST_MINOR
      ? "Give it an amount."
      : null;
  const minimumWrong =
    minimumMinor === null || minimumMinor > MOST_MINOR
      ? "Give an amount, or leave it empty for none."
      : null;
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title={price ? `Edit ${priceName(price)}` : "Add a price"}
      submitLabel={price ? "Save price" : "Add price"}
      onSubmit={() => {
        setSubmitted(true);
        if (amountMinor === null || minimumMinor === null) return;
        if (amountWrong || minimumWrong) return;
        onSave({ currency, unit, amountMinor, minimumMinor });
        onOpenChange(false);
      }}
    >
      <div className="grid items-start gap-6 sm:grid-cols-2">
        <SelectField
          label="Currency"
          width="code"
          value={currency}
          options={CURRENCY_OPTIONS}
          onChange={setCurrency}
        />
        <SelectField
          label="Charged"
          value={unit}
          options={UNIT_OPTIONS}
          onChange={setUnit}
        />
      </div>
      <TextField
        label={`Amount (${currency})`}
        inputMode="decimal"
        dir="ltr"
        width="reference"
        placeholder="350.00"
        value={amount}
        errors={submitted && amountWrong ? [amountWrong] : undefined}
        onChange={(event) => setAmount(event.target.value)}
      />
      <TextField
        label={`At least a year (${currency})`}
        optional
        hint="The least a school pays a year at this price, however few its students."
        inputMode="decimal"
        dir="ltr"
        width="reference"
        value={minimum}
        errors={submitted && minimumWrong ? [minimumWrong] : undefined}
        onChange={(event) => setMinimum(event.target.value)}
      />
    </SheetForm>
  );
}

interface PriceRow extends Price {
  id: string;
  index: number;
}

/**
 * The table's columns and phone cards, the amount opening its price. How
 * it is charged is the amount's second line, so the table fits the sheet.
 */
function priceTable(onEdit: (row: PriceRow) => void) {
  const opener = (row: PriceRow) => (
    <RowButton
      aria-label={`Edit ${formatMoney(row.amountMinor, row.currency)} ${UNIT_NAMES[row.unit]}`}
      className="tabular-nums"
      onClick={() => onEdit(row)}
    >
      {formatMoney(row.amountMinor, row.currency)}
    </RowButton>
  );
  const least = (row: PriceRow) =>
    row.minimumMinor > 0 ? (
      formatMoney(row.minimumMinor, row.currency)
    ) : (
      <Value absent="None" />
    );
  const columns: Column<PriceRow>[] = [
    {
      id: "price",
      header: "Price",
      primary: true,
      cell: (row) => (
        <span className="grid min-w-0 py-2">
          {opener(row)}
          <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
            {UNIT_NAMES[row.unit]}
          </span>
        </span>
      ),
    },
    { id: "least", header: "At least a year", align: "end", cell: least },
  ];
  const card: DataTableCard<PriceRow> = {
    title: opener,
    fact: (row) =>
      row.minimumMinor > 0
        ? `${UNIT_NAMES[row.unit]}, at least ${formatMoney(row.minimumMinor, row.currency)} a year`
        : UNIT_NAMES[row.unit],
  };
  return { columns, card };
}

export interface PriceFieldsProps {
  prices: Price[];
  onChange: (prices: Price[]) => void;
}

/**
 * The list prices of the version being made, as a table: Add price, or a
 * price's row, opens that one price in a sheet over the version's own.
 * They are saved with the version, since a price never changes once a
 * contract may hold it.
 */
export function PriceFields({ prices, onChange }: PriceFieldsProps) {
  const adding = useSheet();
  const editing = useSheet();
  const [chosen, setChosen] = useState<number | null>(null);
  const rows: PriceRow[] = prices.map((price, index) => ({
    ...price,
    id: `price-${index}`,
    index,
  }));
  const edit = (row: PriceRow) => {
    setChosen(row.index);
    editing.show();
  };
  const { columns, card } = priceTable(edit);
  const rowActions = (row: PriceRow): RowAction[] => [
    { label: "Edit", icon: Pencil, onSelect: () => edit(row) },
    {
      label: "Remove",
      icon: Trash2,
      destructive: true,
      confirm: {
        title: `Remove ${priceName(row)}?`,
        body: "The new version is sold without it; versions already saved keep theirs.",
        label: "Remove",
      },
      onSelect: () =>
        onChange(prices.filter((_, index) => index !== row.index)),
    },
  ];
  const add = (
    <Button type="button" variant="outline" size="sm" onClick={adding.show}>
      <Plus aria-hidden />
      Add price
    </Button>
  );
  const editingPrice = chosen === null ? undefined : prices[chosen];
  return (
    <>
      <DataTable
        caption="Prices"
        rows={rows}
        columns={columns}
        rowLabel={(row) => `${row.currency} ${UNIT_NAMES[row.unit]}`}
        card={card}
        rowActions={rowActions}
        actions={add}
        empty={{
          icon: Tag,
          title: "No list price: each contract sets its own",
          description:
            "Add a price for each currency it is sold in, and how it is charged.",
          action: add,
          placement: "section",
        }}
      />
      <PriceSheet
        key={`add-${adding.key}`}
        open={adding.open}
        onOpenChange={adding.onOpenChange}
        price={null}
        currency={prices[0]?.currency ?? "EGP"}
        onSave={(price) => onChange([...prices, price])}
      />
      {editingPrice && chosen !== null ? (
        <PriceSheet
          key={`edit-${editing.key}`}
          open={editing.open}
          onOpenChange={editing.onOpenChange}
          price={editingPrice}
          currency={editingPrice.currency}
          onSave={(price) =>
            onChange(
              prices.map((kept, index) => (index === chosen ? price : kept)),
            )
          }
        />
      ) : null}
    </>
  );
}
