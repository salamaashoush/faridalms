import type { ClassesViewed } from "@faridalms/database/stores/classes";
import type { EvidenceSource } from "@faridalms/database/tables/standards";

import type { UnitContext } from "../core/context";

import { contributionsTo, point } from "../core/extension";

/** The work a sitting is: a lesson a student took, or work they handed in. */
export type SittingWork =
  | { lessonId: string; title: string }
  | { assignmentId: string; submissionId: string; title: string };

/** A sitting as the module its work belongs to reads it. */
export interface SittingInfo {
  work: SittingWork;
  /** The sources of evidence a student sees as soon as they answer. */
  shown: readonly EvidenceSource[];
  /** The attempts whose results were given back to the student. */
  releasedAttempts: readonly number[];
}

/** The work an answer a judgement is made from belongs to, as the client names it. */
export type GoalWork =
  | { lessonId: string; blockId: string }
  | { submissionId: string; blockId: string };

/**
 * Where a student's evidence came from, as the module that keeps that work
 * says: what each of its sittings is, which belong to a class's work, and
 * the sitting an answer a teacher judges from is.
 */
export interface EvidenceSourceOf {
  sittings(
    context: UnitContext,
    sittingIds: readonly string[],
  ): Promise<Map<string, SittingInfo>>;
  ofClass(
    context: UnitContext,
    input: { classId: string; sittingIds: readonly string[] },
  ): Promise<Set<string>>;
  /**
   * The sitting of the student's answer, made if it has none, where the
   * work is this module's; not found when it is but is not the class's.
   */
  sittingFrom(
    context: UnitContext,
    input: { from: GoalWork; studentId: string; classId: string },
  ): Promise<string | null>;
}

export const evidenceSources = point<EvidenceSourceOf>("evidence sources");

/** What each of these sittings is, by the modules on that keep its work. */
export async function sittingsOf(
  context: UnitContext,
  sittingIds: readonly string[],
): Promise<Map<string, SittingInfo>> {
  const found = new Map<string, SittingInfo>();
  if (sittingIds.length === 0) return found;
  for (const source of await contributionsTo(context, evidenceSources))
    for (const [id, info] of await source.sittings(context, sittingIds))
      found.set(id, info);
  return found;
}

/** Of these sittings, those of the class's own work. */
export async function sittingsOfClass(
  context: UnitContext,
  input: { classId: string; sittingIds: readonly string[] },
): Promise<Set<string>> {
  const found = new Set<string>();
  if (input.sittingIds.length === 0) return found;
  for (const source of await contributionsTo(context, evidenceSources))
    for (const id of await source.ofClass(context, input)) found.add(id);
  return found;
}

/** The sitting an answer a teacher judges from is, or not found. */
export async function sittingFrom(
  context: UnitContext,
  input: { from: GoalWork; studentId: string; classId: string },
): Promise<string | null> {
  for (const source of await contributionsTo(context, evidenceSources)) {
    const found = await source.sittingFrom(context, input);
    if (found) return found;
  }
  return null;
}

/** A unit of a module in use, with the items of frameworks its plan names. */
export interface CurriculumUnit {
  id: string;
  title: string;
  state: string;
  startsOn: string | null;
  classes: {
    id: string;
    code: string;
    titleEn: string | null;
    titleAr: string | null;
  }[];
  named: string[];
}

/** The units the classes viewed take, where a module keeps unit plans. */
export interface CurriculumUnits {
  unitsOf(
    context: UnitContext,
    viewed: ClassesViewed,
  ): Promise<CurriculumUnit[]>;
}

export const curriculumUnits = point<CurriculumUnits>("curriculum units");
