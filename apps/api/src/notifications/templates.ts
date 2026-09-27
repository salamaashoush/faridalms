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
      p.updated
        ? `Updated: ${p.title ?? ""}`
        : `Announcement: ${p.title ?? ""}`,
    urgent: (p) => `Urgent: ${p.title ?? ""}`,
    newsletter: (p) => `New newsletter: ${p.title ?? ""}`,
    message: (p) =>
      `New message from ${p.actorName ?? "the school"}${p.preview ? `: ${p.preview}` : ""}`,
    absence: (p) =>
      `${p.studentName ?? "Your child"} was marked absent on ${p.date ?? "today"}${p.className ? ` (${p.className})` : ""}.`,
    event: (p) =>
      p.cancelled
        ? `Cancelled: ${p.title ?? ""}${p.date ? ` on ${p.date}` : ""}`
        : `${p.updated ? "Event changed" : "Event"}: ${p.title ?? ""}${p.date ? ` on ${p.date}` : ""}`,
    reminder: (p) =>
      `Reminder: the register for ${p.className ?? "your class"} on ${p.date ?? "today"} is not taken yet.`,
  },
  ar: {
    announcement: (p) =>
      p.updated ? `تحديث: ${p.title ?? ""}` : `إعلان: ${p.title ?? ""}`,
    urgent: (p) => `عاجل: ${p.title ?? ""}`,
    newsletter: (p) => `نشرة جديدة: ${p.title ?? ""}`,
    message: (p) =>
      `رسالة جديدة من ${p.actorName ?? "المدرسة"}${p.preview ? `: ${p.preview}` : ""}`,
    absence: (p) =>
      `سُجّل غياب ${p.studentName ?? "طفلك"} يوم ${p.date ?? "اليوم"}${p.className ? ` (${p.className})` : ""}.`,
    event: (p) =>
      p.cancelled
        ? `أُلغيت: ${p.title ?? ""}${p.date ? ` يوم ${p.date}` : ""}`
        : `${p.updated ? "تغيّرت فعالية" : "فعالية"}: ${p.title ?? ""}${p.date ? ` يوم ${p.date}` : ""}`,
    reminder: (p) =>
      `تذكير: لم يُسجَّل حضور ${p.className ?? "فصلك"} يوم ${p.date ?? "اليوم"} بعد.`,
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
