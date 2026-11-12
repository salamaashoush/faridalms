import { contribute } from "../core/extension";
import { noticeLines } from "../notifications/points";

/** A lesson a teacher covers, or no longer covers, in an email or a text. */
export const TIMETABLE_LINES = [
  contribute(noticeLines, {
    kind: "reminder",
    sends: (params) => Boolean(params.cover),
    en: (p) =>
      p.cancelled
        ? `You no longer cover ${p.className ?? "a lesson"} on ${p.date ?? "today"}${p.periodName ? `, ${p.periodName}` : ""}.`
        : `You cover ${p.className ?? "a lesson"} on ${p.date ?? "today"}${p.periodName ? `, ${p.periodName}` : ""}.`,
    ar: (p) =>
      p.cancelled
        ? `لم تعد تغطي ${p.className ?? "حصة"} يوم ${p.date ?? "اليوم"}${p.periodName ? `، ${p.periodName}` : ""}.`
        : `تغطي ${p.className ?? "حصة"} يوم ${p.date ?? "اليوم"}${p.periodName ? `، ${p.periodName}` : ""}.`,
  }),
];
