import type {
  AddOnVersionRow,
  PlanVersionRow,
} from "@faridalms/database/business/catalogue";
import type { QuoteSpec } from "@faridalms/domain/quotes";
import type {
  BillingSchedule,
  Currency,
} from "@faridalms/domain/subscriptions";
import type { GridColumn, GridIssue } from "@faridalms/ui/system/data-grid";
import type { ReactNode } from "react";

import { netMinor } from "@faridalms/domain/money";
import { BILLING_SCHEDULES, CURRENCIES } from "@faridalms/domain/subscriptions";
import {
  DataGrid,
  GridAddButton,
  GridRemoveButton,
  NumberCell,
  useFocusAfterRender,
} from "@faridalms/ui/system/data-grid";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { FormFooter } from "@faridalms/ui/system/form-footer";
import { FormSection } from "@faridalms/ui/system/record-form";
import { Textarea } from "@faridalms/ui/textarea";
import { useState } from "react";

import { formatMoney, minorOf } from "../format";
import { SCHEDULE_NAMES } from "./TermsFields";

const SCHEDULE_OPTIONS = BILLING_SCHEDULES.map((choice) => ({
  value: choice,
  label: SCHEDULE_NAMES[choice],
}));

const listPrice = (
  prices: { currency: Currency; amountMinor: number }[],
  currency: Currency,
) => prices.find((price) => price.currency === currency)?.amountMinor ?? 0;

const asMajor = (minor: number) => (minor / 100).toFixed(2);

interface LineDraft {
  addOnVersionId: string;
  quantity: string;
  price: string;
  discount: string;
}

const addOnCell = (index: number, field: string) => `add-on-${index}-${field}`;

const figureOf = (text: string) => {
  const value = Number(text);
  return text.trim() === "" || !Number.isFinite(value) ? null : value;
};

/** What a line comes to after its discount, once its numbers can be read. */
function lineNet(line: LineDraft): number | null {
  const quantity = Number(line.quantity);
  const unitPriceMinor = minorOf(line.price);
  const discountPercent = Number(line.discount || "0");
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

interface AddOnGridOptions {
  lines: LineDraft[];
  addOns: AddOnVersionRow[];
  currency: Currency;
  set: (index: number, change: Partial<LineDraft>) => void;
  remove: (index: number) => void;
}

function addOnGrid({ lines, addOns, currency, set, remove }: AddOnGridOptions) {
  const at = (line: LineDraft) => lines.indexOf(line);
  const name = (line: LineDraft) => {
    const addOn = addOns.find((row) => row.id === line.addOnVersionId);
    return addOn ? `${addOn.nameEn} version ${addOn.version}` : "Retired";
  };
  const rowHeader = {
    header: "Add-on",
    cell: (line: LineDraft) => (
      <span className="block max-w-56 truncate font-medium whitespace-nowrap">
        {name(line)}
      </span>
    ),
  };
  const figure = (
    field: "quantity" | "price" | "discount",
    label: string,
    decimals: number,
  ): GridColumn<LineDraft> => ({
    id: field,
    header: label,
    numeric: true,
    cell: (line) => (
      <NumberCell
        id={addOnCell(at(line), field)}
        label={`${label}, ${name(line)}`}
        decimals={decimals}
        value={figureOf(line[field])}
        onChange={(value) =>
          set(at(line), {
            [field]:
              value === null
                ? ""
                : field === "price"
                  ? value.toFixed(2)
                  : String(value),
          })
        }
      />
    ),
  });
  const columns: GridColumn<LineDraft>[] = [
    figure("quantity", "Quantity", 0),
    figure("price", `Unit price (${currency})`, 2),
    figure("discount", "Discount (%)", 2),
    {
      id: "net",
      header: "Net",
      numeric: true,
      cell: (line) => {
        const net = lineNet(line);
        return net === null ? (
          <span className="text-muted-foreground">
            <span aria-hidden>—</span>
            <span className="sr-only">Not priced yet</span>
          </span>
        ) : (
          formatMoney(net, currency)
        );
      },
    },
  ];
  const rowEnd = (line: LineDraft) => (
    <GridRemoveButton
      label={`Remove ${name(line)}`}
      onRemove={() => remove(at(line))}
    />
  );
  return { rowHeader, columns, rowEnd };
}

/** What stops each add-on being quoted, tied to its cell. */
function addOnIssues(
  lines: readonly LineDraft[],
  addOns: readonly AddOnVersionRow[],
): GridIssue[] {
  return lines.flatMap((line, index) => {
    const addOn = addOns.find((row) => row.id === line.addOnVersionId);
    const label = addOn
      ? `${addOn.nameEn} version ${addOn.version}`
      : "Retired";
    const issues: GridIssue[] = [];
    const quantity = Number(line.quantity);
    if (!Number.isInteger(quantity) || quantity < 1)
      issues.push({
        target: addOnCell(index, "quantity"),
        label,
        message: "Give a quantity of 1 or more.",
      });
    if (minorOf(line.price) === null)
      issues.push({
        target: addOnCell(index, "price"),
        label,
        message: "Give its unit price.",
      });
    const discount = Number(line.discount || "0");
    if (!Number.isFinite(discount) || discount < 0 || discount > 100)
      issues.push({
        target: addOnCell(index, "discount"),
        label,
        message: "Give a discount between 0 and 100.",
      });
    return issues;
  });
}

export interface QuoteFormProps {
  initial: QuoteSpec;
  plans: PlanVersionRow[];
  addOns: AddOnVersionRow[];
  submitLabel: string;
  /** Saves the quote; resolves to what went wrong, or null. */
  onSubmit: (spec: QuoteSpec) => Promise<string | null>;
  /** Beside the submit button, such as Cancel. */
  secondary?: ReactNode;
}

/**
 * A quote as an operator builds it from what is sold: a plan and add-ons,
 * each with its quantity, price and discount, the term and its billing,
 * how long the offer stands, and notes in both languages.
 */
export function QuoteForm({
  initial,
  plans,
  addOns,
  submitLabel,
  onSubmit,
  secondary,
}: QuoteFormProps) {
  const [currency, setCurrency] = useState<Currency>(initial.currency);
  const [planVersionId, setPlanVersionId] = useState(
    initial.planVersionId ?? "",
  );
  const [quantity, setQuantity] = useState(String(initial.quantity));
  const [price, setPrice] = useState(asMajor(initial.unitPriceMinor));
  const [discount, setDiscount] = useState(String(initial.discountPercent));
  const [lines, setLines] = useState<LineDraft[]>(
    initial.addOns.map((addOn) => ({
      addOnVersionId: addOn.addOnVersionId,
      quantity: String(addOn.quantity),
      price: asMajor(addOn.unitPriceMinor),
      discount: String(addOn.discountPercent),
    })),
  );
  const [termStartsOn, setTermStartsOn] = useState(initial.termStartsOn);
  const [termEndsOn, setTermEndsOn] = useState(initial.termEndsOn);
  const [schedule, setSchedule] = useState<BillingSchedule>(initial.schedule);
  const [validUntil, setValidUntil] = useState(initial.validUntil);
  const [notesEn, setNotesEn] = useState(initial.notesEn ?? "");
  const [notesAr, setNotesAr] = useState(initial.notesAr ?? "");
  const [answer, setAnswer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);
  const focusLater = useFocusAfterRender();

  const read = ():
    | { ok: true; spec: QuoteSpec }
    | { ok: false; message: string } => {
    const count = Number(quantity);
    const unitPriceMinor = minorOf(price);
    const off = Number(discount || "0");
    if (
      planVersionId &&
      (!Number.isInteger(count) || count < 1 || unitPriceMinor === null)
    )
      return {
        ok: false,
        message: "Give the plan a quantity and a unit price.",
      };
    if (!Number.isFinite(off) || off < 0 || off > 100)
      return {
        ok: false,
        message: "A discount is between 0 and 100 per cent.",
      };
    const added: QuoteSpec["addOns"] = [];
    for (const line of lines) {
      const linePrice = minorOf(line.price);
      const lineCount = Number(line.quantity);
      const lineOff = Number(line.discount || "0");
      if (
        linePrice === null ||
        !Number.isInteger(lineCount) ||
        lineCount < 1 ||
        !Number.isFinite(lineOff) ||
        lineOff < 0 ||
        lineOff > 100
      )
        return {
          ok: false,
          message:
            "Give each add-on a quantity, a unit price and a discount between 0 and 100.",
        };
      added.push({
        addOnVersionId: line.addOnVersionId,
        quantity: lineCount,
        unitPriceMinor: linePrice,
        discountPercent: lineOff,
      });
    }
    if (!planVersionId && added.length === 0)
      return {
        ok: false,
        message: "A quote sells a plan or at least one add-on.",
      };
    if (!termStartsOn || !termEndsOn || termEndsOn <= termStartsOn)
      return { ok: false, message: "Give the term, ending after it starts." };
    return {
      ok: true,
      spec: {
        currency,
        planVersionId: planVersionId || null,
        quantity: planVersionId ? count : 1,
        unitPriceMinor: planVersionId ? (unitPriceMinor ?? 0) : 0,
        discountPercent: planVersionId ? off : 0,
        addOns: added,
        termStartsOn,
        termEndsOn,
        schedule,
        validUntil,
        notesEn: notesEn.trim() || null,
        notesAr: notesAr.trim() || null,
      },
    };
  };

  const setLine = (index: number, change: Partial<LineDraft>) =>
    setLines((current) =>
      current.map((line, at) => (at === index ? { ...line, ...change } : line)),
    );

  const currencyOptions = CURRENCIES.map((choice) => ({
    value: choice,
    label: choice,
  }));
  const addAddOn = (
    <GridAddButton
      label="Add an add-on"
      choices={addOns.map((addOn) => ({
        value: addOn.id,
        label: `${addOn.nameEn} version ${addOn.version}`,
      }))}
      onAdd={(chosen) => {
        const addOn = addOns.find((row) => row.id === chosen);
        if (!addOn) return;
        setLines((current) => [
          ...current,
          {
            addOnVersionId: addOn.id,
            quantity: "1",
            price: asMajor(listPrice(addOn.prices, currency)),
            discount: "0",
          },
        ]);
        focusLater(addOnCell(lines.length, "quantity"));
      }}
    />
  );

  return (
    <form
      aria-label="Quote"
      noValidate
      className="grid gap-10"
      onSubmit={async (event) => {
        event.preventDefault();
        setTried(true);
        const out = read();
        if (!out.ok) {
          setAnswer(out.message);
          return;
        }
        setSaving(true);
        setAnswer(await onSubmit(out.spec));
        setSaving(false);
      }}
    >
      <FormSection title="What is sold">
        <div className="grid items-start gap-6 sm:grid-cols-2">
          <SelectField
            label="Currency"
            width="code"
            value={currency}
            options={currencyOptions}
            onChange={setCurrency}
          />
          <TextField
            label="Valid until"
            type="date"
            width="date"
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
          />
        </div>
        <SelectField
          label="Plan"
          value={planVersionId}
          options={[
            { value: "", label: "No plan: add-ons alone" },
            ...plans.map((plan) => ({
              value: plan.id,
              label: `${plan.nameEn} version ${plan.version}`,
            })),
          ]}
          onChange={(chosen) => {
            setPlanVersionId(chosen);
            const plan = plans.find((row) => row.id === chosen);
            setPrice(asMajor(plan ? listPrice(plan.prices, currency) : 0));
          }}
        />
        {planVersionId ? (
          <div className="grid items-start gap-6 sm:grid-cols-3">
            <TextField
              label="Quantity"
              inputMode="numeric"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
            <TextField
              label={`Unit price (${currency})`}
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
            />
            <TextField
              label="Discount (%)"
              inputMode="decimal"
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
            />
          </div>
        ) : null}
      </FormSection>

      <FormSection title="Add-ons">
        {addOns.length ? (
          lines.length ? (
            <DataGrid<LineDraft>
              caption="Add-ons"
              editing
              surface="page"
              {...addOnGrid({
                lines,
                addOns,
                currency,
                set: setLine,
                remove: (index) =>
                  setLines((current) =>
                    current.filter((_, at) => at !== index),
                  ),
              })}
              groups={[{ id: "add-ons", title: "", rows: lines }]}
              rowKey={(line) => `add-on-${lines.indexOf(line)}`}
              issues={tried ? addOnIssues(lines, addOns) : []}
              footer={addAddOn}
            />
          ) : (
            <div>{addAddOn}</div>
          )
        ) : (
          <EmptyState placement="section" title="No add-ons are sold." />
        )}
      </FormSection>

      <FormSection title="Term">
        <div className="grid items-start gap-6 sm:grid-cols-3">
          <TextField
            label="Term starts"
            type="date"
            value={termStartsOn}
            onChange={(event) => setTermStartsOn(event.target.value)}
          />
          <TextField
            label="Term ends"
            type="date"
            value={termEndsOn}
            onChange={(event) => setTermEndsOn(event.target.value)}
          />
          <SelectField
            label="Billing"
            value={schedule}
            options={SCHEDULE_OPTIONS}
            onChange={setSchedule}
          />
        </div>
      </FormSection>

      <FormSection title="Notes">
        <div className="grid items-start gap-6 sm:grid-cols-2">
          <FormField label="Notes in English" optional>
            {(control) => (
              <Textarea
                {...control}
                maxLength={2000}
                value={notesEn}
                onChange={(event) => setNotesEn(event.target.value)}
              />
            )}
          </FormField>
          <FormField label="Notes in Arabic" optional>
            {(control) => (
              <Textarea
                {...control}
                dir="rtl"
                lang="ar"
                maxLength={2000}
                value={notesAr}
                onChange={(event) => setNotesAr(event.target.value)}
              />
            )}
          </FormField>
        </div>
      </FormSection>

      <FormFooter
        submitLabel={submitLabel}
        pending={saving}
        error={answer}
        secondary={secondary}
      />
    </form>
  );
}
