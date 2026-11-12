import { contribute } from "../core/extension";
import { noticeLines } from "../notifications/points";

/** What coursework tells students, families and teachers in an email or a text. */
export const COURSEWORK_LINES = [
  contribute(noticeLines, {
    kind: "reply",
    en: (p) =>
      `${p.actorName || "Someone in your class"} replied to your post in ${p.title ?? "a discussion"}.`,
    ar: (p) =>
      `ردّ ${p.actorNameAr || p.actorName || "أحد زملائك"} على مشاركتك في ${p.title ?? "النقاش"}.`,
  }),
  contribute(noticeLines, {
    kind: "assignment",
    en: (p) =>
      `New work${p.studentName ? ` for ${p.studentName}` : ""}${p.className ? ` in ${p.className}` : ""}: ${p.title ?? ""}${p.date ? `, due ${p.date}` : ""}.`,
    ar: (p) =>
      `واجب جديد${p.studentName ? ` لـ${p.studentName}` : ""}${p.className ? ` في ${p.className}` : ""}: ${p.title ?? ""}${p.date ? `، وموعد تسليمه ${p.date}` : ""}.`,
  }),
  contribute(noticeLines, {
    kind: "feedback",
    en: (p) =>
      p.gradeShown
        ? `${p.studentName ? `${p.studentName}'s` : "Your"} grade for ${p.title ?? "an assignment"} is now shown.`
        : p.studentName
          ? p.revise
            ? `${p.studentName}'s work on ${p.title ?? "an assignment"} came back to revise.`
            : `${p.studentName}'s work on ${p.title ?? "an assignment"} was marked and returned.`
          : p.revise
            ? `Your work on ${p.title ?? "an assignment"} came back for you to revise.`
            : `Your work on ${p.title ?? "an assignment"} came back with your teacher's feedback.`,
    ar: (p) =>
      p.gradeShown
        ? p.studentName
          ? `ظهرت درجة ${p.studentNameAr || p.studentName} في ${p.titleAr || p.title || "الواجب"}.`
          : `ظهرت درجتك في ${p.titleAr || p.title || "الواجب"}.`
        : p.studentName
          ? p.revise
            ? `أُعيد عمل ${p.studentName} في ${p.title ?? "الواجب"} ليراجعه.`
            : `صُحِّح عمل ${p.studentName} في ${p.title ?? "الواجب"} وأُعيد إليه.`
          : p.revise
            ? `أُعيد إليك عملك في ${p.title ?? "الواجب"} لتراجعه.`
            : `أُعيد إليك عملك في ${p.title ?? "الواجب"} مع ملاحظات معلمك.`,
  }),
  contribute(noticeLines, {
    kind: "grades",
    en: (p) =>
      `${p.studentName ? `${p.studentName}'s` : "Your"} grades for ${p.title ?? "the term"}${p.className ? ` in ${p.className}` : ""} are out.`,
    ar: (p) =>
      `صدرت ${p.studentName ? `درجات ${p.studentName}` : "درجاتك"} عن ${p.title ?? "الفصل الدراسي"}${p.className ? ` في ${p.className}` : ""}.`,
  }),
];
