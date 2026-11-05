import type { QuoteLine, QuoteSpec } from "@faridalms/domain/quotes";
import type {
  BillingSchedule,
  PriceUnit,
} from "@faridalms/domain/subscriptions";

import { quoteReference, quoteTotals } from "@faridalms/domain/quotes";

import type { BusinessDetails, Language, PartyDetails } from "./parts";

import { formatters, Heading, Lines, Notes, Paper, Party } from "./parts";

const WORDS = {
  en: {
    title: "Quote",
    number: "Quote number",
    date: "Date",
    validUntil: "Valid until",
    term: "Term",
    billing: "Billing",
    instalment: (n: number) => `Instalment ${n}`,
    termRange: (from: string, to: string) => `${from} to ${to}`,
  },
  ar: {
    title: "عرض سعر",
    number: "رقم العرض",
    date: "التاريخ",
    validUntil: "صالح حتى",
    term: "مدة العقد",
    billing: "الفوترة",
    instalment: (n: number) => `القسط ${n}`,
    termRange: (from: string, to: string) => `من ${from} إلى ${to}`,
  },
} as const;

export const UNITS: Record<Language, Record<PriceUnit, string>> = {
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

export const SCHEDULES: Record<Language, Record<BillingSchedule, string>> = {
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

/** What a quote document needs of the quote. */
export interface QuoteDocumentData {
  number: string;
  version: number;
  createdAt: Date | string;
  validUntil: string;
  currency: string;
  vatPercent: string | number;
  spec: QuoteSpec;
  lines: QuoteLine[];
}

/**
 * A quote as the customer receives it, in English or Arabic: the business
 * and the customer, each line, the subtotal, VAT and total, the term and
 * its instalments. Printed from the browser, it is the PDF that is sent.
 */
export function QuoteDocument({
  quote,
  party,
  business,
  vatName,
  language,
}: {
  quote: QuoteDocumentData;
  party: PartyDetails;
  business: BusinessDetails | null;
  vatName: { en: string; ar: string } | null;
  language: Language;
}) {
  const words = WORDS[language];
  const format = formatters(language, quote.currency);
  const totals = quoteTotals({
    lines: quote.lines,
    vatPercent: Number(quote.vatPercent),
    schedule: quote.spec.schedule,
  });
  const reference = quoteReference(quote.number, quote.version);
  return (
    <Paper language={language} label={`${words.title} ${reference}`}>
      <Heading
        language={language}
        title={words.title}
        business={business}
        facts={[
          [words.number, reference],
          [words.date, format.day(new Date(quote.createdAt).toISOString())],
          [words.validUntil, format.day(quote.validUntil)],
        ]}
      />
      <Party language={language} party={party} />
      <Lines
        language={language}
        currency={quote.currency}
        vatPercent={totals.vatPercent}
        vatName={vatName}
        totals={totals}
        lines={quote.lines.map((line) => ({
          key: `${line.kind}-${line.versionId}`,
          nameEn: line.nameEn,
          nameAr: line.nameAr,
          noteEn: line.unit ? UNITS.en[line.unit] : null,
          noteAr: line.unit ? UNITS.ar[line.unit] : null,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          discountPercent: line.discountPercent,
        }))}
      />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-neutral-600">{words.term}</dt>
        <dd>
          {words.termRange(
            format.day(quote.spec.termStartsOn),
            format.day(quote.spec.termEndsOn),
          )}
        </dd>
        <dt className="text-neutral-600">{words.billing}</dt>
        <dd>
          {SCHEDULES[language][quote.spec.schedule]}
          {totals.instalmentsMinor.length > 1 ? (
            <ul className="mt-1 grid gap-0.5">
              {totals.instalmentsMinor.map((amount, index) => (
                <li key={`instalment-${index + 1}`} className="tabular-nums">
                  {words.instalment(index + 1)}: {format.money(amount)}
                </li>
              ))}
            </ul>
          ) : null}
        </dd>
      </dl>
      <Notes
        language={language}
        notes={language === "ar" ? quote.spec.notesAr : quote.spec.notesEn}
      />
    </Paper>
  );
}
