import type {
  NotificationPayload,
  NotificationType,
} from "@faridalms/domain/notification";

interface Rendered {
  subject: string;
  text: string;
}

type Template = (payload: NotificationPayload, school: string) => Rendered;

const TEMPLATES: Record<"en" | "ar", Record<NotificationType, Template>> = {
  en: {
    assignment_published: (p, school) => ({
      subject: `${school}: new assignment "${p.title}"`,
      text: `${p.actorName ?? "A teacher"} published "${p.title}" (${p.preview}). Sign in to read the brief and the deadline.`,
    }),
    assessment_released: (p, school) => ({
      subject: `${school}: "${p.title}" has been assessed`,
      text: `${p.studentName ?? "Your child"} received ${p.preview} for "${p.title}". Sign in to read the feedback.`,
    }),
    message_received: (p, school) => ({
      subject: `${school}: new message from ${p.actorName ?? "the school"}`,
      text: `${p.actorName ?? "Someone"} wrote about "${p.title}": ${p.preview}`,
    }),
    announcement_published: (p, school) => ({
      subject: `${school}: ${p.title}`,
      text: p.preview,
    }),
    newsletter_published: (p, school) => ({
      subject: `${school}: newsletter "${p.title}"`,
      text: p.preview,
    }),
  },
  ar: {
    assignment_published: (p, school) => ({
      subject: `${school}: واجب جديد "${p.title}"`,
      text: `نشر ${p.actorName ?? "أحد المعلمين"} "${p.title}" (${p.preview}). سجّل الدخول لقراءة التكليف والموعد النهائي.`,
    }),
    assessment_released: (p, school) => ({
      subject: `${school}: تم تقييم "${p.title}"`,
      text: `حصل ${p.studentName ?? "طفلك"} على ${p.preview} في "${p.title}". سجّل الدخول لقراءة الملاحظات.`,
    }),
    message_received: (p, school) => ({
      subject: `${school}: رسالة جديدة من ${p.actorName ?? "المدرسة"}`,
      text: `كتب ${p.actorName ?? "شخص ما"} بخصوص "${p.title}": ${p.preview}`,
    }),
    announcement_published: (p, school) => ({
      subject: `${school}: ${p.title}`,
      text: p.preview,
    }),
    newsletter_published: (p, school) => ({
      subject: `${school}: نشرة "${p.title}"`,
      text: p.preview,
    }),
  },
};

/** The channel-neutral text of a notification in the recipient's language. */
export function renderNotification(
  locale: "en" | "ar",
  type: NotificationType,
  payload: NotificationPayload,
  school: string,
): Rendered {
  return TEMPLATES[locale][type](payload, school);
}

/** Where the notification points in the web app. */
export function notificationPath(payload: NotificationPayload, role: string) {
  const { link } = payload;
  const prefix =
    role === "admin"
      ? "admin"
      : role === "teacher"
        ? "teach"
        : role === "parent"
          ? "family"
          : "me";
  const paths = {
    assignment: `/assignments/${link.id}${link.studentId ? `?studentId=${link.studentId}&tab=work` : ""}`,
    message: `/${prefix}/messages?message=${link.id}`,
    announcement: `/announcements/${link.id}`,
    newsletter: `/newsletters/${link.id}`,
  };
  return paths[link.kind];
}
