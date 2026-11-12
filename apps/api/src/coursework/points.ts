import type {
  AssignmentRow,
  Selection,
} from "@faridalms/database/stores/coursework";
import type { SubmissionFormat } from "@faridalms/database/tables/coursework";
import type { PartValue } from "@faridalms/domain/classes";
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

/**
 * What a module keeps about a programme, saved with it from its form under
 * the module's key, and read back for the list: the grade levels it covers,
 * say. `retired` lets the module let go of what it kept.
 */
export interface ProgrammePart {
  key: string;
  read(
    context: UnitContext,
    programmeIds: readonly string[],
  ): Promise<Map<string, PartValue>>;
  save(
    context: UnitContext,
    input: { programmeId: string; value: unknown },
  ): Promise<void>;
  retired(context: UnitContext, programmeId: string): Promise<void>;
}

export const programmeParts = point<ProgrammePart>("programme parts");

async function partsOffered(
  context: UnitContext,
  parts: Readonly<Record<string, unknown>>,
) {
  const offered = await contributionsTo(context, programmeParts);
  if (Object.keys(parts).some((key) => !offered.some((p) => p.key === key)))
    throw new ORPCError("BAD_REQUEST", { message: "grading.part_unknown" });
  return offered;
}

/** Saves what the modules keep about a programme; a part no module on answers for is refused. */
export async function saveProgrammeParts(
  context: UnitContext,
  programmeId: string,
  parts: Readonly<Record<string, unknown>>,
) {
  for (const part of await partsOffered(context, parts))
    if (part.key in parts)
      await part.save(context, { programmeId, value: parts[part.key] });
}

/** What each module keeps about each programme, by programme and key. */
export async function programmePartsOf(
  context: UnitContext,
  programmeIds: readonly string[],
): Promise<Map<string, Record<string, PartValue>>> {
  const result = new Map<string, Record<string, PartValue>>(
    programmeIds.map((id) => [id, {}]),
  );
  for (const part of await contributionsTo(context, programmeParts))
    for (const [id, value] of await part.read(context, programmeIds)) {
      const parts = result.get(id);
      if (parts) parts[part.key] = value;
    }
  return result;
}

export async function retireProgrammeParts(
  context: UnitContext,
  programmeId: string,
) {
  for (const part of await contributionsTo(context, programmeParts))
    await part.retired(context, programmeId);
}

/**
 * The programme a module gives a class that has none chosen for it: the
 * one covering its grade, say. Coursework keeps what it answers as the
 * class's derived programme.
 */
export interface ProgrammeDefaults {
  programmesFor(
    context: UnitContext,
    classIds: readonly string[],
  ): Promise<Map<string, string | null>>;
}

export const programmeDefaults = point<ProgrammeDefaults>("programme defaults");

/**
 * The grade a student was in over each stretch, by its fixed meaning, where
 * a module keeps grades: what reading aloud is set against the norms of.
 */
export interface ReadingGrades {
  gradesOver(
    context: UnitContext,
    studentId: string,
  ): Promise<{ from: string; before: string | null; meaning: string | null }[]>;
}

export const readingGrades = point<ReadingGrades>("reading grades");

/** Refuses the reading norms where no module keeps grades: norms are by grade. */
export async function requireReadingGrades(context: UnitContext) {
  if ((await contributionsTo(context, readingGrades)).length === 0)
    throw new ORPCError("NOT_FOUND");
}

/**
 * A module that lets someone besides the student and their teachers read a
 * piece of handed-in work: someone who follows the student, once a teacher
 * shared it, say.
 */
export interface AttemptReaders {
  reads(
    context: UnitContext,
    attempt: { attemptId: string; studentId: string },
  ): Promise<boolean>;
}

export const attemptReaders = point<AttemptReaders>("attempt readers");

/** Whether a module lets the viewer read the attempt. */
export async function readsAttempt(
  context: UnitContext,
  attempt: { attemptId: string; studentId: string },
): Promise<boolean> {
  for (const readers of await contributionsTo(context, attemptReaders))
    if (await readers.reads(context, attempt)) return true;
  return false;
}
