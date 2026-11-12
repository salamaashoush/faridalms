import { contribute } from "../core/extension";
import { noticeLines } from "../notifications/points";

/** The question of a learner's return, in an email or a text. */
export const YEARS_LINES = [
  contribute(noticeLines, {
    kind: "reenrolment",
    en: (p) =>
      `Will ${p.studentName ?? "your child"} return to school${p.title ? ` in ${p.title}` : " next year"}? Tell the school in the family app.`,
    ar: (p) =>
      `هل يعود ${p.studentNameAr || p.studentName || "طفلك"} إلى المدرسة${p.titleAr || p.title ? ` في ${p.titleAr || p.title}` : " في العام القادم"}؟ أخبروا المدرسة في تطبيق الأسرة.`,
  }),
];
