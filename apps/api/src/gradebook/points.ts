import type { ClassRow } from "@faridalms/database/stores/classes";

import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { contributionsTo, point } from "../core/extension";

/** A student's grade in a class for a term. */
export interface PeriodGrade {
  id: string;
  studentId: string;
  score: number | null;
  maxScore: number;
  comment: string | null;
  releasedAt: string | null;
  gradeScaleVersionId: string | null;
}

/** A student's released grade in one class for one term. */
export interface StudentTermGrade {
  classId: string;
  classCode: string;
  classTitleEn: string | null;
  classTitleAr: string | null;
  subjectId: string | null;
  periodId: string;
  periodTitleEn: string | null;
  periodTitleAr: string | null;
  score: number | null;
  maxScore: number;
  comment: string | null;
  gradeScaleVersionId: string | null;
}

/** One term a class's grades are kept for. */
export interface TermOption {
  id: string;
  titleEn: string | null;
  titleAr: string | null;
}

/** A class's book for one term: its terms, the one chosen, its grades and its work. */
export interface TermBook {
  terms: TermOption[];
  periodId: string | null;
  currentPeriodId: string | null;
  grades: PeriodGrade[];
  /** Nothing more is recorded for the class, as in a closed year. */
  closed: boolean;
  /** The work that counts toward the chosen term, by id; null shows all. */
  workIds: ReadonlySet<string> | null;
}

/**
 * Grades by term, where a module keeps terms: what a class's book shows
 * for a term, how its grades are saved and released, a student's released
 * grades, and grading a term again on today's bands.
 */
export interface TermGrading {
  book(
    context: UnitContext,
    input: {
      classRow: ClassRow;
      periodId: string;
      workIds: readonly string[];
    },
  ): Promise<TermBook | null>;
  save(
    context: UnitContext,
    input: {
      classRow: ClassRow;
      periodId: string;
      maxScore: number;
      grades: readonly {
        studentId: string;
        score: number | null;
        comment: string;
      }[];
    },
  ): Promise<number>;
  release(
    context: UnitContext,
    input: { classRow: ClassRow; periodId: string },
  ): Promise<number>;
  studentGrades(
    context: UnitContext,
    studentId: string,
  ): Promise<{
    year: { id: string; titleEn: string | null; titleAr: string | null };
    rows: StudentTermGrade[];
  } | null>;
  /** The terms work in a class may count toward, and the one an assignment counts toward. */
  workTerm(
    context: UnitContext,
    input: { classId: string; assignmentId: string },
  ): Promise<{ terms: TermOption[]; periodId: string }>;
  regrade(
    context: UnitContext,
    input: { periodId: string; reason: string },
  ): Promise<{ terms: number; work: number }>;
}

export const termGrading = point<TermGrading>("term grading");

/** The term grading of the modules on, or null where none keeps terms. */
export async function termGradingOf(
  context: UnitContext,
): Promise<TermGrading | null> {
  const [first] = await contributionsTo(context, termGrading);
  return first ?? null;
}

/** The term grading of the modules on, or not found where none keeps terms. */
export async function requireTermGrading(
  context: UnitContext,
): Promise<TermGrading> {
  const found = await termGradingOf(context);
  if (!found) throw new ORPCError("NOT_FOUND");
  return found;
}
