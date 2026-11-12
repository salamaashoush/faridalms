import type { ContentDocument } from "@faridalms/domain/content";
import type {
  NoticeParams,
  NotificationKind,
} from "@faridalms/domain/notifications";
import type { Digits } from "@faridalms/domain/people";

import { contentHtml } from "@faridalms/domain/content-html";
import { formatDayIn } from "@faridalms/domain/date-text";
import { REPLY_MARKER } from "@faridalms/domain/email-replies";
import { formattingLocale } from "@faridalms/domain/school";

import type { NoticeLines } from "./points";

export interface Rendered {
  subject: string;
  text: string;
  /** The same message laid out for mail clients that show HTML. */
  html?: string;
  /** The name the email is sent under: always the school's, never the platform's. */
  fromName?: string;
}

const POWERED = { en: "Powered by Farida LMS", ar: "تعمل بنظام فريدة LMS" };

/** What one email says, before it is laid out as text and as HTML. */
interface Letter {
  locale: "en" | "ar";
  school: string;
  heading: string;
  paragraphs: readonly string[];
  /** Short labelled values, such as a sign-in name. */
  facts?: readonly (readonly [string, string])[];
  action?: { label: string; href: string };
  /** The small print under the action, such as who the link is for. */
  note?: string;
  /** Words already laid out as safe HTML, such as a message's document, drawn after the paragraphs. */
  bodyHtml?: string;
  /** A line above everything, such as where a reply should be written. */
  preface?: string;
}

const OR_PASTE = {
  en: "If the button does not open, copy this link into your browser:",
  ar: "إن لم يفتح الزر، فانسخ هذا الرابط في المتصفح:",
};

/**
 * One layout for every email a school sends: its name at the top, the
 * words, one clear action, and the platform only as small print. Inline
 * styles and tables, because mail clients drop stylesheets; the text part
 * carries the same words and the link itself.
 */
function letter(input: Letter): Rendered & { html: string; fromName: string } {
  const { locale, school } = input;
  const dir = locale === "ar" ? "rtl" : "ltr";
  const align = locale === "ar" ? "right" : "left";
  const font =
    locale === "ar"
      ? "Tahoma, 'Segoe UI', Arial, sans-serif"
      : "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const facts = (input.facts ?? [])
    .map(
      ([label, value]) =>
        `<tr><td style="width:1%;white-space:nowrap;padding:6px 0;padding-inline-end:16px;color:#6b7280;font-size:13px">${escapeHtml(label)}</td><td dir="ltr" style="padding:6px 0;font-size:14px;font-weight:600;color:#111827;text-align:${align}">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const html = [
    `<!doctype html><html lang="${locale}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(input.heading)}</title></head>`,
    `<body style="margin:0;padding:0;background:#f3f4f6">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6"><tr><td align="center" style="padding:32px 16px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" dir="${dir}" style="max-width:560px;font-family:${font};text-align:${align}">`,
    input.preface
      ? `<tr><td style="padding:0 4px 12px;font-size:12px;color:#6b7280">${escapeHtml(input.preface)}</td></tr>`
      : "",
    `<tr><td style="padding:0 4px 16px;font-size:16px;font-weight:700;color:#111827">${escapeHtml(school)}</td></tr>`,
    `<tr><td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px">`,
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#111827">${escapeHtml(input.heading)}</h1>`,
    ...input.paragraphs.map(
      (paragraph) =>
        `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#374151">${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`,
    ),
    input.bodyHtml
      ? `<div style="font-size:15px;line-height:1.6;color:#374151">${input.bodyHtml}</div>`
      : "",
    facts
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;width:100%;border-top:1px solid #f3f4f6;border-bottom:1px solid #f3f4f6">${facts}</table>`
      : "",
    input.action
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="border-radius:8px;background:#111827"><a href="${escapeHtml(input.action.href)}" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">${escapeHtml(input.action.label)}</a></td></tr></table>` +
        `<p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#6b7280">${escapeHtml(OR_PASTE[locale])}<br><a dir="ltr" href="${escapeHtml(input.action.href)}" style="color:#4b5563;word-break:break-all">${escapeHtml(input.action.href)}</a></p>`
      : "",
    input.note
      ? `<p style="margin:16px 0 0;padding-top:16px;border-top:1px solid #f3f4f6;font-size:13px;line-height:1.5;color:#6b7280">${escapeHtml(input.note)}</p>`
      : "",
    `</td></tr>`,
    `<tr><td style="padding:16px 4px 0;font-size:12px;color:#9ca3af">${escapeHtml(school)} · ${POWERED[locale]}</td></tr>`,
    `</table></td></tr></table></body></html>`,
  ].join("");
  const text = [
    input.preface ?? "",
    input.heading,
    ...input.paragraphs,
    ...(input.facts ?? []).map(([label, value]) => `${label}: ${value}`),
    input.action ? `${input.action.label}:\n${input.action.href}` : "",
    input.note ?? "",
    `-- \n${school}\n${POWERED[locale]}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  return { subject: "", text, html, fromName: school };
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
  const marker = input.repliesReturn ? REPLY_MARKER[input.locale] : "";
  const kept = input.keptBack.length
    ? KEPT_AT_SCHOOL[input.locale](input.keptBack.join(", "))
    : "";
  const laid = letter({
    locale: input.locale,
    school: input.school,
    heading: input.subject,
    paragraphs: input.content ? [] : [input.text],
    bodyHtml: input.content
      ? contentHtml(input.content, { fileHref: () => null })
      : undefined,
    note: kept || undefined,
    preface: marker || undefined,
  });
  return {
    ...laid,
    subject: input.subject,
    // The words alone, so a reply quotes them as the family read them.
    text: [marker, input.text, kept, `-- \n${input.school}`]
      .filter(Boolean)
      .join("\n\n"),
  };
}

type Line = (params: NoticeParams) => string;

/** One line per notice of core's in the reader's language; the app writes its own from the same params. */
const LINES: Record<"en" | "ar", Partial<Record<NotificationKind, Line>>> = {
  en: {
    announcement: (p) =>
      `${p.updated ? "Updated" : "Announcement"}: ${p.title ?? ""}${p.preview ? `. ${p.preview}` : ""}`,
    urgent: (p) =>
      `Urgent: ${p.title ?? ""}${p.preview ? `. ${p.preview}` : ""}`,
    message: (p) =>
      `New message from ${p.actorName ?? "the school"}${p.preview ? `: ${p.preview}` : ""}`,
    event: (p) =>
      p.cancelled
        ? `Cancelled: ${p.title ?? ""}${p.date ? ` on ${p.date}` : ""}`
        : `${p.updated ? "Event changed" : "Event"}: ${p.title ?? ""}${p.date ? ` on ${p.date}` : ""}`,
    consent: (p) =>
      `The school asks for your permission: ${p.title ?? ""}${p.studentName ? ` (${p.studentName})` : ""}.`,
    mention: (p) =>
      p.comment
        ? `${p.actorName || "A colleague"} mentioned you in a comment${p.title ? ` on "${p.title}"` : ""}: ${p.preview ?? ""}`
        : `${p.actorName || "Someone at school"} mentioned you in ${p.title ?? "a document"}.`,
    library: (p) =>
      p.shared
        ? `${p.title ?? "Your piece"} is now one of the school's templates.`
        : `${p.actorName || "A reviewer"} sent ${p.title ?? "your piece"} back with a note.`,
  },
  ar: {
    announcement: (p) =>
      `${p.updated ? "تحديث" : "إعلان"}: ${p.titleAr || p.title || ""}${p.preview ? `. ${p.preview}` : ""}`,
    urgent: (p) =>
      `عاجل: ${p.titleAr || p.title || ""}${p.preview ? `. ${p.preview}` : ""}`,
    message: (p) =>
      `رسالة جديدة من ${p.actorName ?? "المدرسة"}${p.preview ? `: ${p.preview}` : ""}`,
    event: (p) =>
      p.cancelled
        ? `أُلغيت: ${p.title ?? ""}${p.date ? ` يوم ${p.date}` : ""}`
        : `${p.updated ? "تغيّرت فعالية" : "فعالية"}: ${p.title ?? ""}${p.date ? ` يوم ${p.date}` : ""}`,
    consent: (p) =>
      `تطلب المدرسة موافقتك: ${p.title ?? ""}${p.studentName ? ` (${p.studentName})` : ""}.`,
    mention: (p) =>
      p.comment
        ? `ذكرك ${p.actorNameAr || p.actorName || "أحد زملائك"} في تعليق${p.title ? ` على «${p.title}»` : ""}: ${p.preview ?? ""}`
        : `ذكرك ${p.actorName || "أحد أفراد المدرسة"} في ${p.titleAr || p.title || "مستند"}.`,
    library: (p) =>
      p.shared
        ? `أصبح ${p.title ?? "ما شاركته"} من قوالب المدرسة.`
        : `أعاد ${p.actorNameAr || p.actorName || "المراجع"} ${p.title ?? "ما شاركته"} إليك مع ملاحظة.`,
  },
};

const SIGN_IN = {
  en: "Sign in to the school's portal to read more.",
  ar: "سجّل الدخول إلى بوابة المدرسة لقراءة المزيد.",
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

/**
 * A notice's line in the reader's language: core's own, or the line the
 * module that sends it gave; none where that module is off.
 */
export function lineFor(
  locale: "en" | "ar",
  digits: Digits,
  item: { kind: NotificationKind; params: NoticeParams },
  lines: readonly NoticeLines[],
): string | null {
  const given = lines.find(
    (each) =>
      each.kind === item.kind && (!each.sends || each.sends(item.params)),
  );
  const line = given?.[locale] ?? LINES[locale][item.kind];
  return line ? line(paramsOf(locale, digits, item.params)) : null;
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
  /** The lines of the modules on at the school. */
  lines: readonly NoticeLines[];
}): Rendered | null {
  const lines = input.items.flatMap(
    (item) => lineFor(input.locale, input.digits, item, input.lines) ?? [],
  );
  if (lines.length === 0) return null;
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
      ...letter({
        locale: input.locale,
        school: input.school,
        heading: first ?? "",
        paragraphs: [SIGN_IN[input.locale]],
      }),
      subject: `${input.school}: ${first ?? ""}`,
    };
  return {
    ...letter({
      locale: input.locale,
      school: input.school,
      heading: DIGEST[input.locale](lines.length),
      paragraphs: [
        lines.map((line) => `• ${line}`).join("\n"),
        SIGN_IN[input.locale],
      ],
    }),
    subject: `${input.school}: ${DIGEST[input.locale](lines.length)}`,
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
        ...letter({
          locale: "ar",
          school: input.school,
          heading: `حساب ${input.student} جاهز`,
          paragraphs: [
            `فتحت ${input.school} حساب دخول لـ ${input.student} على بوابتها. اختاروا له كلمة مرور ليبدأ.`,
          ],
          facts: [["اسم الدخول", input.loginName]],
          action: { label: "اختيار كلمة المرور", href: input.link },
          note: `يعمل الرابط مرة واحدة خلال ${input.days} أيام، وهو لأسرتكم فقط فلا ترسلوه إلى أحد. إن لم تنتظروا هذه الرسالة فأبلغوا مكتب المدرسة.`,
        }),
        subject: `${input.school}: اختر كلمة مرور ${input.student}`,
      }
    : {
        ...letter({
          locale: "en",
          school: input.school,
          heading: `${input.student}'s sign-in is ready`,
          paragraphs: [
            `${input.school} has opened a sign-in for ${input.student} on its portal. Choose a password to get started.`,
          ],
          facts: [["Sign-in name", input.loginName]],
          action: { label: "Choose the password", href: input.link },
          note: `The link works once, within ${input.days} days, and is for your family only, so please do not forward it. If you did not expect this email, tell the school office.`,
        }),
        subject: `${input.school}: choose ${input.student}'s password`,
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
        ...letter({
          locale: "ar",
          school: input.school,
          heading: `مرحبًا ${input.name}`,
          paragraphs: [
            `فتحت ${input.school} لك حساب دخول على بوابتها. اختر كلمة مرورك لتبدأ.`,
          ],
          facts: [["اسم الدخول", input.loginName]],
          action: { label: "اختيار كلمة المرور", href: input.link },
          note: `يعمل الرابط مرة واحدة خلال ${input.days} أيام، وهو لك وحدك فلا ترسله إلى أحد. إن لم تنتظر هذه الرسالة فأبلغ مكتب المدرسة.`,
        }),
        subject: `${input.school}: اختر كلمة مرورك`,
      }
    : {
        ...letter({
          locale: "en",
          school: input.school,
          heading: `Welcome, ${input.name}`,
          paragraphs: [
            `${input.school} has opened a sign-in for you on its portal. Choose your password to get started.`,
          ],
          facts: [["Sign-in name", input.loginName]],
          action: { label: "Choose your password", href: input.link },
          note: `The link works once, within ${input.days} days, and is for you only, so please do not forward it. If you did not expect this email, tell the school office.`,
        }),
        subject: `${input.school}: choose your password`,
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
        ...letter({
          locale: "ar",
          school: input.school,
          heading: "اختر كلمة مرور جديدة",
          paragraphs: [`طلب أحدهم كلمة مرور جديدة لحسابك في ${input.school}.`],
          facts: [["اسم الدخول", input.loginName]],
          action: { label: "اختيار كلمة مرور جديدة", href: input.link },
          note: `يعمل الرابط مرة واحدة خلال ${input.minutes} دقيقة، وسيُسجَّل خروجك من كل الأجهزة الأخرى. إن لم تطلب ذلك فتجاهل هذه الرسالة، فكلمة مرورك لم تتغير.`,
        }),
        subject: `${input.school}: اختر كلمة مرور جديدة`,
      }
    : {
        ...letter({
          locale: "en",
          school: input.school,
          heading: "Choose a new password",
          paragraphs: [
            `Someone asked for a new password for your ${input.school} account.`,
          ],
          facts: [["Sign-in name", input.loginName]],
          action: { label: "Choose a new password", href: input.link },
          note: `The link works once, within ${input.minutes} minutes, and every other device will be signed out. If you did not ask for this, ignore this email; your password has not changed.`,
        }),
        subject: `${input.school}: choose a new password`,
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
        ...letter({
          locale: "ar",
          school: input.school,
          heading: `مرحبًا ${input.name}`,
          paragraphs: [
            `شكرًا لتسجيلك لدى ${input.school}. أكّد بريدك واختر كلمة المرور، ثم ابدأ طلب الالتحاق واحفظه وعد إليه متى شئت.`,
          ],
          facts: [["اسم الدخول", input.loginName]],
          action: { label: "تأكيد البريد", href: input.link },
          note: `يعمل الرابط مرة واحدة خلال ${input.days} أيام. إن لم تسجّل لدى المدرسة فتجاهل هذه الرسالة، ولن يُفتح أي حساب.`,
        }),
        subject: `${input.school}: أكّد بريدك لتبدأ طلب الالتحاق`,
      }
    : {
        ...letter({
          locale: "en",
          school: input.school,
          heading: `Welcome, ${input.name}`,
          paragraphs: [
            `Thank you for registering with ${input.school}. Confirm your email and choose your password, then start an application, save it and come back to it whenever you like.`,
          ],
          facts: [["Sign-in name", input.loginName]],
          action: { label: "Confirm your email", href: input.link },
          note: `The link works once, within ${input.days} days. If you did not register with the school, ignore this email and no account will open.`,
        }),
        subject: `${input.school}: confirm your email to start applying`,
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
        ...letter({
          locale: "ar",
          school: input.school,
          heading: "لديك حساب بالفعل",
          paragraphs: [
            `طلب أحدهم التسجيل لدى ${input.school} بهذا البريد، ولديك حساب به بالفعل. سجّل الدخول لتقدّم طلب الالتحاق من حسابك.`,
            `وإن نسيت كلمة المرور فاختر كلمة جديدة من هنا:\n${input.reset}`,
          ],
          facts: [["اسم الدخول", input.loginName]],
          action: { label: "تسجيل الدخول", href: input.signIn },
          note: "إن لم تطلب ذلك فتجاهل هذه الرسالة.",
        }),
        subject: `${input.school}: لديك حساب بالفعل`,
      }
    : {
        ...letter({
          locale: "en",
          school: input.school,
          heading: "You already have an account",
          paragraphs: [
            `Someone asked to register with ${input.school} using this email, and it already has an account. Sign in to apply from your account.`,
            `If you have forgotten your password, choose a new one here:\n${input.reset}`,
          ],
          facts: [["Sign-in name", input.loginName]],
          action: { label: "Sign in", href: input.signIn },
          note: "If you did not ask for this, ignore this email.",
        }),
        subject: `${input.school}: you already have an account`,
      };
}
