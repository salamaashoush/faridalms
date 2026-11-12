import type {
  AssignmentRow,
  Selection,
} from "@faridalms/database/stores/coursework";
import type { SubmissionFormat } from "@faridalms/database/tables/coursework";
import type { FluencyMark } from "@faridalms/domain/learning";

import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";
import type { ModuleScope } from "../core/extension";

import { contributionsTo, point } from "../core/extension";

/** Who in a class takes part in work, where a module decides it. */
export interface PartAudience {
  audience: "class" | "selected";
  selection: Selection;
}

/**
 * What a module keeps about an assignment, saved with it from the editor
 * under the module's key: the term it counts toward, say. Each part reads
 * its own value with its own schema; the editor reads what it shows from
 * the module's own procedures.
 */
export interface AssignmentPart {
  key: string;
  /**
   * Checks the value before the assignment is written, refusing what the
   * part does not allow, and says who takes part where the part decides it.
   */
  prepare?(
    context: UnitContext,
    input: {
      classId: string;
      format: SubmissionFormat;
      stored: AssignmentRow | null;
      value: unknown;
    },
  ): Promise<PartAudience | null>;
  save(
    context: UnitContext,
    input: { assignment: AssignmentRow; value: unknown; created: boolean },
  ): Promise<void>;
  /** The assignment went out to its class. */
  published?(context: UnitContext, assignment: AssignmentRow): Promise<void>;
  /** Work set again from `source` as `created`, in another class. */
  reused?(
    context: UnitContext,
    input: { source: AssignmentRow; created: AssignmentRow },
  ): Promise<void>;
}

export const assignmentParts = point<AssignmentPart>("assignment parts");

/** The parts of the modules on, refusing a value given for one no module on keeps. */
export async function partsFor(
  context: UnitContext,
  values: Readonly<Record<string, unknown>>,
): Promise<AssignmentPart[]> {
  const offered = await contributionsTo(context, assignmentParts);
  for (const key of Object.keys(values))
    if (!offered.some((part) => part.key === key))
      throw new ORPCError("BAD_REQUEST", {
        message: "coursework.part_unknown",
      });
  return offered;
}

/** What one marked answer shows, for each standard its question or criterion carries. */
export interface AnswerMark {
  attempt: number;
  blockId: string;
  standards: readonly string[];
  fraction: number;
}

/**
 * Where marked work's answers are told, for whatever keeps account of
 * what a student's answers show: a quiz's marks, or a rubric's levels. A
 * worker handing in a timed quiz tells it as the school, without an actor.
 */
export interface MarkedWork {
  quiz(
    scope: ModuleScope,
    input: {
      submissionId: string;
      studentId: string;
      marks: readonly AnswerMark[];
      replace: boolean;
    },
  ): Promise<void>;
  rubric(
    context: UnitContext,
    input: {
      submissionId: string;
      studentId: string;
      attempt: number;
      marks: readonly Omit<AnswerMark, "attempt">[];
    },
  ): Promise<void>;
}

export const markedWork = point<MarkedWork>("marked work");

/** Tells the parts of the modules on that the assignment went out. */
export async function partsPublished(
  context: UnitContext,
  assignment: AssignmentRow,
): Promise<void> {
  for (const part of await contributionsTo(context, assignmentParts))
    await part.published?.(context, assignment);
}

/** Tells the parts of the modules on that work was set again. */
export async function partsReused(
  context: UnitContext,
  input: { source: AssignmentRow; created: AssignmentRow },
): Promise<void> {
  for (const part of await contributionsTo(context, assignmentParts))
    await part.reused?.(context, input);
}

/** A passage a student read aloud in a lesson, as a teacher last marked it word by word. */
export interface LessonReadingMark {
  lessonId: string;
  title: string;
  blockId: string;
  /** The lesson as the student read it, which holds the passage. */
  content: unknown;
  fluency: FluencyMark;
  markedAt: string;
}

/** The readings aloud a student gave in lessons over some days, where a module keeps lessons. */
export interface LessonReadings {
  readingsOf(
    context: UnitContext,
    input: { studentId: string; from: string; before: string },
  ): Promise<LessonReadingMark[]>;
}

export const lessonReadings = point<LessonReadings>("lesson readings");
