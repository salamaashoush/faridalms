import type { InvoiceLine } from "@faridalms/domain/invoices";
import type { Currency } from "@faridalms/domain/subscriptions";

import { netMinor, vatMinor } from "@faridalms/domain/money";
import { Button } from "@faridalms/ui/button";
import { TextField } from "@faridalms/ui/system/form-field";
import { SummaryList } from "@faridalms/ui/system/summary-list";
import { Plus, X } from "lucide-react";

import { formatMoney, minorOf } from "../format";

/** A line as an operator edits it, money typed in the currency's units. */
export interface LineDraft {
  descriptionEn: string;
  descriptionAr: string;
  itemCode: string;
  periodStart: string;
  periodEnd: string;
  quantity: string;
  price: string;
  discount: string;
}

export const lineDraftOf = (line: InvoiceLine): LineDraft => ({
  descriptionEn: line.descriptionEn,
  descriptionAr: line.descriptionAr,
  itemCode: line.itemCode ?? "",
  periodStart: line.periodStart ?? "",
  periodEnd: line.periodEnd ?? "",
  quantity: String(line.quantity),
  price: (line.unitPriceMinor / 100).toFixed(2),
  discount: String(line.discountPercent),
});

export const blankLine = (): LineDraft => ({
  descriptionEn: "",
  descriptionAr: "",
  itemCode: "",
  periodStart: "",
  periodEnd: "",
  quantity: "1",
  price: "",
  discount: "0",
});

/** The lines the drafts set, or why one cannot be read. */
/** What reading the drafts gave: the lines, or why they cannot be read. */
export type ReadLines =
  | { ok: true; lines: InvoiceLine[] }
  | { ok: false; message: string };

export function linesOf(drafts: readonly LineDraft[]): ReadLines {
  const lines: InvoiceLine[] = [];
  for (const draft of drafts) {
    const quantity = Number(draft.quantity);
    const unitPriceMinor = minorOf(draft.price);
    const discountPercent = Number(draft.discount || "0");
    if (
      !draft.descriptionEn.trim() ||
      !draft.descriptionAr.trim() ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      unitPriceMinor === null ||
      !Number.isFinite(discountPercent) ||
      discountPercent < 0 ||
      discountPercent > 100
    )
      return {
        ok: false,
        message:
          "Give each line its description in both languages, a quantity, a price and a discount between 0 and 100.",
      };
    lines.push({
      descriptionEn: draft.descriptionEn.trim(),
      descriptionAr: draft.descriptionAr.trim(),
      itemCode: draft.itemCode.trim() || null,
      periodStart: draft.periodStart || null,
      periodEnd: draft.periodEnd || null,
      quantity,
      unitPriceMinor,
      discountPercent,
    });
  }
  if (lines.length === 0) return { ok: false, message: "Add a line." };
  return { ok: true, lines };
}

/** What a line comes to after its discount, once its numbers can be read. */
function netOf(draft: LineDraft): number | null {
  const quantity = Number(draft.quantity);
  const unitPriceMinor = minorOf(draft.price);
  const discountPercent = Number(draft.discount || "0");
  if (
    !Number.isInteger(quantity) ||
    quantity < 1 ||
    unitPriceMinor === null ||
    !Number.isFinite(discountPercent) ||
    discountPercent < 0 ||
    discountPercent > 100
  )
    return null;
  return netMinor({ quantity, unitPriceMinor, discountPercent });
}

export interface LinesVat {
  percent: number;
  name: string | null;
}

/** An amount in the currency's units, or as a bare number before the currency is known. */
const amountIn = (minor: number, currency: Currency | null) =>
  currency
    ? formatMoney(minor, currency)
    : (minor / 100).toLocaleString("en", { minimumFractionDigits: 2 });

export interface InvoiceLinesFieldsProps {
  /** Null until the customer, and so the currency, is chosen. */
  currency: Currency | null;
  drafts: LineDraft[];
  onChange: (drafts: LineDraft[]) => void;
  /** Totals the lines under them, with this VAT, when given. */
  vat?: LinesVat;
}

interface LinesTotalProps {
  currency: Currency | null;
  drafts: readonly LineDraft[];
  vat: LinesVat;
}

function LinesTotal({ currency, drafts, vat }: LinesTotalProps) {
  const nets = drafts.map(netOf);
  const known = nets.filter((net) => net !== null);
  const subtotal = known.reduce((sum, net) => sum + net, 0);
  const tax = vatMinor(subtotal, vat.percent);
  const vatLabel = `${vat.name ?? "VAT"} at ${vat.percent.toLocaleString("en")}%`;
  return (
    <SummaryList
      items={[
        {
          id: "subtotal",
          label:
            known.length < drafts.length
              ? "Subtotal of the lines priced so far"
              : "Subtotal",
          value: amountIn(subtotal, currency),
        },
        {
          id: "vat",
          label: vatLabel,
          value: amountIn(tax, currency),
        },
        {
          id: "total",
          label: "Total",
          value: amountIn(subtotal + tax, currency),
        },
      ]}
    />
  );
}

/** Invoice or credit note lines: what each is in both languages, its period and price. */
export function InvoiceLinesFields({
  currency,
  drafts,
  onChange,
  vat,
}: InvoiceLinesFieldsProps) {
  const set = (index: number, change: Partial<LineDraft>) =>
    onChange(
      drafts.map((draft, at) =>
        at === index ? { ...draft, ...change } : draft,
      ),
    );
  return (
    <div className="@container grid gap-4">
      {drafts.map((line, index) => {
        const net = netOf(line);
        return (
          <div
            key={`line-${index}`}
            className="grid gap-5 rounded-lg border bg-card p-5"
          >
            <div className="flex min-h-8 items-center gap-2">
              <span className="text-sm leading-5 font-semibold">
                Line {index + 1}
              </span>
              <span className="ms-auto text-sm leading-5 text-muted-foreground tabular-nums">
                {net === null ? "Not priced yet" : amountIn(net, currency)}
              </span>
              {drafts.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove line ${index + 1}`}
                  onClick={() =>
                    onChange(drafts.filter((_, at) => at !== index))
                  }
                >
                  <X aria-hidden />
                </Button>
              ) : null}
            </div>
            <div className="grid items-start gap-5 @lg:grid-cols-2">
              <TextField
                label="Description in English"
                value={line.descriptionEn}
                onChange={(event) =>
                  set(index, { descriptionEn: event.target.value })
                }
              />
              <TextField
                label="Description in Arabic"
                dir="rtl"
                lang="ar"
                value={line.descriptionAr}
                onChange={(event) =>
                  set(index, { descriptionAr: event.target.value })
                }
              />
            </div>
            <div className="grid items-start gap-5 @lg:grid-cols-4">
              <TextField
                label="Quantity"
                inputMode="numeric"
                value={line.quantity}
                onChange={(event) =>
                  set(index, { quantity: event.target.value })
                }
              />
              <TextField
                label={currency ? `Unit price (${currency})` : "Unit price"}
                inputMode="decimal"
                value={line.price}
                onChange={(event) => set(index, { price: event.target.value })}
              />
              <TextField
                label="Discount (%)"
                inputMode="decimal"
                value={line.discount}
                onChange={(event) =>
                  set(index, { discount: event.target.value })
                }
              />
              <TextField
                label="Item code"
                optional
                dir="ltr"
                value={line.itemCode}
                onChange={(event) =>
                  set(index, { itemCode: event.target.value })
                }
              />
            </div>
            <div className="grid items-start gap-5 @lg:grid-cols-2">
              <TextField
                label="Period from"
                optional
                type="date"
                value={line.periodStart}
                onChange={(event) =>
                  set(index, { periodStart: event.target.value })
                }
              />
              <TextField
                label="Period to"
                optional
                type="date"
                value={line.periodEnd}
                onChange={(event) =>
                  set(index, { periodEnd: event.target.value })
                }
              />
            </div>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={() => onChange([...drafts, blankLine()])}
      >
        <Plus aria-hidden />
        Add a line
      </Button>
      {vat ? (
        <LinesTotal currency={currency} drafts={drafts} vat={vat} />
      ) : null}
    </div>
  );
}
