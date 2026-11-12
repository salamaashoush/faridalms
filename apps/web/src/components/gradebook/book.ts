import type { classBookQuery } from "~/queries/gradebook";

import { gradeWithScore } from "~/components/grading/format";
import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

export type Book = Awaited<
  ReturnType<NonNullable<ReturnType<typeof classBookQuery>["queryFn"]>>
>;

export type Student = Book["students"][number];
export type Work = Book["assignments"][number];
export type Result = Book["results"][number];

/** Term grades are kept out of 100; the server refuses more. */
export const TERM_MAXIMUM = 100;

export interface TermDraft {
  score: number | null;
  comment: string;
}

export const NO_DRAFT: TermDraft = { score: null, comment: "" };

export function resultOf(book: Book, workId: string, studentId: string) {
  return book.results.find(
    (row) => row.assignmentId === workId && row.studentId === studentId,
  );
}

export function savedGradeOf(book: Book, studentId: string) {
  return book.grades.find((row) => row.studentId === studentId);
}

/** A saved term grade students and families cannot see yet. */
export function isUnreleased(book: Book, studentId: string) {
  const grade = savedGradeOf(book, studentId);
  return Boolean(grade && grade.score !== null && !grade.releasedAt);
}

/**
 * The term grade the work so far would give, to one place as the term grade
 * field takes it, since a term grade out of 100 is the calculated percentage.
 */
export function calculatedScore(book: Book, studentId: string) {
  const found = book.calculated.find((row) => row.studentId === studentId);
  if (!found || found.percent === null) return null;
  return Math.round(found.percent * 10) / 10;
}

/** The calculated grade as read: "86.5%", or "B (86.5%)" on a scale. */
export function calculatedText(book: Book, studentId: string) {
  const found = book.calculated.find((row) => row.studentId === studentId);
  const score = calculatedScore(book, studentId);
  if (!found || score === null) return null;
  const percent = m.gradebookPercent({ value: formatNumber(score) });
  return found.grade ? gradeWithScore(found.grade, percent) : percent;
}

export const termCellId = (studentId: string) => `term-grade-${studentId}`;
