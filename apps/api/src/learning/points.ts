import type { GoalLevel } from "@faridalms/domain/standards";

import type { UnitContext } from "../core/context";
import type { ModuleScope } from "../core/extension";

import { contributionsTo, point } from "../core/extension";

/** What one marked answer in a lesson shows, for each standard its question carries. */
export interface LessonMark {
  attempt: number;
  blockId: string;
  standards: readonly string[];
  fraction: number;
}

/**
 * Where a lesson's marked answers are told, for whatever keeps account of
 * what a student's answers show. A worker marking again tells it as the
 * school, without an actor.
 */
export interface MarkedLessons {
  lesson(
    scope: ModuleScope,
    input: {
      lessonId: string;
      studentId: string;
      marks: readonly LessonMark[];
      replace: boolean;
    },
  ): Promise<void>;
}

export const markedLessons = point<MarkedLessons>("marked lessons");

/** Tells whatever keeps account of answers what a lesson's marked answers show. */
export async function tellMarkedLesson(
  scope: ModuleScope,
  input: Parameters<MarkedLessons["lesson"]>[1],
): Promise<void> {
  if (input.marks.length === 0) return;
  for (const told of await contributionsTo(scope, markedLessons))
    await told.lesson(scope, input);
}

/** A discussion a module holds, as one reader of the module sees it. */
export interface ModuleDiscussion {
  id: string;
  title: string;
  dueAt: string | null;
  state: string;
  class: {
    id: string;
    code: string;
    titleEn: string | null;
    titleAr: string | null;
  } | null;
}

/**
 * What another module keeps in a module beside its lessons: discussions,
 * say. It hears when the module's classes change, and says what the module
 * holds for a reader.
 */
export interface ModuleParts {
  classesChanged(context: UnitContext, moduleId: string): Promise<void>;
  discussionsOf(
    context: UnitContext,
    input: { moduleId: string; studentId: string },
  ): Promise<ModuleDiscussion[]>;
  /** The module a piece of work sits in, or null. */
  placementOf(
    context: UnitContext,
    assignmentId: string,
  ): Promise<string | null>;
}

export const moduleParts = point<ModuleParts>("module parts");

/** A standard a lesson's questions or its plan name, as the school keeps it. */
export interface NamedStandard {
  id: string;
  code: string;
  statement: string;
  frameworkId: string;
  frameworkTitle: string;
  assessed: boolean;
}

/**
 * The standards lessons name, where a module keeps standards: what each
 * is, and where a young class's children stand on the goals among them.
 */
export interface LessonStandards {
  standardsOf(
    context: UnitContext,
    ids: readonly string[],
  ): Promise<NamedStandard[]>;
  judgementsOf(
    context: UnitContext,
    input: { studentIds: readonly string[]; standardIds: readonly string[] },
  ): Promise<{ studentId: string; standardId: string; level: GoalLevel }[]>;
}

export const lessonStandards = point<LessonStandards>("lesson standards");

/** The standards lessons name, of the modules on that keep them. */
export async function standardsNamed(
  context: UnitContext,
): Promise<LessonStandards | null> {
  const [first] = await contributionsTo(context, lessonStandards);
  return first ?? null;
}

/** A stretch of days a class's units are laid along, and its parts, such as a year and its terms. */
export interface UnitFrame {
  titleEn: string | null;
  titleAr: string | null;
  startsOn: string;
  endsBefore: string;
  parts: {
    id: string;
    titleEn: string | null;
    titleAr: string | null;
    startsOn: string;
    endsBefore: string;
  }[];
}

/** The days a class's units are laid along, where a module gives them. */
export interface UnitFrames {
  /** Whether the school has set up what the frames come from, such as its year. */
  ready(context: UnitContext): Promise<boolean>;
  frameOf(context: UnitContext, classId: string): Promise<UnitFrame | null>;
}

export const unitFrames = point<UnitFrames>("unit frames");
