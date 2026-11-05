import type { Language } from "@faridalms/documents/parts";
import type { DunningStep } from "@faridalms/domain/dunning";
import type { OutboundMessage } from "@faridalms/mail/providers";

import { formatters } from "@faridalms/documents/parts";

interface Facts {
  number: string;
  /** The customer's legal name, as the invoice addresses it. */
  name: string;
  /** How long overdue, counted as the language counts days. */
  days: string;
  due: string;
  owed: string;
  total: string;
  /** For a notice: the last day to pay before the change. */
  by: string;
}

const WORDS = {
  en: {
    subject: {
      upcoming: (f: Facts) => `Invoice ${f.number} falls due on ${f.due}`,
      due: (f: Facts) => `Invoice ${f.number} falls due today`,
      overdue_7: (f: Facts) => `Invoice ${f.number} is overdue`,
      overdue_14: (f: Facts) => `Invoice ${f.number} is overdue`,
      restrict_notice: (f: Facts) =>
        `Invoice ${f.number}: your school's access will be restricted`,
      restricted: (f: Facts) =>
        `Invoice ${f.number}: your school's access is restricted`,
      read_only_notice: (f: Facts) =>
        `Invoice ${f.number}: your school will become read-only`,
      read_only: (f: Facts) => `Invoice ${f.number}: your school is read-only`,
      suspend_notice: (f: Facts) =>
        `Invoice ${f.number}: your school will be suspended`,
      suspended: (f: Facts) => `Invoice ${f.number}: your school is suspended`,
      ended: (f: Facts) => `Invoice ${f.number}: the contract has ended`,
    } satisfies Record<DunningStep, (f: Facts) => string>,
    lead: {
      upcoming: (f: Facts) =>
        `This is a reminder that invoice ${f.number} falls due on ${f.due}.`,
      due: (f: Facts) => `Invoice ${f.number} falls due today.`,
      overdue_7: (f: Facts) =>
        `Invoice ${f.number} fell due on ${f.due} and is now ${f.days} overdue.`,
      overdue_14: (f: Facts) =>
        `Invoice ${f.number} fell due on ${f.due} and is now ${f.days} overdue. If a purchase order or an approval is holding it up, reply and tell us: we can pause these reminders meanwhile.`,
      restrict_notice: (f: Facts) =>
        `Invoice ${f.number} is ${f.days} overdue. Unless it is paid by ${f.by}, your school will no longer be able to add modules, custom domains or text-message credit, from the start of its next weekend. Everything it already uses keeps working.`,
      restricted: (f: Facts) =>
        `Invoice ${f.number} is ${f.days} overdue, so your school can no longer add modules, custom domains or text-message credit. Everything it already uses keeps working, and paying the invoice lifts this at once.`,
      read_only_notice: (f: Facts) =>
        `Invoice ${f.number} is ${f.days} overdue. Unless it is paid by ${f.by}, your school will become read-only from the start of its next weekend: everyone can still sign in and see their work, but nothing new can be added. Administrators can still export the school's data.`,
      read_only: (f: Facts) =>
        `Invoice ${f.number} is ${f.days} overdue, so your school is now read-only: everyone can still sign in and see their work, but nothing new can be added. Paying the invoice restores full access at once.`,
      suspend_notice: (f: Facts) =>
        `Invoice ${f.number} is ${f.days} overdue. Unless it is paid by ${f.by}, your school will be suspended from the start of its next weekend, and nobody will be able to sign in.`,
      suspended: (f: Facts) =>
        `Invoice ${f.number} is ${f.days} overdue, so your school is suspended and nobody can sign in. Paying the invoice restores access at once.`,
      ended: (f: Facts) =>
        `Invoice ${f.number} is ${f.days} overdue, and the contract has ended for non-payment. Contact us to settle the invoice or to take a copy of your school's data before it is deleted.`,
    } satisfies Record<DunningStep, (f: Facts) => string>,
    greeting: (f: Facts) => `Dear ${f.name},`,
    owed: (f: Facts) => `Amount owed: ${f.owed} of ${f.total}.`,
    card: (url: string) => `Pay by card: ${url}`,
    bank: "Or pay by bank transfer to:",
    reference: "Give the invoice number as the transfer's reference.",
    paid: "If you have already paid, thank you: reply with the transfer's reference and we will match it.",
  },
  ar: {
    subject: {
      upcoming: (f: Facts) => `تستحق الفاتورة ${f.number} في ${f.due}`,
      due: (f: Facts) => `تستحق الفاتورة ${f.number} اليوم`,
      overdue_7: (f: Facts) => `تأخر سداد الفاتورة ${f.number}`,
      overdue_14: (f: Facts) => `تأخر سداد الفاتورة ${f.number}`,
      restrict_notice: (f: Facts) => `الفاتورة ${f.number}: سيُقيَّد وصول مدرستكم`,
      restricted: (f: Facts) => `الفاتورة ${f.number}: قُيِّد وصول مدرستكم`,
      read_only_notice: (f: Facts) =>
        `الفاتورة ${f.number}: ستصبح مدرستكم للقراءة فقط`,
      read_only: (f: Facts) =>
        `الفاتورة ${f.number}: أصبحت مدرستكم للقراءة فقط`,
      suspend_notice: (f: Facts) => `الفاتورة ${f.number}: سيُعلَّق حساب مدرستكم`,
      suspended: (f: Facts) => `الفاتورة ${f.number}: عُلِّق حساب مدرستكم`,
      ended: (f: Facts) => `الفاتورة ${f.number}: انتهى العقد`,
    } satisfies Record<DunningStep, (f: Facts) => string>,
    lead: {
      upcoming: (f: Facts) =>
        `نذكّركم بأن الفاتورة ${f.number} تستحق السداد في ${f.due}.`,
      due: (f: Facts) => `تستحق الفاتورة ${f.number} السداد اليوم.`,
      overdue_7: (f: Facts) =>
        `استحقت الفاتورة ${f.number} في ${f.due}، وقد مضى على موعد سدادها ${f.days}.`,
      overdue_14: (f: Facts) =>
        `استحقت الفاتورة ${f.number} في ${f.due}، وقد مضى على موعد سدادها ${f.days}. إن كان السداد ينتظر أمر شراء أو موافقة، فأخبرونا بالرد على هذه الرسالة لنوقف التذكيرات حتى ذلك الحين.`,
      restrict_notice: (f: Facts) =>
        `مضى على موعد سداد الفاتورة ${f.number} ${f.days}. إن لم تُسدَّد قبل ${f.by}، فلن تتمكن مدرستكم من إضافة وحدات أو نطاقات خاصة أو رصيد رسائل نصية، بدءًا من أول عطلتها الأسبوعية التالية. ويستمر عمل كل ما تستخدمه الآن.`,
      restricted: (f: Facts) =>
        `مضى على موعد سداد الفاتورة ${f.number} ${f.days}، فلم يعد بإمكان مدرستكم إضافة وحدات أو نطاقات خاصة أو رصيد رسائل نصية. ويستمر عمل كل ما تستخدمه الآن، ويُرفع هذا القيد فور سداد الفاتورة.`,
      read_only_notice: (f: Facts) =>
        `مضى على موعد سداد الفاتورة ${f.number} ${f.days}. إن لم تُسدَّد قبل ${f.by}، فستصبح مدرستكم للقراءة فقط بدءًا من أول عطلتها الأسبوعية التالية: يظل بإمكان الجميع تسجيل الدخول والاطلاع على أعمالهم، لكن لا يمكن إضافة شيء جديد. ويظل بإمكان المسؤولين تصدير بيانات المدرسة.`,
      read_only: (f: Facts) =>
        `مضى على موعد سداد الفاتورة ${f.number} ${f.days}، فأصبحت مدرستكم للقراءة فقط: يظل بإمكان الجميع تسجيل الدخول والاطلاع على أعمالهم، لكن لا يمكن إضافة شيء جديد. ويعود الوصول الكامل فور سداد الفاتورة.`,
      suspend_notice: (f: Facts) =>
        `مضى على موعد سداد الفاتورة ${f.number} ${f.days}. إن لم تُسدَّد قبل ${f.by}، فسيُعلَّق حساب مدرستكم بدءًا من أول عطلتها الأسبوعية التالية، ولن يتمكن أحد من تسجيل الدخول.`,
      suspended: (f: Facts) =>
        `مضى على موعد سداد الفاتورة ${f.number} ${f.days}، فعُلِّق حساب مدرستكم ولا يمكن لأحد تسجيل الدخول. ويعود الوصول فور سداد الفاتورة.`,
      ended: (f: Facts) =>
        `مضى على موعد سداد الفاتورة ${f.number} ${f.days}، وانتهى العقد لعدم السداد. تواصلوا معنا لسداد الفاتورة أو للحصول على نسخة من بيانات مدرستكم قبل حذفها.`,
    } satisfies Record<DunningStep, (f: Facts) => string>,
    greeting: (f: Facts) => `السادة ${f.name}،`,
    owed: (f: Facts) => `المبلغ المستحق: ${f.owed} من أصل ${f.total}.`,
    card: (url: string) => `السداد بالبطاقة: ${url}`,
    bank: "أو السداد بالتحويل البنكي إلى:",
    reference: "اذكروا رقم الفاتورة مرجعًا للتحويل.",
    paid: "إن كنتم قد سددتم بالفعل فشكرًا لكم، ونرجو الرد برقم مرجع التحويل لنطابقه.",
  },
} as const;

const AR_DAYS: Record<Intl.LDMLPluralRule, (count: string) => string> = {
  zero: (count) => `${count} يوم`,
  one: () => "يوم واحد",
  two: () => "يومان",
  few: (count) => `${count} أيام`,
  many: (count) => `${count} يومًا`,
  other: (count) => `${count} يوم`,
};

function dayCount(language: Language, days: number, written: string) {
  if (language === "ar")
    return AR_DAYS[new Intl.PluralRules("ar").select(days)](written);
  return days === 1 ? "1 day" : `${written} days`;
}

/**
 * The email a step of the clock sends a customer's billing contacts, in the
 * invoice's language: what is owed and since when, what happens next and
 * by when, and how to pay.
 */
export function dunningEmail(input: {
  step: DunningStep;
  language: Language;
  to: string;
  invoice: {
    number: string;
    currency: string;
    dueOn: string;
    totalMinor: number;
    owedMinor: number;
    paymentLinkUrl: string | null;
  };
  customer: { nameEn: string; nameAr: string | null };
  days: number;
  /** For a notice: the last day to pay before the change. */
  by: string | null;
  business: {
    name: string;
    email: string;
    bankDetails: string | null;
  };
}): OutboundMessage {
  const words = WORDS[input.language];
  const format = formatters(input.language, input.invoice.currency);
  const facts: Facts = {
    number: input.invoice.number,
    name:
      input.language === "ar"
        ? (input.customer.nameAr ?? input.customer.nameEn)
        : input.customer.nameEn,
    days: dayCount(input.language, input.days, format.number(input.days)),
    due: format.day(input.invoice.dueOn),
    owed: format.money(input.invoice.owedMinor),
    total: format.money(input.invoice.totalMinor),
    by: input.by ? format.day(input.by) : "",
  };
  const text = [
    words.greeting(facts),
    words.lead[input.step](facts),
    words.owed(facts),
    input.invoice.paymentLinkUrl
      ? words.card(input.invoice.paymentLinkUrl)
      : null,
    input.business.bankDetails
      ? [words.bank, input.business.bankDetails, words.reference].join("\n")
      : null,
    words.paid,
    input.business.name,
  ]
    .filter((part) => part !== null)
    .join("\n\n");
  return {
    to: input.to,
    subject: words.subject[input.step](facts),
    text,
    fromName: input.business.name,
    replyTo: input.business.email,
    reference: `dunning/${input.invoice.number}/${input.step}/${input.to}`,
  };
}
