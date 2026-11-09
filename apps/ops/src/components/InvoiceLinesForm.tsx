import type { InvoiceLine } from "@faridalms/domain/invoices";
import type { Currency } from "@faridalms/domain/subscriptions";
import type {
  Column,
  DataTableCard,
  DataTableTotal,
  RowAction,
} from "@faridalms/ui/system/data-table";
import type { SheetState } from "@faridalms/ui/system/sheet-form";
import type { LucideIcon } from "lucide-react";

import { invoiceTotals } from "@faridalms/domain/invoices";
import { netMinor } from "@faridalms/domain/money";
import { Button } from "@faridalms/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@faridalms/ui/dropdown-menu";
import { phoneMenuItem } from "@faridalms/ui/system/action-menu";
import { DataTable, RowButton } from "@faridalms/ui/system/data-table";
import { TextField } from "@faridalms/ui/system/form-field";
import { SheetForm, useSheet } from "@faridalms/ui/system/sheet-form";
import { SummaryList } from "@faridalms/ui/system/summary-list";
import { Value } from "@faridalms/ui/system/value";
import { CopyPlus, Pencil, Plus, ReceiptText, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { LineDraft, LineErrors, LineField } from "../lines";

import { formatDay, formatMoney } from "../format";
import { blankLine, draftNet, lineDraftOf, readLine } from "../lines";

/** The VAT the lines are totalled with. */
export interface LinesVat {
  percent: number;
  name: string | null;
}

/** An amount in the currency's units, or as a bare number before the currency is known. */
const amountIn = (minor: number, currency: Currency | null) =>
  currency
    ? formatMoney(minor, currency)
    : (minor / 100).toLocaleString("en", { minimumFractionDigits: 2 });

const periodText = (line: InvoiceLine) =>
  line.periodStart && line.periodEnd
    ? `${formatDay(line.periodStart)} to ${formatDay(line.periodEnd)}`
    : line.periodStart
      ? `From ${formatDay(line.periodStart)}`
      : line.periodEnd
        ? `To ${formatDay(line.periodEnd)}`
        : null;

const percentText = (percent: number) => `${percent.toLocaleString("en")}%`;

export interface LineSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The line being changed, or null for a new one. */
  line: InvoiceLine | null;
  /** What a new line starts from, such as the invoice's line a credit note takes back. */
  seed?: InvoiceLine | null;
  /** Its number among the lines, to name it. */
  number: number;
  /** Null until the customer, and so the currency, is chosen. */
  currency: Currency | null;
  /** Saves the line; answers what went wrong, or null. */
  onSave: (line: InvoiceLine) => Promise<string | null> | string | null;
}

/**
 * One line of an invoice or a credit note: what it is in both languages,
 * its figures with what they come to, then the period and the tax
 * authority's item code it may carry.
 */
export function LineSheet({
  open,
  onOpenChange,
  line,
  seed = null,
  number,
  currency,
  onSave,
}: LineSheetProps) {
  const [draft, setDraft] = useState<LineDraft>(() => {
    const start = line ?? seed;
    return start ? lineDraftOf(start) : blankLine();
  });
  const [errors, setErrors] = useState<LineErrors | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (field: LineField, value: string) => {
    const next = { ...draft, [field]: value };
    setDraft(next);
    if (errors) {
      const read = readLine(next);
      setErrors(read.ok ? {} : read.errors);
    }
  };
  const error = (field: LineField) => {
    const message = errors?.[field];
    return message ? [message] : undefined;
  };
  const net = draftNet(draft);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title={line ? `Edit line ${number}` : "Add a line"}
      submitLabel={line ? "Save line" : "Add line"}
      pending={saving}
      error={answer}
      onSubmit={async () => {
        const read = readLine(draft);
        if (!read.ok) {
          setErrors(read.errors);
          return;
        }
        setErrors({});
        setSaving(true);
        setAnswer(null);
        const failed = await onSave(read.line);
        setSaving(false);
        if (failed) {
          setAnswer(failed);
          return;
        }
        onOpenChange(false);
      }}
    >
      <TextField
        label="Description in English"
        dir="ltr"
        maxLength={300}
        value={draft.descriptionEn}
        errors={error("descriptionEn")}
        onChange={(event) => set("descriptionEn", event.target.value)}
      />
      <TextField
        label="Description in Arabic"
        dir="rtl"
        lang="ar"
        maxLength={300}
        value={draft.descriptionAr}
        errors={error("descriptionAr")}
        onChange={(event) => set("descriptionAr", event.target.value)}
      />
      <div className="grid items-start gap-6 sm:grid-cols-3">
        <TextField
          label="Quantity"
          inputMode="numeric"
          dir="ltr"
          value={draft.quantity}
          errors={error("quantity")}
          onChange={(event) => set("quantity", event.target.value)}
        />
        <TextField
          label={currency ? `Unit price (${currency})` : "Unit price"}
          inputMode="decimal"
          dir="ltr"
          value={draft.price}
          errors={error("price")}
          onChange={(event) => set("price", event.target.value)}
        />
        <TextField
          label="Discount (%)"
          inputMode="decimal"
          dir="ltr"
          value={draft.discount}
          errors={error("discount")}
          onChange={(event) => set("discount", event.target.value)}
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
                  amountIn(net, currency)
                ),
            },
          ]}
        />
      </div>
      <div className="grid items-start gap-6 sm:grid-cols-2">
        <TextField
          label="Period from"
          optional
          type="date"
          width="date"
          value={draft.periodStart}
          errors={error("periodStart")}
          onChange={(event) => set("periodStart", event.target.value)}
        />
        <TextField
          label="Period to"
          optional
          type="date"
          width="date"
          min={draft.periodStart || undefined}
          value={draft.periodEnd}
          errors={error("periodEnd")}
          onChange={(event) => set("periodEnd", event.target.value)}
        />
      </div>
      <TextField
        label="Item code"
        optional
        hint="The item's code registered with the tax authority, where it has one."
        dir="ltr"
        width="reference"
        maxLength={40}
        value={draft.itemCode}
        onChange={(event) => set("itemCode", event.target.value)}
      />
    </SheetForm>
  );
}

/** What changed among the lines, for the page to say so. */
export type LineChange = "added" | "changed" | "removed";

interface LineRow extends InvoiceLine {
  id: string;
  number: number;
}

const lineName = (row: LineRow) => `line ${row.number}: ${row.descriptionEn}`;

interface LineTableOptions {
  lines: readonly InvoiceLine[];
  currency: Currency | null;
  onEdit: (row: LineRow) => void;
}

/**
 * The table's columns and phone cards. Period and Discount show only when
 * a line has one, so a plain invoice reads as quantity, price and net.
 */
function lineTable({ lines, currency, onEdit }: LineTableOptions) {
  const opener = (row: LineRow) => (
    <RowButton aria-label={`Edit ${lineName(row)}`} onClick={() => onEdit(row)}>
      {row.descriptionEn}
    </RowButton>
  );
  const periods = lines.some((line) => periodText(line) !== null);
  const discounts = lines.some((line) => line.discountPercent > 0);
  const columns: Column<LineRow>[] = [
    {
      id: "description",
      header: "Description",
      primary: true,
      cell: (row) => (
        <span className="grid min-w-0 py-2">
          {opener(row)}
          <span
            dir="rtl"
            lang="ar"
            className="justify-self-start truncate text-[13px] leading-[18px] text-muted-foreground"
          >
            {row.descriptionAr}
          </span>
        </span>
      ),
    },
    ...(periods
      ? [
          {
            id: "period",
            header: "Period",
            cell: (row: LineRow) => (
              <Value notApplicable={periodText(row) === null}>
                {periodText(row)}
              </Value>
            ),
          },
        ]
      : []),
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
      cell: (row) => amountIn(row.unitPriceMinor, currency),
    },
    ...(discounts
      ? [
          {
            id: "discount",
            header: "Discount",
            align: "end" as const,
            cell: (row: LineRow) =>
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
      cell: (row) => amountIn(netMinor(row), currency),
    },
  ];
  const card: DataTableCard<LineRow> = {
    title: opener,
    fact: (row) =>
      `${row.quantity.toLocaleString("en")} × ${amountIn(row.unitPriceMinor, currency)}${row.discountPercent > 0 ? `, less ${percentText(row.discountPercent)}` : ""}`,
    status: (row) => (
      <span className="text-sm tabular-nums">
        {amountIn(netMinor(row), currency)}
      </span>
    ),
  };
  return { columns, card };
}

export interface InvoiceLinesProps {
  /** Names the table, and the card list on phones. */
  caption: string;
  /** Null until the customer, and so the currency, is chosen. */
  currency: Currency | null;
  lines: readonly InvoiceLine[];
  /** Totals the lines under them with this VAT, when it is known. */
  vat?: LinesVat;
  /**
   * Keeps the lines with one added, changed or removed: saves them, or
   * holds them for the form. Answers what went wrong, or null.
   */
  onSave: (
    lines: InvoiceLine[],
    change: LineChange,
  ) => Promise<string | null> | string | null;
  /** The fewest lines it keeps: a saved draft always has one. */
  least?: 0 | 1;
  /** What the empty table asks for, with Add line beside it. */
  empty: { title: string; description: string; icon?: LucideIcon };
  /** Opens the sheet that adds a line, when the page offers that elsewhere too. */
  adding?: SheetState;
  /**
   * Lines a new one may start from, offered from a menu beside Add line,
   * such as the lines of the invoice a credit note takes back.
   */
  from?: { label: string; lines: readonly InvoiceLine[] };
}

/**
 * The lines of an invoice or a credit note as a table: each line's
 * figures and what it comes to, the subtotal, VAT and total under them.
 * Add line, or a line's Edit, opens that one line in a sheet; removing
 * one asks first.
 */
export function InvoiceLines({
  caption,
  currency,
  lines,
  vat,
  onSave,
  least = 0,
  empty,
  adding: givenAdding,
  from,
}: InvoiceLinesProps) {
  const ownAdding = useSheet();
  const adding = givenAdding ?? ownAdding;
  const editing = useSheet();
  const [chosen, setChosen] = useState<number | null>(null);
  const [seed, setSeed] = useState<InvoiceLine | null>(null);
  const sources = (from?.lines ?? []).map((line, index) => ({
    id: `source-${index + 1}`,
    line,
  }));
  const rows: LineRow[] = lines.map((line, index) => ({
    ...line,
    id: `line-${index}`,
    number: index + 1,
  }));
  const edit = (row: LineRow) => {
    setChosen(row.number - 1);
    editing.show();
  };
  const { columns, card } = lineTable({ lines, currency, onEdit: edit });
  const totals = invoiceTotals(lines, vat?.percent ?? 0);
  const totalRows: DataTableTotal[] = [
    {
      id: "subtotal",
      label: "Subtotal",
      cells: { net: amountIn(totals.subtotalMinor, currency) },
    },
    ...(vat
      ? [
          {
            id: "vat",
            label: `${vat.name ?? "VAT"} at ${percentText(vat.percent)}`,
            cells: { net: amountIn(totals.vatMinor, currency) },
          },
          {
            id: "total",
            label: "Total",
            cells: { net: amountIn(totals.totalMinor, currency) },
          },
        ]
      : []),
  ];
  const rowActions = (row: LineRow): RowAction[] => [
    { label: "Edit", icon: Pencil, onSelect: () => edit(row) },
    ...(lines.length > least
      ? [
          {
            label: "Remove",
            icon: Trash2,
            destructive: true as const,
            confirm: {
              title: `Remove ${lineName(row)}?`,
              body: "It comes off the lines, and the total is worked out again.",
              label: "Remove",
            },
            onSelect: async () => {
              const failed = await onSave(
                lines.filter((_, index) => index !== row.number - 1),
                "removed",
              );
              if (failed) toast.error(failed);
            },
          },
        ]
      : []),
  ];
  const add = (
    <div className="flex flex-wrap items-center gap-2">
      {from?.lines.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="outline" size="sm" />}
          >
            <CopyPlus aria-hidden />
            {from.label}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-auto min-w-56">
            {sources.map(({ id, line }) => (
              <DropdownMenuItem
                key={id}
                className={phoneMenuItem}
                onClick={() => {
                  setSeed(line);
                  adding.show();
                }}
              >
                <span dir="auto">{line.descriptionEn}</span>
                <span className="ms-auto ps-4 text-muted-foreground tabular-nums">
                  {amountIn(netMinor(line), currency)}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setSeed(null);
          adding.show();
        }}
      >
        <Plus aria-hidden />
        Add line
      </Button>
    </div>
  );
  const editingLine = chosen === null ? undefined : lines[chosen];
  return (
    <>
      <DataTable
        caption={caption}
        rows={rows}
        columns={columns}
        rowLabel={(row) => `Line ${row.number}`}
        card={card}
        rowActions={rowActions}
        totals={rows.length ? totalRows : undefined}
        actions={add}
        empty={{
          icon: empty.icon ?? ReceiptText,
          title: empty.title,
          description: empty.description,
          action: add,
        }}
      />
      <LineSheet
        key={`add-${adding.key}`}
        open={adding.open}
        onOpenChange={adding.onOpenChange}
        line={null}
        seed={seed}
        number={lines.length + 1}
        currency={currency}
        onSave={(line) => onSave([...lines, line], "added")}
      />
      {editingLine && chosen !== null ? (
        <LineSheet
          key={`edit-${editing.key}`}
          open={editing.open}
          onOpenChange={editing.onOpenChange}
          line={editingLine}
          number={chosen + 1}
          currency={currency}
          onSave={(line) =>
            onSave(
              lines.map((kept, index) => (index === chosen ? line : kept)),
              "changed",
            )
          }
        />
      ) : null}
    </>
  );
}
