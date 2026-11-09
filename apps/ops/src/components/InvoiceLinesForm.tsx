import type { InvoiceLine } from "@faridalms/domain/invoices";
import type { Currency } from "@faridalms/domain/subscriptions";
import type {
  GridColumn,
  GridIssue,
  GridSurface,
} from "@faridalms/ui/system/data-grid";

import { netMinor, vatMinor } from "@faridalms/domain/money";
import {
  DataGrid,
  DateCell,
  GridAddButton,
  GridRemoveButton,
  NumberCell,
  TextCell,
  useFocusAfterRender,
} from "@faridalms/ui/system/data-grid";
import { SummaryList } from "@faridalms/ui/system/summary-list";

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
  /** Save was tried: each line's problems show on their cells. */
  checked?: boolean;
  /** Where the lines stand: in a sheet, or on a page of their own. */
  surface?: GridSurface;
}

const lineCell = (index: number, field: string) => `line-${index}-${field}`;

const figureOf = (text: string) => {
  const value = Number(text);
  return text.trim() === "" || !Number.isFinite(value) ? null : value;
};

/** What stops each line being read, tied to the cell it is about. */
function lineIssues(drafts: readonly LineDraft[]): GridIssue[] {
  return drafts.flatMap((draft, index) => {
    const line = `Line ${index + 1}`;
    const issues: GridIssue[] = [];
    if (!draft.descriptionEn.trim())
      issues.push({
        target: lineCell(index, "en"),
        label: line,
        message: "Describe it in English.",
      });
    if (!draft.descriptionAr.trim())
      issues.push({
        target: lineCell(index, "ar"),
        label: line,
        message: "Describe it in Arabic.",
      });
    const quantity = Number(draft.quantity);
    if (!Number.isInteger(quantity) || quantity < 1)
      issues.push({
        target: lineCell(index, "quantity"),
        label: line,
        message: "Give a quantity of 1 or more.",
      });
    if (minorOf(draft.price) === null)
      issues.push({
        target: lineCell(index, "price"),
        label: line,
        message: "Give its unit price.",
      });
    const discount = Number(draft.discount || "0");
    if (!Number.isFinite(discount) || discount < 0 || discount > 100)
      issues.push({
        target: lineCell(index, "discount"),
        label: line,
        message: "Give a discount between 0 and 100.",
      });
    return issues;
  });
}

interface LineGridOptions {
  drafts: LineDraft[];
  currency: Currency | null;
  set: (index: number, change: Partial<LineDraft>) => void;
  remove: (index: number) => void;
}

function lineGrid({ drafts, currency, set, remove }: LineGridOptions) {
  const at = (draft: LineDraft) => drafts.indexOf(draft);
  const name = (draft: LineDraft) => `line ${at(draft) + 1}`;
  const rowHeader = {
    header: "Description",
    cell: (draft: LineDraft) => (
      <TextCell
        id={lineCell(at(draft), "en")}
        label={`Description in English, ${name(draft)}`}
        dir="ltr"
        value={draft.descriptionEn}
        onChange={(descriptionEn) => set(at(draft), { descriptionEn })}
      />
    ),
  };
  const figure = (
    field: "quantity" | "price" | "discount",
    label: string,
    decimals: number,
  ) => ({
    id: field,
    header: label,
    numeric: true,
    cell: (draft: LineDraft) => (
      <NumberCell
        id={lineCell(at(draft), field)}
        label={`${label}, ${name(draft)}`}
        decimals={decimals}
        value={figureOf(draft[field])}
        onChange={(value) =>
          set(at(draft), { [field]: value === null ? "" : String(value) })
        }
      />
    ),
  });
  const columns: GridColumn<LineDraft>[] = [
    figure("quantity", "Quantity", 0),
    figure("price", currency ? `Unit price (${currency})` : "Unit price", 2),
    figure("discount", "Discount (%)", 2),
    {
      id: "net",
      header: "Net",
      numeric: true,
      cell: (draft) => {
        const net = netOf(draft);
        return net === null ? (
          <span className="text-muted-foreground">
            <span aria-hidden>—</span>
            <span className="sr-only">Not priced yet</span>
          </span>
        ) : (
          amountIn(net, currency)
        );
      },
    },
  ];
  const rowEnd = (draft: LineDraft) => (
    <GridRemoveButton
      label={`Remove ${name(draft)}`}
      disabled={drafts.length <= 1}
      onRemove={() => remove(at(draft))}
    />
  );
  const rowDetail = (draft: LineDraft) => (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="min-w-48 flex-1">
        <TextCell
          id={lineCell(at(draft), "ar")}
          label={`Description in Arabic, ${name(draft)}`}
          lang="ar"
          placeholder="Description in Arabic"
          value={draft.descriptionAr}
          onChange={(descriptionAr) => set(at(draft), { descriptionAr })}
        />
      </span>
      <span className="w-28">
        <TextCell
          id={lineCell(at(draft), "code")}
          label={`Item code, ${name(draft)}`}
          dir="ltr"
          placeholder="Item code"
          value={draft.itemCode}
          onChange={(itemCode) => set(at(draft), { itemCode })}
        />
      </span>
      <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <span aria-hidden>Period</span>
        <DateCell
          id={lineCell(at(draft), "from")}
          label={`Period from, ${name(draft)}`}
          value={draft.periodStart}
          onChange={(periodStart) => set(at(draft), { periodStart })}
        />
        <span aria-hidden>to</span>
        <DateCell
          id={lineCell(at(draft), "to")}
          label={`Period to, ${name(draft)}`}
          min={draft.periodStart || undefined}
          value={draft.periodEnd}
          onChange={(periodEnd) => set(at(draft), { periodEnd })}
        />
      </span>
    </div>
  );
  return { rowHeader, columns, rowEnd, rowDetail };
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
  checked = false,
  surface = "sheet",
}: InvoiceLinesFieldsProps) {
  const focusLater = useFocusAfterRender();
  const set = (index: number, change: Partial<LineDraft>) =>
    onChange(
      drafts.map((draft, at) =>
        at === index ? { ...draft, ...change } : draft,
      ),
    );
  return (
    <div className="grid min-w-0 gap-4">
      <DataGrid<LineDraft>
        caption="Lines"
        editing
        surface={surface}
        {...lineGrid({
          drafts,
          currency,
          set,
          remove: (index) => onChange(drafts.filter((_, at) => at !== index)),
        })}
        groups={[{ id: "lines", title: "", rows: drafts }]}
        rowKey={(draft) => `line-${drafts.indexOf(draft)}`}
        issues={checked ? lineIssues(drafts) : []}
        footer={
          <GridAddButton
            label="Add a line"
            onAdd={() => {
              onChange([...drafts, blankLine()]);
              focusLater(lineCell(drafts.length, "en"));
            }}
          />
        }
      />
      {vat ? (
        <LinesTotal currency={currency} drafts={drafts} vat={vat} />
      ) : null}
    </div>
  );
}
