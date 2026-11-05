import type { BusinessProfileRow } from "@faridalms/database/business/profile";
import type { QuoteRow } from "@faridalms/database/business/quotes";
import type {
  BillingSchedule,
  PriceUnit,
} from "@faridalms/domain/subscriptions";

import { quoteReference, quoteTotals } from "@faridalms/domain/quotes";
import { formattingLocale } from "@faridalms/domain/school";

type Language = "en" | "ar";

/** What a customer reads, in each language the quote is printed in. */
const WORDS = {
  en: {
    title: "Quote",
    number: "Quote number",
    date: "Date",
    validUntil: "Valid until",
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
    term: "Term",
    billing: "Billing",
    instalment: (n: number) => `Instalment ${n}`,
    notes: "Notes",
    noProfile:
      "The business's legal details are not set: an owner sets them in Settings before a quote goes out.",
    termRange: (from: string, to: string) => `${from} to ${to}`,
  },
  ar: {
    title: "عرض سعر",
    number: "رقم العرض",
    date: "التاريخ",
    validUntil: "صالح حتى",
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
    term: "مدة العقد",
    billing: "الفوترة",
    instalment: (n: number) => `القسط ${n}`,
    notes: "ملاحظات",
    noProfile:
      "لم تُحدَّد البيانات القانونية للشركة بعد: يحددها المالك في الإعدادات قبل إرسال أي عرض.",
    termRange: (from: string, to: string) => `من ${from} إلى ${to}`,
  },
} as const;

const UNITS: Record<Language, Record<PriceUnit, string>> = {
  en: {
    student_year: "per student a year",
    school_year: "per school a year",
    once: "once",
  },
  ar: {
    student_year: "لكل طالب سنويًا",
    school_year: "لكل مدرسة سنويًا",
    once: "مرة واحدة",
  },
};

const SCHEDULES: Record<Language, Record<BillingSchedule, string>> = {
  en: {
    annual: "Annually in advance",
    two: "In two instalments",
    three: "In three instalments",
  },
  ar: {
    annual: "سنويًا مقدمًا",
    two: "على قسطين",
    three: "على ثلاثة أقساط",
  },
};

/**
 * A quote as the customer receives it, in English or Arabic: the business
 * and the customer, each line, the subtotal, VAT and total, the term and
 * its instalments. Printed from the browser, it is the PDF that is sent,
 * so it is shown as paper in either theme.
 */
export function QuoteDocument({
  quote,
  party,
  business,
  vatName,
  language,
}: {
  quote: QuoteRow;
  party: {
    name: string;
    nameAr: string | null;
    address: string | null;
    taxNumber: string | null;
  };
  business: BusinessProfileRow | null;
  vatName: { en: string; ar: string } | null;
  language: Language;
}) {
  const words = WORDS[language];
  const locale = formattingLocale(language, "latn");
  const money = (minor: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: quote.currency,
    }).format(minor / 100);
  const day = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
      dateStyle: "long",
      timeZone: "UTC",
    });
  const totals = quoteTotals({
    lines: quote.lines,
    vatPercent: Number(quote.vatPercent),
    schedule: quote.spec.schedule,
  });
  const notes = language === "ar" ? quote.spec.notesAr : quote.spec.notesEn;
  return (
    <article
      dir={language === "ar" ? "rtl" : "ltr"}
      lang={language}
      aria-label={`${words.title} ${quoteReference(quote.number, quote.version)}`}
      className="grid gap-6 rounded-lg border border-neutral-200 bg-white p-8 text-sm text-neutral-900 print:border-0 print:p-0"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h2 className="text-xl font-semibold">{words.title}</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
            <dt className="text-neutral-600">{words.number}</dt>
            <dd>{quoteReference(quote.number, quote.version)}</dd>
            <dt className="text-neutral-600">{words.date}</dt>
            <dd>{day(quote.createdAt.toISOString().slice(0, 10))}</dd>
            <dt className="text-neutral-600">{words.validUntil}</dt>
            <dd>{day(quote.validUntil)}</dd>
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

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-neutral-300 text-start text-neutral-600">
            <th className="py-2 text-start font-medium">{words.item}</th>
            <th className="py-2 text-end font-medium">{words.quantity}</th>
            <th className="py-2 text-end font-medium">{words.unitPrice}</th>
            <th className="py-2 text-end font-medium">{words.discount}</th>
            <th className="py-2 text-end font-medium">{words.amount}</th>
          </tr>
        </thead>
        <tbody>
          {totals.lines.map((line) => (
            <tr
              key={`${line.kind}-${line.versionId}`}
              className="border-b border-neutral-200"
            >
              <td className="py-2">
                <span className="font-medium">
                  {language === "ar" ? line.nameAr : line.nameEn}
                </span>
                {line.unit ? (
                  <span className="block text-xs text-neutral-600">
                    {UNITS[language][line.unit]}
                  </span>
                ) : null}
              </td>
              <td className="py-2 text-end tabular-nums">
                {line.quantity.toLocaleString(locale)}
              </td>
              <td className="py-2 text-end tabular-nums">
                {money(line.unitPriceMinor)}
              </td>
              <td className="py-2 text-end tabular-nums">
                {line.discountPercent
                  ? `${line.discountPercent.toLocaleString(locale)}%`
                  : ""}
              </td>
              <td className="py-2 text-end tabular-nums">
                {money(line.netMinor)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="pt-3 text-end">
              {words.subtotal}
            </td>
            <td className="pt-3 text-end tabular-nums">
              {money(totals.subtotalMinor)}
            </td>
          </tr>
          <tr>
            <td colSpan={4} className="text-end">
              {vatName && totals.vatPercent > 0
                ? `${language === "ar" ? vatName.ar : vatName.en} (${totals.vatPercent.toLocaleString(locale)}%)`
                : words.noVat}
            </td>
            <td className="text-end tabular-nums">{money(totals.vatMinor)}</td>
          </tr>
          <tr className="font-semibold">
            <td colSpan={4} className="pt-1 text-end">
              {words.total}
            </td>
            <td className="pt-1 text-end tabular-nums">
              {money(totals.totalMinor)}
            </td>
          </tr>
        </tfoot>
      </table>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-neutral-600">{words.term}</dt>
        <dd>
          {words.termRange(
            day(quote.spec.termStartsOn),
            day(quote.spec.termEndsOn),
          )}
        </dd>
        <dt className="text-neutral-600">{words.billing}</dt>
        <dd>
          {SCHEDULES[language][quote.spec.schedule]}
          {totals.instalmentsMinor.length > 1 ? (
            <ul className="mt-1 grid gap-0.5">
              {totals.instalmentsMinor.map((amount, index) => (
                <li key={`instalment-${index + 1}`} className="tabular-nums">
                  {words.instalment(index + 1)}: {money(amount)}
                </li>
              ))}
            </ul>
          ) : null}
        </dd>
      </dl>

      {notes ? (
        <section className="grid gap-1">
          <h3 className="font-medium">{words.notes}</h3>
          <p className="whitespace-pre-line">{notes}</p>
        </section>
      ) : null}
    </article>
  );
}
