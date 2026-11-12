import { contribute } from "../core/extension";
import { noticeLines } from "../notifications/points";

/** Reviews handed out and their reminder, in an email or a text. */
export const PEER_REVIEW_LINES = [
  contribute(noticeLines, {
    kind: "peer_review",
    en: (p) =>
      p.dueSoon
        ? `Reminder: your reviews of classmates' work for ${p.title ?? "an assignment"} are due ${p.date ?? "soon"}.`
        : `Classmates' work to review for ${p.title ?? "an assignment"}${p.date ? `, due ${p.date}` : ""}.`,
    ar: (p) =>
      p.dueSoon
        ? `تذكير: موعد مراجعاتك لأعمال زملائك في ${p.titleAr || p.title || "الواجب"} ${p.date ?? "قريبًا"}.`
        : `أعمال زملاء لتراجعها في ${p.titleAr || p.title || "الواجب"}${p.date ? `، وموعدها ${p.date}` : ""}.`,
  }),
];
