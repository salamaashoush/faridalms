import type { ContentDocument } from "@faridalms/domain/content";
import type {
  NoticeParams,
  NotificationKind,
} from "@faridalms/domain/notifications";
import type { Digits } from "@faridalms/domain/people";

import { contentHtml } from "@faridalms/domain/content-html";
import { REPLY_MARKER } from "@faridalms/domain/email-replies";
import { formatDayIn, formattingLocale } from "@faridalms/domain/school";

export interface Rendered {
  subject: string;
  text: string;
}

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const KEPT_AT_SCHOOL = {
  en: (names: string) =>
    `Too large to send by email, kept by the school: ${names}`,
  ar: (names: string) =>
    `ملفات أكبر من أن تُرسل بالبريد، تحتفظ بها المدرسة: ${names}`,
};

/**
 * A message of a conversation as an email to someone without an account:
 * all its words rather than a notice to sign in, under the conversation's
 * subject, signed with the school's name. When replies come back into the
 * conversation, a line at the top says where to write, and everything
 * from it down is what a reply quotes.
 */
export function conversationMessage(input: {
  locale: "en" | "ar";
  school: string;
  subject: string;
  text: string;
  content: ContentDocument | null;
  repliesReturn: boolean;
  /** Files too large to attach, named so the family can ask for them. */
  keptBack: readonly string[];
}): Rendered & { html: string } {
  const dir = input.locale === "ar" ? "rtl" : "ltr";
  const marker = input.repliesReturn ? REPLY_MARKER[input.locale] : "";
  const kept = input.keptBack.length
    ? KEPT_AT_SCHOOL[input.locale](input.keptBack.join(", "))
    : "";
  const words = input.content
    ? contentHtml(input.content, { fileHref: () => null })
    : `<p>${escapeHtml(input.text).replaceAll("\n", "<br>")}</p>`;
  return {
    subject: input.subject,
    text: [marker, input.text, kept, `-- \n${input.school}`]
      .filter(Boolean)
      .join("\n\n"),
    html: [
      `<div dir="${dir}" lang="${input.locale}">`,
      marker ? `<p style="color:#6b7280">${escapeHtml(marker)}</p>` : "",
      words,
      kept ? `<p style="color:#6b7280">${escapeHtml(kept)}</p>` : "",
      `<p style="color:#6b7280">${escapeHtml(input.school)}</p>`,
      "</div>",
    ].join(""),
  };
}

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

/** One line per notice in the reader's language; the app writes its own from the same params. */
const LINES: Record<"en" | "ar", Record<NotificationKind, Line>> = {
  en: {
    announcement: (p) =>
      `${p.updated ? "Updated" : "Announcement"}: ${p.title ?? ""}${p.preview ? `. ${p.preview}` : ""}`,
    urgent: (p) =>
      `Urgent: ${p.title ?? ""}${p.preview ? `. ${p.preview}` : ""}`,
    news: (p) => `News: ${p.title ?? ""}${p.preview ? `. ${p.preview}` : ""}`,
    message: (p) =>
      `New message from ${p.actorName ?? "the school"}${p.preview ? `: ${p.preview}` : ""}`,
    absence: (p) =>
      p.report
        ? `The school ${p.report === "accepted" ? "accepted" : "declined"} your report for ${p.studentName ?? "your child"} from ${p.date ?? "today"}.`
        : `${p.studentName ?? "Your child"} was marked absent on ${p.date ?? "today"}${p.className ? ` (${p.className})` : ""}.`,
    event: (p) =>
      p.cancelled
        ? `Cancelled: ${p.title ?? ""}${p.date ? ` on ${p.date}` : ""}`
        : `${p.updated ? "Event changed" : "Event"}: ${p.title ?? ""}${p.date ? ` on ${p.date}` : ""}`,
    reminder: (p) =>
      p.cover
        ? p.cancelled
          ? `You no longer cover ${p.className ?? "a lesson"} on ${p.date ?? "today"}${p.periodName ? `, ${p.periodName}` : ""}.`
          : `You cover ${p.className ?? "a lesson"} on ${p.date ?? "today"}${p.periodName ? `, ${p.periodName}` : ""}.`
        : `Reminder: the register for ${p.className ?? "your class"} on ${p.date ?? "today"} is not taken yet.`,
    consent: (p) =>
      `The school asks for your permission: ${p.title ?? ""}${p.studentName ? ` (${p.studentName})` : ""}.`,
    mention: (p) =>
      `${p.actorName || "Someone at school"} mentioned you in ${p.title ?? "a document"}.`,
    library: (p) =>
      p.shared
        ? `${p.title ?? "Your piece"} is now in the school library.`
        : `${p.actorName || "A reviewer"} sent ${p.title ?? "your piece"} back with a note.`,
    reply: (p) =>
      `${p.actorName || "Someone in your class"} replied to your post in ${p.title ?? "a discussion"}.`,
    enquiry: (p) =>
      p.assigned
        ? `${p.actorName || "A colleague"} handed you the enquiry from ${p.title ?? "a family"}.`
        : `${ENQUIRY_EN[p.purpose ?? "enquiry"]} from ${p.title ?? "a family"}${p.preview ? `: ${p.preview}` : ""}`,
    application: (p) =>
      p.received
        ? `We received the application for ${p.title || p.titleAr || "your child"}${p.gradeName ? ` to ${p.gradeName}` : ""}. Its number is ${p.reference ?? ""}.`
        : `New application for ${p.title || p.titleAr || "a child"}${p.gradeName ? ` to ${p.gradeName}` : ""}.`,
  },
  ar: {
    announcement: (p) =>
      `${p.updated ? "تحديث" : "إعلان"}: ${p.titleAr || p.title || ""}${p.preview ? `. ${p.preview}` : ""}`,
    urgent: (p) =>
      `عاجل: ${p.titleAr || p.title || ""}${p.preview ? `. ${p.preview}` : ""}`,
    news: (p) =>
      `خبر جديد: ${p.titleAr || p.title || ""}${p.preview ? `. ${p.preview}` : ""}`,
    message: (p) =>
      `رسالة جديدة من ${p.actorName ?? "المدرسة"}${p.preview ? `: ${p.preview}` : ""}`,
    absence: (p) =>
      p.report
        ? `${p.report === "accepted" ? "قبلت" : "رفضت"} المدرسة بلاغك عن ${p.studentName ?? "طفلك"} بدءًا من ${p.date ?? "اليوم"}.`
        : `سُجّل غياب ${p.studentName ?? "طفلك"} يوم ${p.date ?? "اليوم"}${p.className ? ` (${p.className})` : ""}.`,
    event: (p) =>
      p.cancelled
        ? `أُلغيت: ${p.title ?? ""}${p.date ? ` يوم ${p.date}` : ""}`
        : `${p.updated ? "تغيّرت فعالية" : "فعالية"}: ${p.title ?? ""}${p.date ? ` يوم ${p.date}` : ""}`,
    reminder: (p) =>
      p.cover
        ? p.cancelled
          ? `لم تعد تغطي ${p.className ?? "حصة"} يوم ${p.date ?? "اليوم"}${p.periodName ? `، ${p.periodName}` : ""}.`
          : `تغطي ${p.className ?? "حصة"} يوم ${p.date ?? "اليوم"}${p.periodName ? `، ${p.periodName}` : ""}.`
        : `تذكير: لم يُسجَّل حضور ${p.className ?? "فصلك"} يوم ${p.date ?? "اليوم"} بعد.`,
    consent: (p) =>
      `تطلب المدرسة موافقتك: ${p.title ?? ""}${p.studentName ? ` (${p.studentName})` : ""}.`,
    mention: (p) =>
      `ذكرك ${p.actorName || "أحد أفراد المدرسة"} في ${p.titleAr || p.title || "مستند"}.`,
    library: (p) =>
      p.shared
        ? `أصبح ${p.title ?? "ما شاركته"} في مكتبة المدرسة.`
        : `أعاد ${p.actorNameAr || p.actorName || "المراجع"} ${p.title ?? "ما شاركته"} إليك مع ملاحظة.`,
    reply: (p) =>
      `ردّ ${p.actorNameAr || p.actorName || "أحد زملائك"} على مشاركتك في ${p.title ?? "النقاش"}.`,
    enquiry: (p) =>
      p.assigned
        ? `أحال إليك ${p.actorName || "أحد الزملاء"} الاستفسار الوارد من ${p.title ?? "إحدى الأسر"}.`
        : `${ENQUIRY_AR[p.purpose ?? "enquiry"]} من ${p.title ?? "إحدى الأسر"}${p.preview ? `: ${p.preview}` : ""}`,
    application: (p) =>
      p.received
        ? `وصلنا طلب التحاق ${p.titleAr || p.title || "طفلكم"}${p.gradeNameAr || p.gradeName ? ` بـ${p.gradeNameAr || p.gradeName}` : ""}، ورقمه ${p.reference ?? ""}.`
        : `طلب التحاق جديد لـ${p.titleAr || p.title || "أحد الأطفال"}${p.gradeNameAr || p.gradeName ? ` في ${p.gradeNameAr || p.gradeName}` : ""}.`,
  },
};

const SIGN_IN = {
  en: "Sign in to the school app to read more.",
  ar: "سجّل الدخول إلى تطبيق المدرسة لقراءة المزيد.",
};

const DIGEST = {
  en: (count: number) => `${count} updates from school`,
  ar: (count: number) => `${count} تحديثات من المدرسة`,
};

/**
 * Each reader gets the names in their own language where both were given,
 * and the day written as the school writes dates in that language.
 */
function paramsOf(
  locale: "en" | "ar",
  digits: Digits,
  value: NoticeParams,
): NoticeParams {
  const pick = (en?: string, ar?: string) =>
    (locale === "ar" ? ar || en : en || ar) || undefined;
  return {
    ...value,
    title: pick(value.title, value.titleAr),
    actorName: pick(value.actorName, value.actorNameAr),
    studentName: pick(value.studentName, value.studentNameAr),
    className: pick(value.className, value.classNameAr),
    periodName: pick(value.periodName, value.periodNameAr),
    date: value.date
      ? formatDayIn(value.date, "full", formattingLocale(locale, digits))
      : undefined,
  };
}

export function lineFor(
  locale: "en" | "ar",
  digits: Digits,
  kind: NotificationKind,
  params: NoticeParams,
): string {
  return LINES[locale][kind](paramsOf(locale, digits, params));
}

/**
 * One message for what is due for a person on a channel: a single notice as
 * itself, several as a digest listing each line. Texts stay one line.
 */
export function render(input: {
  locale: "en" | "ar";
  digits: Digits;
  channel: "email" | "sms";
  school: string;
  items: readonly { kind: NotificationKind; params: NoticeParams }[];
}): Rendered {
  const lines = input.items.map((item) =>
    lineFor(input.locale, input.digits, item.kind, item.params),
  );
  const [first] = lines;
  if (input.channel === "sms")
    return {
      subject: input.school,
      text:
        lines.length === 1
          ? `${input.school}: ${first ?? ""}`
          : `${input.school}: ${DIGEST[input.locale](lines.length)}`,
    };
  if (lines.length === 1)
    return {
      subject: `${input.school}: ${first ?? ""}`,
      text: `${first ?? ""}\n\n${SIGN_IN[input.locale]}`,
    };
  return {
    subject: `${input.school}: ${DIGEST[input.locale](lines.length)}`,
    text: `${lines.map((line) => `- ${line}`).join("\n")}\n\n${SIGN_IN[input.locale]}`,
  };
}

/**
 * The email that lets a guardian choose their child's password. It carries
 * the one link that does it, so it is written to be kept to the family and
 * to say when the link stops working.
 */
export function inviteMessage(input: {
  locale: "en" | "ar";
  school: string;
  student: string;
  loginName: string;
  link: string;
  days: number;
}): Rendered {
  return input.locale === "ar"
    ? {
        subject: `${input.school}: اختر كلمة مرور ${input.student}`,
        text: [
          `فتحت المدرسة حساب دخول لـ ${input.student} في تطبيقها.`,
          `اسم الدخول: ${input.loginName}`,
          `اختر كلمة المرور من هذا الرابط، وهو يعمل مرة واحدة خلال ${input.days} أيام:`,
          input.link,
          "هذا الرابط لأسرتكم فقط، فلا ترسلوه إلى أحد. إن لم تنتظروا هذه الرسالة فأبلغوا مكتب المدرسة.",
        ].join("\n\n"),
      }
    : {
        subject: `${input.school}: choose ${input.student}'s password`,
        text: [
          `The school has opened a sign-in for ${input.student} in its app.`,
          `Sign-in name: ${input.loginName}`,
          `Choose the password from this link, which works once, within ${input.days} days:`,
          input.link,
          "The link is for your family only, so please do not forward it. If you did not expect this email, tell the school office.",
        ].join("\n\n"),
      };
}

/**
 * The email that lets an adult the office added choose their own password,
 * instead of being handed one the office typed.
 */
export function adultInviteMessage(input: {
  locale: "en" | "ar";
  school: string;
  name: string;
  loginName: string;
  link: string;
  days: number;
}): Rendered {
  return input.locale === "ar"
    ? {
        subject: `${input.school}: اختر كلمة مرورك`,
        text: [
          `مرحبًا ${input.name}، فتحت المدرسة لك حساب دخول في تطبيقها.`,
          `اسم الدخول: ${input.loginName}`,
          `اختر كلمة المرور من هذا الرابط، وهو يعمل مرة واحدة خلال ${input.days} أيام:`,
          input.link,
          "هذا الرابط لك وحدك، فلا ترسله إلى أحد. إن لم تنتظر هذه الرسالة فأبلغ مكتب المدرسة.",
        ].join("\n\n"),
      }
    : {
        subject: `${input.school}: choose your password`,
        text: [
          `Hello ${input.name}, the school has opened a sign-in for you in its app.`,
          `Sign-in name: ${input.loginName}`,
          `Choose your password from this link, which works once, within ${input.days} days:`,
          input.link,
          "The link is for you only, so please do not forward it. If you did not expect this email, tell the school office.",
        ].join("\n\n"),
      };
}

/**
 * The email that replaces a forgotten password. Choosing a new one signs
 * the account out everywhere, so the email says so.
 */
export function resetMessage(input: {
  locale: "en" | "ar";
  school: string;
  loginName: string;
  link: string;
  minutes: number;
}): Rendered {
  return input.locale === "ar"
    ? {
        subject: `${input.school}: اختر كلمة مرور جديدة`,
        text: [
          `طلب أحدهم كلمة مرور جديدة لاسم الدخول ${input.loginName}.`,
          `اختر كلمة المرور الجديدة من هذا الرابط، وهو يعمل مرة واحدة خلال ${input.minutes} دقيقة:`,
          input.link,
          "سيُسجَّل خروجك من كل الأجهزة الأخرى. إن لم تطلب ذلك فتجاهل هذه الرسالة، فكلمة مرورك لم تتغير.",
        ].join("\n\n"),
      }
    : {
        subject: `${input.school}: choose a new password`,
        text: [
          `Someone asked for a new password for the sign-in name ${input.loginName}.`,
          `Choose the new password from this link, which works once, within ${input.minutes} minutes:`,
          input.link,
          "Every other device will be signed out. If you did not ask for this, ignore this email; your password has not changed.",
        ].join("\n\n"),
      };
}

/**
 * The email that confirms a family's address when they register to apply:
 * choosing a password from the link proves the address is theirs.
 */
export function registerMessage(input: {
  locale: "en" | "ar";
  school: string;
  name: string;
  loginName: string;
  link: string;
  days: number;
}): Rendered {
  return input.locale === "ar"
    ? {
        subject: `${input.school}: أكّد بريدك لتبدأ طلب الالتحاق`,
        text: [
          `مرحبًا ${input.name}، شكرًا لتسجيلك لدى ${input.school}.`,
          `اسم الدخول: ${input.loginName}`,
          `أكّد بريدك واختر كلمة المرور من هذا الرابط، وهو يعمل مرة واحدة خلال ${input.days} أيام. بعدها تستطيع بدء طلب الالتحاق وحفظه والعودة إليه متى شئت:`,
          input.link,
          "إن لم تسجّل لدى المدرسة فتجاهل هذه الرسالة، ولن يُفتح أي حساب.",
        ].join("\n\n"),
      }
    : {
        subject: `${input.school}: confirm your email to start applying`,
        text: [
          `Hello ${input.name}, thank you for registering with ${input.school}.`,
          `Sign-in name: ${input.loginName}`,
          `Confirm your email and choose your password from this link, which works once, within ${input.days} days. You can then start an application, save it and come back to it whenever you like:`,
          input.link,
          "If you did not register with the school, ignore this email and no account will open.",
        ].join("\n\n"),
      };
}

/**
 * The answer to registering with an address that already has an account,
 * sent to that address alone, so the page itself never says who has one.
 */
export function alreadyRegisteredMessage(input: {
  locale: "en" | "ar";
  school: string;
  loginName: string;
  signIn: string;
  reset: string;
}): Rendered {
  return input.locale === "ar"
    ? {
        subject: `${input.school}: لديك حساب بالفعل`,
        text: [
          `طلب أحدهم التسجيل لدى ${input.school} بهذا البريد، ولديك حساب به بالفعل.`,
          `اسم الدخول: ${input.loginName}`,
          `سجّل الدخول من هنا لتقدّم طلب الالتحاق من حسابك:`,
          input.signIn,
          `وإن نسيت كلمة المرور فاختر كلمة جديدة من هنا:`,
          input.reset,
          "إن لم تطلب ذلك فتجاهل هذه الرسالة.",
        ].join("\n\n"),
      }
    : {
        subject: `${input.school}: you already have an account`,
        text: [
          `Someone asked to register with ${input.school} using this email, and it already has an account.`,
          `Sign-in name: ${input.loginName}`,
          `Sign in here to apply from your account:`,
          input.signIn,
          `If you have forgotten your password, choose a new one here:`,
          input.reset,
          "If you did not ask for this, ignore this email.",
        ].join("\n\n"),
      };
}
