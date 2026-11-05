import type { InvoiceLine } from "@faridalms/domain/invoices";

import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";

import { minorOf } from "../format";

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
export function linesOf(
  drafts: readonly LineDraft[],
): { ok: true; lines: InvoiceLine[] } | { ok: false; message: string } {
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

/** Invoice or credit note lines: what each is in both languages, its period and price. */
export function InvoiceLinesFields({
  prefix,
  currency,
  drafts,
  onChange,
}: {
  prefix: string;
  currency: string;
  drafts: LineDraft[];
  onChange: (drafts: LineDraft[]) => void;
}) {
  const set = (index: number, change: Partial<LineDraft>) =>
    onChange(
      drafts.map((draft, at) =>
        at === index ? { ...draft, ...change } : draft,
      ),
    );
  const field = (
    index: number,
    key: keyof LineDraft,
    label: string,
    options: {
      dir?: "ltr" | "rtl";
      type?: string;
      inputMode?: "decimal" | "numeric";
    } = {},
  ) => (
    <div className="grid gap-1">
      <label
        htmlFor={`${prefix}-${index}-${key}`}
        className="text-xs font-medium"
      >
        {label}
      </label>
      <Input
        id={`${prefix}-${index}-${key}`}
        dir={options.dir}
        lang={options.dir === "rtl" ? "ar" : undefined}
        type={options.type}
        inputMode={options.inputMode}
        value={drafts[index]?.[key] ?? ""}
        onChange={(event) => set(index, { [key]: event.target.value })}
      />
    </div>
  );
  return (
    <fieldset className="grid gap-4 text-sm">
      <legend className="mb-1 font-medium">Lines</legend>
      {drafts.map((line, index) => (
        <div
          key={`${prefix}-line-${index}`}
          className="grid gap-3 border-t pt-3 sm:grid-cols-2"
        >
          {field(index, "descriptionEn", "Description in English")}
          {field(index, "descriptionAr", "Description in Arabic", {
            dir: "rtl",
          })}
          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-4">
            {field(index, "quantity", "Quantity", { inputMode: "numeric" })}
            {field(index, "price", `Unit price (${currency})`, {
              inputMode: "decimal",
            })}
            {field(index, "discount", "Discount (%)", { inputMode: "decimal" })}
            {field(index, "itemCode", "Item code", { dir: "ltr" })}
          </div>
          {field(index, "periodStart", "Period from", { type: "date" })}
          {field(index, "periodEnd", "Period to", { type: "date" })}
          {drafts.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="justify-self-start"
              onClick={() => onChange(drafts.filter((_, at) => at !== index))}
            >
              Remove this line
            </Button>
          ) : null}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start"
        onClick={() => onChange([...drafts, blankLine()])}
      >
        Add a line
      </Button>
    </fieldset>
  );
}
