import { contribute } from "../core/extension";
import { noticeLines } from "../notifications/points";

/** The question of a learner's return, in an email or a text. */
export const YEARS_LINES = [
  contribute(noticeLines, {
    kind: "reenrolment",
    en: (p) =>
      p.own
        ? `Will you return to school${p.title ? ` in ${p.title}` : " next year"}? Tell the school on your home page.`
        : `Will ${p.studentName ?? "your child"} return to school${p.title ? ` in ${p.title}` : " next year"}? Tell the school in the family app.`,
    ar: (p) =>
      p.own
        ? `هل تعود إلى المدرسة${p.titleAr || p.title ? ` في ${p.titleAr || p.title}` : " في العام القادم"}؟ أخبر المدرسة في صفحتك الرئيسية.`
        : `هل يعود ${p.studentNameAr || p.studentName || "طفلك"} إلى المدرسة${p.titleAr || p.title ? ` في ${p.titleAr || p.title}` : " في العام القادم"}؟ أخبروا المدرسة في تطبيق الأسرة.`,
  }),
];
