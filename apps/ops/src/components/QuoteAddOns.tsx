import type { AddOnVersionRow } from "@faridalms/database/business/catalogue";
import type { QuoteSpec } from "@faridalms/domain/quotes";
import type { Currency } from "@faridalms/domain/subscriptions";
import type {
  Column,
  DataTableCard,
  RowAction,
} from "@faridalms/ui/system/data-table";

import { netMinor } from "@faridalms/domain/money";
import { Button } from "@faridalms/ui/button";
import { DataTable, RowButton } from "@faridalms/ui/system/data-table";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { SheetForm, useSheet } from "@faridalms/ui/system/sheet-form";
import { SummaryList } from "@faridalms/ui/system/summary-list";
import { Value } from "@faridalms/ui/system/value";
import { Blocks, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { FigureDraft } from "../lines";

import { formatMoney } from "../format";
import { figuresNet, readFigures } from "../lines";

/** An add-on as a quote sells it. */
export type QuoteAddOn = QuoteSpec["addOns"][number];

/** An add-on's list price in the quote's currency, or none. */
export const listPrice = (
  prices: { currency: Currency; amountMinor: number }[],
  currency: Currency,
) => prices.find((price) => price.currency === currency)?.amountMinor ?? 0;

const typedAmount = (minor: number) => (minor / 100).toFixed(2);

const nameOf = (addOns: readonly AddOnVersionRow[], id: string) => {
  const addOn = addOns.find((row) => row.id === id);
  return addOn ? `${addOn.nameEn} version ${addOn.version}` : "Retired add-on";
};

const percentText = (percent: number) => `${percent.toLocaleString("en")}%`;

export interface AddOnSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The add-on being changed, or null for a new one. */
  line: QuoteAddOn | null;
  /** What the catalogue sells today. */
  addOns: readonly AddOnVersionRow[];
  currency: Currency;
  onSave: (line: QuoteAddOn) => void;
}

/**
 * One add-on of a quote: which, chosen from the catalogue at its list
 * price in the quote's currency, then how many, at what price and
 * discount, with what it comes to.
 */
export function AddOnSheet({
  open,
  onOpenChange,
  line,
  addOns,
  currency,
  onSave,
}: AddOnSheetProps) {
  const first = addOns[0];
  const [addOnVersionId, setAddOnVersionId] = useState(
    line?.addOnVersionId ?? first?.id ?? "",
  );
  const [figures, setFigures] = useState<FigureDraft>(() => ({
    quantity: String(line?.quantity ?? 1),
    price: typedAmount(
      line
        ? line.unitPriceMinor
        : first
          ? listPrice(first.prices, currency)
          : 0,
    ),
    discount: String(line?.discountPercent ?? 0),
  }));
  const [submitted, setSubmitted] = useState(false);
  const read = readFigures(figures);
  const error = (field: keyof FigureDraft) => {
    const message = submitted && !read.ok ? read.errors[field] : undefined;
    return message ? [message] : undefined;
  };
  const options = [
    ...(line && !addOns.some((row) => row.id === line.addOnVersionId)
      ? [{ value: line.addOnVersionId, label: "Retired add-on" }]
      : []),
    ...addOns.map((addOn) => ({
      value: addOn.id,
      label: `${addOn.nameEn} version ${addOn.version}`,
    })),
  ];
  const net = figuresNet(figures);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title={
        line ? `Edit ${nameOf(addOns, line.addOnVersionId)}` : "Add an add-on"
      }
      submitLabel={line ? "Save add-on" : "Add add-on"}
      onSubmit={() => {
        setSubmitted(true);
        if (!read.ok) return;
        onSave({
          addOnVersionId,
          quantity: read.quantity,
          unitPriceMinor: read.unitPriceMinor,
          discountPercent: read.discountPercent,
        });
        onOpenChange(false);
      }}
    >
      <SelectField
        label="Add-on"
        hint={`Starts at its list price in ${currency}.`}
        value={addOnVersionId}
        options={options}
        onChange={(chosen) => {
          setAddOnVersionId(chosen);
          const addOn = addOns.find((row) => row.id === chosen);
          if (addOn)
            setFigures((now) => ({
              ...now,
              price: typedAmount(listPrice(addOn.prices, currency)),
            }));
        }}
      />
      <div className="grid items-start gap-6 sm:grid-cols-3">
        <TextField
          label="Quantity"
          inputMode="numeric"
          dir="ltr"
          value={figures.quantity}
          errors={error("quantity")}
          onChange={(event) =>
            setFigures({ ...figures, quantity: event.target.value })
          }
        />
        <TextField
          label={`Unit price (${currency})`}
          inputMode="decimal"
          dir="ltr"
          value={figures.price}
          errors={error("price")}
          onChange={(event) =>
            setFigures({ ...figures, price: event.target.value })
          }
        />
        <TextField
          label="Discount (%)"
          inputMode="decimal"
          dir="ltr"
          value={figures.discount}
          errors={error("discount")}
          onChange={(event) =>
            setFigures({ ...figures, discount: event.target.value })
          }
        />
      </div>
      <div aria-live="polite">
        <SummaryList
          items={[
            {
              id: "net",
              label: "Net, after its discount",
              value:
                net === null ? (
                  <Value absent="Not priced yet" />
                ) : (
                  formatMoney(net, currency)
                ),
            },
          ]}
        />
      </div>
    </SheetForm>
  );
}

interface AddOnRow extends QuoteAddOn {
  id: string;
  index: number;
  name: string;
}

interface AddOnTableOptions {
  lines: readonly QuoteAddOn[];
  currency: Currency;
  onEdit: (row: AddOnRow) => void;
}

/** The table's columns and phone cards; Discount shows only when one has one. */
function addOnTable({ lines, currency, onEdit }: AddOnTableOptions) {
  const opener = (row: AddOnRow) => (
    <RowButton aria-label={`Edit ${row.name}`} onClick={() => onEdit(row)}>
      {row.name}
    </RowButton>
  );
  const discounts = lines.some((line) => line.discountPercent > 0);
  const columns: Column<AddOnRow>[] = [
    { id: "add-on", header: "Add-on", primary: true, cell: opener },
    {
      id: "quantity",
      header: "Quantity",
      align: "end",
      cell: (row) => row.quantity.toLocaleString("en"),
    },
    {
      id: "price",
      header: "Unit price",
      align: "end",
      cell: (row) => formatMoney(row.unitPriceMinor, currency),
    },
    ...(discounts
      ? [
          {
            id: "discount",
            header: "Discount",
            align: "end" as const,
            cell: (row: AddOnRow) =>
              row.discountPercent > 0 ? (
                percentText(row.discountPercent)
              ) : (
                <Value notApplicable />
              ),
          },
        ]
      : []),
    {
      id: "net",
      header: "Net",
      align: "end",
      cell: (row) => formatMoney(netMinor(row), currency),
    },
  ];
  const card: DataTableCard<AddOnRow> = {
    title: opener,
    fact: (row) =>
      `${row.quantity.toLocaleString("en")} × ${formatMoney(row.unitPriceMinor, currency)}${row.discountPercent > 0 ? `, less ${percentText(row.discountPercent)}` : ""}`,
    status: (row) => (
      <span className="text-sm tabular-nums">
        {formatMoney(netMinor(row), currency)}
      </span>
    ),
  };
  return { columns, card };
}

export interface QuoteAddOnsProps {
  lines: QuoteAddOn[];
  onChange: (lines: QuoteAddOn[]) => void;
  /** What the catalogue sells today. */
  addOns: readonly AddOnVersionRow[];
  currency: Currency;
}

/**
 * A quote's add-ons as a table: Add add-on, or an add-on's row, opens that
 * one in a sheet. They are saved with the quote, since a sent quote's
 * change is a new version of it.
 */
export function QuoteAddOns({
  lines,
  onChange,
  addOns,
  currency,
}: QuoteAddOnsProps) {
  const adding = useSheet();
  const editing = useSheet();
  const [chosen, setChosen] = useState<number | null>(null);
  const rows: AddOnRow[] = lines.map((line, index) => ({
    ...line,
    id: `add-on-${index}`,
    index,
    name: nameOf(addOns, line.addOnVersionId),
  }));
  const edit = (row: AddOnRow) => {
    setChosen(row.index);
    editing.show();
  };
  const { columns, card } = addOnTable({ lines, currency, onEdit: edit });
  const rowActions = (row: AddOnRow): RowAction[] => [
    { label: "Edit", icon: Pencil, onSelect: () => edit(row) },
    {
      label: "Remove",
      icon: Trash2,
      destructive: true,
      confirm: {
        title: `Remove ${row.name}?`,
        body: "It comes off the quote when the quote is saved.",
        label: "Remove",
      },
      onSelect: () => onChange(lines.filter((_, index) => index !== row.index)),
    },
  ];
  if (addOns.length === 0 && lines.length === 0)
    return <EmptyState placement="section" title="No add-ons are sold." />;
  const add = addOns.length ? (
    <Button type="button" variant="outline" size="sm" onClick={adding.show}>
      <Plus aria-hidden />
      Add add-on
    </Button>
  ) : null;
  const editingLine = chosen === null ? undefined : lines[chosen];
  return (
    <>
      <DataTable
        caption="Add-ons"
        rows={rows}
        columns={columns}
        rowLabel={(row) => row.name}
        card={card}
        rowActions={rowActions}
        actions={add}
        empty={{
          icon: Blocks,
          title: "Sell add-ons with it",
          description: `Each add-on is chosen from the catalogue at its list price in ${currency}, which the quote may change.`,
          action: add,
          placement: "section",
        }}
      />
      <AddOnSheet
        key={`add-${adding.key}`}
        open={adding.open}
        onOpenChange={adding.onOpenChange}
        line={null}
        addOns={addOns}
        currency={currency}
        onSave={(line) => onChange([...lines, line])}
      />
      {editingLine && chosen !== null ? (
        <AddOnSheet
          key={`edit-${editing.key}`}
          open={editing.open}
          onOpenChange={editing.onOpenChange}
          line={editingLine}
          addOns={addOns}
          currency={currency}
          onSave={(line) =>
            onChange(
              lines.map((kept, index) => (index === chosen ? line : kept)),
            )
          }
        />
      ) : null}
    </>
  );
}
