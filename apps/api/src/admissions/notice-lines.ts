import type { NoticeParams } from "@faridalms/domain/notifications";

import { contribute } from "../core/extension";
import { noticeLines } from "../notifications/points";

type Line = (params: NoticeParams) => string;

const ENQUIRY_EN = {
  enquiry: "New enquiry",
  visit: "New visit request",
  general: "New message",
};
const ENQUIRY_AR = {
  enquiry: "استفسار جديد",
  visit: "طلب زيارة جديد",
  general: "رسالة جديدة",
};

/** What the school tells a family as their application moves, and the office of the family's answer. */
const OUTCOME_EN: Record<NonNullable<NoticeParams["outcome"]>, Line> = {
  offered: (p) =>
    `${p.title || p.titleAr || "Your child"} is offered a place${p.intakeName ? ` in ${p.intakeName}` : ""}. Please answer by ${p.until ?? "the date in the letter"}.`,
  waitlisted: (p) =>
    `${p.title || p.titleAr || "Your child"} is on the waiting list${p.intakeName ? ` for ${p.intakeName}` : ""}.`,
  declined_by_school: (p) =>
    `The school has written to you about the application for ${p.title || p.titleAr || "your child"}.`,
  enrolled: (p) =>
    `${p.title || p.titleAr || "Your child"} is enrolled${p.intakeName ? ` in ${p.intakeName}` : ""}. Welcome to the school.`,
  offer_expired: (p) =>
    `The offer of a place for ${p.title || p.titleAr || "your child"} has lapsed.`,
  deferred: (p) =>
    `The application for ${p.title || p.titleAr || "your child"} has moved to ${p.intakeName ?? "a later intake"}.`,
  accepted: (p) =>
    `${p.actorName || "The family"} accepted the offer for ${p.title || p.titleAr || "a child"}.`,
  offer_declined: (p) =>
    `${p.actorName || "The family"} declined the offer for ${p.title || p.titleAr || "a child"}.`,
};
const OUTCOME_AR: Record<NonNullable<NoticeParams["outcome"]>, Line> = {
  offered: (p) =>
    `عُرض على ${p.titleAr || p.title || "طفلكم"} مقعد${p.intakeNameAr || p.intakeName ? ` في ${p.intakeNameAr || p.intakeName}` : ""}، ونرجو الرد قبل ${p.until ?? "الموعد المذكور في الخطاب"}.`,
  waitlisted: (p) =>
    `أُدرج ${p.titleAr || p.title || "طفلكم"} في قائمة الانتظار${p.intakeNameAr || p.intakeName ? ` لـ${p.intakeNameAr || p.intakeName}` : ""}.`,
  declined_by_school: (p) =>
    `أرسلت إليكم المدرسة خطابًا بشأن طلب التحاق ${p.titleAr || p.title || "طفلكم"}.`,
  enrolled: (p) =>
    `أصبح ${p.titleAr || p.title || "طفلكم"} مقيدًا${p.intakeNameAr || p.intakeName ? ` في ${p.intakeNameAr || p.intakeName}` : ""}، مرحبًا بكم في المدرسة.`,
  offer_expired: (p) =>
    `انتهت مدة عرض المقعد المقدَّم لـ${p.titleAr || p.title || "طفلكم"}.`,
  deferred: (p) =>
    `نُقل طلب التحاق ${p.titleAr || p.title || "طفلكم"} إلى ${p.intakeNameAr || p.intakeName || "قبول لاحق"}.`,
  accepted: (p) =>
    `قبلت ${p.actorNameAr || p.actorName || "الأسرة"} عرض المقعد المقدَّم لـ${p.titleAr || p.title || "أحد الأطفال"}.`,
  offer_declined: (p) =>
    `اعتذرت ${p.actorNameAr || p.actorName || "الأسرة"} عن عرض المقعد المقدَّم لـ${p.titleAr || p.title || "أحد الأطفال"}.`,
};

const EVENT_EN = {
  tour: "Tour",
  assessment: "Assessment",
  interview: "Interview",
} as const;
const EVENT_AR = {
  tour: { a: "جولة", the: "الجولة", cancelled: "أُلغيت الجولة" },
  assessment: { a: "تقييم", the: "التقييم", cancelled: "أُلغي التقييم" },
  interview: { a: "مقابلة", the: "المقابلة", cancelled: "أُلغيت المقابلة" },
} as const;

/** Enquiries, applications and admission events, in an email or a text. */
export const ADMISSIONS_LINES = [
  contribute(noticeLines, {
    kind: "enquiry",
    en: (p) =>
      p.assigned
        ? `${p.actorName || "A colleague"} handed you the enquiry from ${p.title ?? "a family"}.`
        : `${ENQUIRY_EN[p.purpose ?? "enquiry"]} from ${p.title ?? "a family"}${p.preview ? `: ${p.preview}` : ""}`,
    ar: (p) =>
      p.assigned
        ? `أحال إليك ${p.actorName || "أحد الزملاء"} الاستفسار الوارد من ${p.title ?? "إحدى الأسر"}.`
        : `${ENQUIRY_AR[p.purpose ?? "enquiry"]} من ${p.title ?? "إحدى الأسر"}${p.preview ? `: ${p.preview}` : ""}`,
  }),
  contribute(noticeLines, {
    kind: "application",
    en: (p) =>
      p.outcome
        ? OUTCOME_EN[p.outcome](p)
        : p.received
          ? `We received the application for ${p.title || p.titleAr || "your child"}${p.intakeName ? ` to ${p.intakeName}` : ""}. Its number is ${p.reference ?? ""}.`
          : `New application for ${p.title || p.titleAr || "a child"}${p.intakeName ? ` to ${p.intakeName}` : ""}.`,
    ar: (p) =>
      p.outcome
        ? OUTCOME_AR[p.outcome](p)
        : p.received
          ? `وصلنا طلب التحاق ${p.titleAr || p.title || "طفلكم"}${p.intakeNameAr || p.intakeName ? ` بـ${p.intakeNameAr || p.intakeName}` : ""}، ورقمه ${p.reference ?? ""}.`
          : `طلب التحاق جديد لـ${p.titleAr || p.title || "أحد الأطفال"}${p.intakeNameAr || p.intakeName ? ` في ${p.intakeNameAr || p.intakeName}` : ""}.`,
  }),
  contribute(noticeLines, {
    kind: "admission_event",
    en: (p) => {
      const what = `${EVENT_EN[p.eventKind ?? "tour"]} with ${p.title || p.titleAr || "an applicant"}`;
      const when = `${p.date ?? ""}${p.startTime ? ` at ${p.startTime}` : ""}`;
      return p.cancelled
        ? `Called off: the ${what.charAt(0).toLowerCase()}${what.slice(1)} on ${when}.`
        : `${p.updated ? "Moved: " : ""}${what} on ${when}${p.location ? `, ${p.location}` : ""}.`;
    },
    ar: (p) => {
      const kind = EVENT_AR[p.eventKind ?? "tour"];
      const name = p.titleAr || p.title || "متقدّم";
      const when = `${p.date ?? ""}${p.startTime ? ` الساعة ${p.startTime}` : ""}`;
      if (p.cancelled) return `${kind.cancelled} مع ${name} يوم ${when}.`;
      const where = p.location ? `، ${p.location}` : "";
      return p.updated
        ? `تغيّر موعد ${kind.the} مع ${name}: يوم ${when}${where}.`
        : `${kind.a} مع ${name} يوم ${when}${where}.`;
    },
  }),
];
