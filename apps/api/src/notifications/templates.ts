import type {
  NoticeParams,
  NotificationKind,
} from "@faridalms/domain/notifications";

export interface Rendered {
  subject: string;
  text: string;
}

type Line = (params: NoticeParams) => string;

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

/** Each reader gets the names in their own language where both were given. */
function paramsOf(locale: "en" | "ar", value: NoticeParams): NoticeParams {
  const pick = (en?: string, ar?: string) =>
    (locale === "ar" ? ar || en : en || ar) || undefined;
  return {
    ...value,
    title: pick(value.title, value.titleAr),
    actorName: pick(value.actorName, value.actorNameAr),
    studentName: pick(value.studentName, value.studentNameAr),
    className: pick(value.className, value.classNameAr),
    periodName: pick(value.periodName, value.periodNameAr),
  };
}

export function lineFor(
  locale: "en" | "ar",
  kind: NotificationKind,
  params: NoticeParams,
): string {
  return LINES[locale][kind](paramsOf(locale, params));
}

/**
 * One message for what is due for a person on a channel: a single notice as
 * itself, several as a digest listing each line. Texts stay one line.
 */
export function render(input: {
  locale: "en" | "ar";
  channel: "email" | "sms";
  school: string;
  items: readonly { kind: NotificationKind; params: NoticeParams }[];
}): Rendered {
  const lines = input.items.map((item) =>
    lineFor(input.locale, item.kind, item.params),
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
