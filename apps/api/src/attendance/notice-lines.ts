import { contribute } from "../core/extension";
import { noticeLines } from "../notifications/points";

/** Absences a family is told of, and registers still to take, in an email or a text. */
export const ATTENDANCE_LINES = [
  contribute(noticeLines, {
    kind: "absence",
    en: (p) =>
      p.report
        ? `The school ${p.report === "accepted" ? "accepted" : "declined"} your report for ${p.studentName ?? "your child"} from ${p.date ?? "today"}.`
        : `${p.studentName ?? "Your child"} was marked absent on ${p.date ?? "today"}${p.className ? ` (${p.className})` : ""}.`,
    ar: (p) =>
      p.report
        ? `${p.report === "accepted" ? "قبلت" : "رفضت"} المدرسة بلاغك عن ${p.studentName ?? "طفلك"} بدءًا من ${p.date ?? "اليوم"}.`
        : `سُجّل غياب ${p.studentName ?? "طفلك"} يوم ${p.date ?? "اليوم"}${p.className ? ` (${p.className})` : ""}.`,
  }),
  contribute(noticeLines, {
    kind: "reminder",
    sends: (params) => !params.cover,
    en: (p) =>
      `Reminder: the register for ${p.className ?? "your class"} on ${p.date ?? "today"} is not taken yet.`,
    ar: (p) =>
      `تذكير: لم يُسجَّل حضور ${p.className ?? "فصلك"} يوم ${p.date ?? "اليوم"} بعد.`,
  }),
];
