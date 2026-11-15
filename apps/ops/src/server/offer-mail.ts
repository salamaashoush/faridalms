import type { Language } from "@faridalms/documents/parts";
import type { OutboundMessage } from "@faridalms/mail/providers";

import { formatters } from "@faridalms/documents/parts";

interface OfferFacts {
  /** Who it is written to. */
  name: string;
  business: string;
  reference: string;
  total: string;
  validUntil: string;
  link: string;
  school: string | null;
}

interface AgreementFacts {
  name: string;
  business: string;
  customer: string;
  link: string;
  agreements: string;
}

interface AcceptedFacts {
  name: string;
  business: string;
  reference: string;
  customer: string;
  administrator: string | null;
}

const WORDS = {
  en: {
    offer: {
      subject: (f: OfferFacts) =>
        `Your quote ${f.reference} from ${f.business}`,
      lead: (f: OfferFacts) =>
        `Thank you for your interest. Quote ${f.reference} comes to ${f.total} and stands until ${f.validUntil}.`,
      school: (f: OfferFacts) =>
        f.school
          ? `Accepting it sets up ${f.school} at once, and its first administrator receives a link to sign in.`
          : null,
      act: (f: OfferFacts) =>
        `Read the quote, the terms of service and the data processing agreement, and accept them, here:\n${f.link}`,
      close: "If anything in it should change, reply to this email.",
    },
    agreements: {
      subject: (f: AgreementFacts) =>
        `Please accept ${f.business}'s ${f.agreements}`,
      lead: (f: AgreementFacts) =>
        `To hold ${f.customer}'s school data we need its acceptance of our ${f.agreements}.`,
      act: (f: AgreementFacts) => `Read and accept them here:\n${f.link}`,
      close: "If you have a question about them, reply to this email.",
    },
    accepted: {
      subject: (f: AcceptedFacts) => `${f.reference} accepted, thank you`,
      lead: (f: AcceptedFacts) =>
        `Thank you. We have ${f.customer}'s acceptance of quote ${f.reference}, our terms of service and our data processing agreement.`,
      administrator: (f: AcceptedFacts) =>
        f.administrator
          ? `Your school is being set up now. ${f.administrator} will receive an email with a link to sign in.`
          : null,
      close: "Reply to this email with any question.",
    },
    agreementsAccepted: {
      subject: (f: AgreementFacts) => `${f.agreements} accepted, thank you`,
      lead: (f: AgreementFacts) =>
        `Thank you. We have ${f.customer}'s acceptance of our ${f.agreements}.`,
    },
    greeting: (name: string) => `Dear ${name},`,
    and: " and ",
  },
  ar: {
    offer: {
      subject: (f: OfferFacts) => `عرض السعر ${f.reference} من ${f.business}`,
      lead: (f: OfferFacts) =>
        `شكرًا لاهتمامكم. يبلغ عرض السعر ${f.reference} ${f.total}، وهو سارٍ حتى ${f.validUntil}.`,
      school: (f: OfferFacts) =>
        f.school
          ? `بقبوله تُنشأ ${f.school} فورًا، ويصل إلى مسؤولها الأول رابط لتسجيل الدخول.`
          : null,
      act: (f: OfferFacts) =>
        `اقرأوا عرض السعر وشروط الخدمة واتفاقية معالجة البيانات واقبلوها من هنا:\n${f.link}`,
      close: "إن كان فيه ما ينبغي تغييره، فردّوا على هذه الرسالة.",
    },
    agreements: {
      subject: (f: AgreementFacts) =>
        `يرجى قبول ${f.agreements} لدى ${f.business}`,
      lead: (f: AgreementFacts) =>
        `نحتاج إلى قبول ${f.customer} ${f.agreements} لنحفظ بيانات مدرستها.`,
      act: (f: AgreementFacts) => `اقرأوها واقبلوها من هنا:\n${f.link}`,
      close: "إن كان لديكم سؤال عنها، فردّوا على هذه الرسالة.",
    },
    accepted: {
      subject: (f: AcceptedFacts) => `تم قبول ${f.reference}، شكرًا لكم`,
      lead: (f: AcceptedFacts) =>
        `شكرًا لكم. وصلنا قبول ${f.customer} عرض السعر ${f.reference} وشروط الخدمة واتفاقية معالجة البيانات.`,
      administrator: (f: AcceptedFacts) =>
        f.administrator
          ? `تُنشأ مدرستكم الآن، وستصل إلى ${f.administrator} رسالة فيها رابط لتسجيل الدخول.`
          : null,
      close: "ردّوا على هذه الرسالة بأي سؤال.",
    },
    agreementsAccepted: {
      subject: (f: AgreementFacts) => `تم قبول ${f.agreements}، شكرًا لكم`,
      lead: (f: AgreementFacts) =>
        `شكرًا لكم. وصلنا قبول ${f.customer} ${f.agreements}.`,
    },
    greeting: (name: string) => `مرحبًا ${name}،`,
    and: " و",
  },
} as const;

interface Sender {
  name: string;
  email: string;
}

const lines = (parts: (string | null)[]) =>
  parts.filter((part) => part !== null).join("\n\n");

/** The offer a quote is sent as: what it comes to, until when, and its link. */
export function offerEmail(input: {
  language: Language;
  to: { name: string; email: string };
  reference: string;
  currency: string;
  totalMinor: number;
  validUntil: string;
  link: string;
  school: string | null;
  business: Sender;
}): OutboundMessage {
  const words = WORDS[input.language];
  const format = formatters(input.language, input.currency);
  const facts: OfferFacts = {
    name: input.to.name,
    business: input.business.name,
    reference: input.reference,
    total: format.money(input.totalMinor),
    validUntil: format.day(input.validUntil),
    link: input.link,
    school: input.school,
  };
  return {
    to: input.to.email,
    subject: words.offer.subject(facts),
    text: lines([
      words.greeting(input.to.name),
      words.offer.lead(facts),
      words.offer.school(facts),
      words.offer.act(facts),
      words.offer.close,
      input.business.name,
    ]),
    fromName: input.business.name,
    replyTo: input.business.email,
    reference: `offer/${input.reference}/${input.link}`,
  };
}

/** A request to a customer's contact to accept the agreements in force. */
export function agreementsEmail(input: {
  language: Language;
  to: { name: string; email: string };
  customer: string;
  agreements: string[];
  link: string;
  business: Sender;
}): OutboundMessage {
  const words = WORDS[input.language];
  const facts: AgreementFacts = {
    name: input.to.name,
    business: input.business.name,
    customer: input.customer,
    link: input.link,
    agreements: input.agreements.join(words.and),
  };
  return {
    to: input.to.email,
    subject: words.agreements.subject(facts),
    text: lines([
      words.greeting(input.to.name),
      words.agreements.lead(facts),
      words.agreements.act(facts),
      words.agreements.close,
      input.business.name,
    ]),
    fromName: input.business.name,
    replyTo: input.business.email,
    reference: `agreements/${input.link}/${input.to.email}`,
  };
}

/** What the person who accepted an offer is sent: that it arrived, and what follows. */
export function offerAcceptedEmail(input: {
  language: Language;
  to: { name: string; email: string };
  reference: string;
  customer: string;
  administrator: string | null;
  business: Sender;
}): OutboundMessage {
  const words = WORDS[input.language];
  const facts: AcceptedFacts = {
    name: input.to.name,
    business: input.business.name,
    reference: input.reference,
    customer: input.customer,
    administrator: input.administrator,
  };
  return {
    to: input.to.email,
    subject: words.accepted.subject(facts),
    text: lines([
      words.greeting(input.to.name),
      words.accepted.lead(facts),
      words.accepted.administrator(facts),
      words.accepted.close,
      input.business.name,
    ]),
    fromName: input.business.name,
    replyTo: input.business.email,
    reference: `offer-accepted/${input.reference}`,
  };
}

/** What a contact who accepted the agreements is sent. */
export function agreementsAcceptedEmail(input: {
  language: Language;
  to: { name: string; email: string };
  customer: string;
  agreements: string[];
  business: Sender;
}): OutboundMessage {
  const words = WORDS[input.language];
  const facts: AgreementFacts = {
    name: input.to.name,
    business: input.business.name,
    customer: input.customer,
    link: "",
    agreements: input.agreements.join(words.and),
  };
  return {
    to: input.to.email,
    subject: words.agreementsAccepted.subject(facts),
    text: lines([
      words.greeting(input.to.name),
      words.agreementsAccepted.lead(facts),
      input.business.name,
    ]),
    fromName: input.business.name,
    replyTo: input.business.email,
    reference: `agreements-accepted/${input.customer}/${input.to.email}`,
  };
}
