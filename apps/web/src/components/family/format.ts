import { getLocale } from "~/i18n/runtime";

export function percentOf(score: number, maxScore: number): number {
  if (maxScore <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round((score / maxScore) * 100)));
}

export interface SubjectRef {
  name: string;
  /** Only some subject selections include it; fall back to `name` when absent. */
  nameAr?: string;
}

export function subjectLabel(
  subject: SubjectRef | null | undefined,
): string | null {
  if (!subject) {
    return null;
  }
  return getLocale() === "ar" && subject.nameAr ? subject.nameAr : subject.name;
}
