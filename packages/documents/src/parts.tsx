import type { ReactNode } from "react";

import { netMinor } from "@faridalms/domain/money";
import { formattingLocale } from "@faridalms/domain/school";

export type Language = "en" | "ar";

/** The business's own details, as its documents carry them. */
export interface BusinessDetails {
  legalNameEn: string;
  legalNameAr: string;
  addressEn: string;
  addressAr: string;
  taxNumber: string;
  commercialRegistry: string | null;
  email: string;
  bankDetailsEn?: string | null;
  bankDetailsAr?: string | null;
}

/** Who a document is for. */
export interface PartyDetails {
  name: string;
  nameAr: string | null;
  address: string | null;
  taxNumber: string | null;
}

/** A line as a document prints it. */
export interface DocumentLine {
  key: string;
  nameEn: string;
  nameAr: string;
  noteEn?: string | null;
  noteAr?: string | null;
  quantity: number;
  unitPriceMinor: number;
  discountPercent: number;
}

/** The words every business document shares, in each language it is printed in. */
export const WORDS = {
  en: {
    to: "To",
    taxNumber: "Tax registration number",
    registry: "Commercial registry",
    item: "Item",
    quantity: "Quantity",
    unitPrice: "Unit price",
    discount: "Discount",
    amount: "Amount",
    subtotal: "Subtotal before VAT",
    noVat: "No VAT",
    total: "Total",
    notes: "Notes",
    noProfile:
      "The business's legal details are not set: an owner sets them in Settings before anything goes out.",
  },
  ar: {
    to: "إلى",
    taxNumber: "رقم التسجيل الضريبي",
    registry: "السجل التجاري",
    item: "البند",
    quantity: "الكمية",
    unitPrice: "سعر الوحدة",
    discount: "الخصم",
    amount: "المبلغ",
    subtotal: "المجموع قبل الضريبة",
    noVat: "دون ضريبة",
    total: "الإجمالي",
    notes: "ملاحظات",
    noProfile:
      "لم تُحدَّد البيانات القانونية للشركة بعد: يحددها المالك في الإعدادات قبل إرسال أي مستند.",
  },
} as const;

/** Money and days as a document in a language writes them, with Latin digits. */
export function formatters(language: Language, currency: string) {
  const locale = formattingLocale(language, "latn");
  return {
    locale,
    money: (minor: number) =>
      new Intl.NumberFormat(locale, { style: "currency", currency }).format(
        minor / 100,
      ),
    day: (iso: string) =>
      new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString(locale, {
        dateStyle: "long",
        timeZone: "UTC",
      }),
    number: (value: number) => value.toLocaleString(locale),
  };
}

/**
 * A business document's frame: paper in either theme, since it is printed
 * as it is shown, and right to left in Arabic.
 */
export function Paper({
  language,
  label,
  children,
}: {
  language: Language;
  label: string;
  children: ReactNode;
}) {
  return (
    <article
      dir={language === "ar" ? "rtl" : "ltr"}
      lang={language}
      aria-label={label}
      className="grid gap-6 rounded-lg border border-neutral-200 bg-white p-8 text-sm text-neutral-900 print:border-0 print:p-0"
    >
      {children}
    </article>
  );
}

/** The document's title and facts on one side, the business on the other. */
export function Heading({
  language,
  title,
  facts,
  business,
}: {
  language: Language;
  title: string;
  facts: [string, string][];
  business: BusinessDetails | null;
}) {
  const words = WORDS[language];
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="grid gap-1">
        <h2 className="text-xl font-semibold">{title}</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          {facts.map(([term, value]) => (
            <div key={term} className="contents">
              <dt className="text-neutral-600">{term}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {business ? (
        <div className="grid gap-0.5 text-end">
          <span className="font-medium">
            {language === "ar" ? business.legalNameAr : business.legalNameEn}
          </span>
          <span className="whitespace-pre-line text-neutral-600">
            {language === "ar" ? business.addressAr : business.addressEn}
          </span>
          <span>
            {words.taxNumber}: {business.taxNumber}
          </span>
          {business.commercialRegistry ? (
            <span>
              {words.registry}: {business.commercialRegistry}
            </span>
          ) : null}
          <span dir="ltr">{business.email}</span>
        </div>
      ) : (
        <p role="alert" className="max-w-xs text-red-700">
          {words.noProfile}
        </p>
      )}
    </header>
  );
}

export function Party({
  language,
  party,
}: {
  language: Language;
  party: PartyDetails;
}) {
  const words = WORDS[language];
  return (
    <section className="grid gap-0.5">
      <span className="text-neutral-600">{words.to}</span>
      <span className="font-medium">
        {language === "ar" && party.nameAr ? party.nameAr : party.name}
      </span>
      {party.address ? (
        <span className="whitespace-pre-line">{party.address}</span>
      ) : null}
      {party.taxNumber ? (
        <span>
          {words.taxNumber}: {party.taxNumber}
        </span>
      ) : null}
    </section>
  );
}

/** Each line after its discount, then the subtotal, VAT and total. */
export function Lines({
  language,
  currency,
  lines,
  vatPercent,
  vatName,
  totals,
}: {
  language: Language;
  currency: string;
  lines: readonly DocumentLine[];
  vatPercent: number;
  vatName: { en: string; ar: string } | null;
  totals: { subtotalMinor: number; vatMinor: number; totalMinor: number };
}) {
  const words = WORDS[language];
  const format = formatters(language, currency);
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-neutral-300 text-neutral-600">
          <th className="py-2 text-start font-medium">{words.item}</th>
          <th className="py-2 text-end font-medium">{words.quantity}</th>
          <th className="py-2 text-end font-medium">{words.unitPrice}</th>
          <th className="py-2 text-end font-medium">{words.discount}</th>
          <th className="py-2 text-end font-medium">{words.amount}</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => {
          const note = language === "ar" ? line.noteAr : line.noteEn;
          return (
            <tr key={line.key} className="border-b border-neutral-200">
              <td className="py-2">
                <span className="font-medium">
                  {language === "ar" ? line.nameAr : line.nameEn}
                </span>
                {note ? (
                  <span className="block text-xs text-neutral-600">{note}</span>
                ) : null}
              </td>
              <td className="py-2 text-end tabular-nums">
                {format.number(line.quantity)}
              </td>
              <td className="py-2 text-end tabular-nums">
                {format.money(line.unitPriceMinor)}
              </td>
              <td className="py-2 text-end tabular-nums">
                {line.discountPercent
                  ? `${format.number(line.discountPercent)}%`
                  : ""}
              </td>
              <td className="py-2 text-end tabular-nums">
                {format.money(netMinor(line))}
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={4} className="pt-3 text-end">
            {words.subtotal}
          </td>
          <td className="pt-3 text-end tabular-nums">
            {format.money(totals.subtotalMinor)}
          </td>
        </tr>
        <tr>
          <td colSpan={4} className="text-end">
            {vatName && vatPercent > 0
              ? `${language === "ar" ? vatName.ar : vatName.en} (${format.number(vatPercent)}%)`
              : words.noVat}
          </td>
          <td className="text-end tabular-nums">
            {format.money(totals.vatMinor)}
          </td>
        </tr>
        <tr className="font-semibold">
          <td colSpan={4} className="pt-1 text-end">
            {words.total}
          </td>
          <td className="pt-1 text-end tabular-nums">
            {format.money(totals.totalMinor)}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

export function Notes({
  language,
  notes,
}: {
  language: Language;
  notes: string | null;
}) {
  return notes ? (
    <section className="grid gap-1">
      <h3 className="font-medium">{WORDS[language].notes}</h3>
      <p className="whitespace-pre-line">{notes}</p>
    </section>
  ) : null;
}
