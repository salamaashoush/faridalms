import type { InvoiceLine } from "@faridalms/domain/invoices";

import type { BusinessDetails, Language, PartyDetails } from "./parts";

import { formatters, Heading, Lines, Paper, Party } from "./parts";

const WORDS = {
  en: {
    invoice: "Invoice",
    draft: "Draft invoice",
    creditNote: "Credit note",
    number: "Number",
    issued: "Issued",
    due: "Due",
    purchaseOrder: "Purchase order",
    against: "Against invoice",
    reason: "Reason",
    period: (from: string, to: string) => `${from} to ${to}`,
    reverseCharge:
      "Reverse charge: the customer accounts for the VAT on this supply.",
    payTo: "Pay by bank transfer to",
    reference: "Give the invoice number as the transfer's reference.",
  },
  ar: {
    invoice: "فاتورة",
    draft: "مسودة فاتورة",
    creditNote: "إشعار دائن",
    number: "الرقم",
    issued: "تاريخ الإصدار",
    due: "تاريخ الاستحقاق",
    purchaseOrder: "أمر الشراء",
    against: "عن الفاتورة",
    reason: "السبب",
    period: (from: string, to: string) => `من ${from} إلى ${to}`,
    reverseCharge:
      "احتساب عكسي: يتولى العميل احتساب ضريبة القيمة المضافة على هذا التوريد.",
    payTo: "السداد بالتحويل البنكي إلى",
    reference: "اذكروا رقم الفاتورة مرجعًا للتحويل.",
  },
} as const;

/** What an invoice or credit note document needs of it. */
export interface InvoiceDocumentData {
  kind: "invoice" | "credit_note";
  /** Null for a draft, which has no number until it is issued. */
  number: string | null;
  issuedOn: string | null;
  dueOn: string | null;
  currency: string;
  purchaseOrder: string | null;
  vatPercent: string | number;
  reverseCharge: boolean;
  subtotalMinor: number;
  vatMinor: number;
  totalMinor: number;
  lines: InvoiceLine[];
  /** For a credit note: the invoice it credits, and why. */
  creditFor?: { number: string; reason: string };
}

/**
 * An invoice or credit note as the customer receives it, in English or
 * Arabic: the business and the customer, each line with the period it
 * covers, the subtotal, VAT and total, the reverse-charge wording where the
 * customer accounts for the VAT, and where to transfer the money.
 */
export function InvoiceDocument({
  document,
  party,
  business,
  vatName,
  language,
}: {
  document: InvoiceDocumentData;
  party: PartyDetails;
  business: BusinessDetails | null;
  vatName: { en: string; ar: string } | null;
  language: Language;
}) {
  const words = WORDS[language];
  const format = formatters(language, document.currency);
  const title =
    document.kind === "credit_note"
      ? words.creditNote
      : document.number
        ? words.invoice
        : words.draft;
  const facts = [
    document.number ? [words.number, document.number] : null,
    document.issuedOn ? [words.issued, format.day(document.issuedOn)] : null,
    document.dueOn ? [words.due, format.day(document.dueOn)] : null,
    document.purchaseOrder
      ? [words.purchaseOrder, document.purchaseOrder]
      : null,
    document.creditFor ? [words.against, document.creditFor.number] : null,
    document.creditFor ? [words.reason, document.creditFor.reason] : null,
  ].filter((fact): fact is [string, string] => fact !== null);
  const bank =
    language === "ar" ? business?.bankDetailsAr : business?.bankDetailsEn;
  return (
    <Paper
      language={language}
      label={document.number ? `${title} ${document.number}` : title}
    >
      <Heading
        language={language}
        title={title}
        facts={facts}
        business={business}
      />
      <Party language={language} party={party} />
      <Lines
        language={language}
        currency={document.currency}
        vatPercent={Number(document.vatPercent)}
        vatName={vatName}
        totals={document}
        lines={document.lines.map((line, index) => ({
          key: `line-${index}`,
          nameEn: line.descriptionEn,
          nameAr: line.descriptionAr,
          noteEn:
            line.periodStart && line.periodEnd
              ? WORDS.en.period(
                  formatters("en", document.currency).day(line.periodStart),
                  formatters("en", document.currency).day(line.periodEnd),
                )
              : null,
          noteAr:
            line.periodStart && line.periodEnd
              ? WORDS.ar.period(
                  formatters("ar", document.currency).day(line.periodStart),
                  formatters("ar", document.currency).day(line.periodEnd),
                )
              : null,
          quantity: line.quantity,
          unitPriceMinor: line.unitPriceMinor,
          discountPercent: line.discountPercent,
        }))}
      />
      {document.reverseCharge ? <p>{words.reverseCharge}</p> : null}
      {document.kind === "invoice" && bank ? (
        <section className="grid gap-1">
          <h3 className="font-medium">{words.payTo}</h3>
          <p className="whitespace-pre-line" dir="auto">
            {bank}
          </p>
          <p className="text-neutral-600">{words.reference}</p>
        </section>
      ) : null}
    </Paper>
  );
}
