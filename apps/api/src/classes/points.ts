import type { EnrollmentSource } from "@faridalms/database/tables/teaching";

import type { UnitContext } from "../core/context";

import { contributionsTo, point } from "../core/extension";

export interface EnrolmentEnding {
  id: string;
  classId: string;
  userId: string;
  source: EnrollmentSource;
}

/** A module that keeps some enrolments in step refuses ending them by hand. */
export interface EnrolmentGuard {
  /** An error code when this enrolment may not be ended here, else null. */
  refusesEnding(
    context: UnitContext,
    enrolment: EnrolmentEnding,
  ): Promise<string | null>;
}

export const enrolmentGuards = point<EnrolmentGuard>("enrolment guards");

export async function endingRefusal(
  context: UnitContext,
  enrolment: EnrolmentEnding,
): Promise<string | null> {
  for (const guard of await contributionsTo(context, enrolmentGuards)) {
    const refusal = await guard.refusesEnding(context, enrolment);
    if (refusal) return refusal;
  }
  return null;
}

/** The group of students a class is, or is taught to. */
export interface ClassGroup {
  classId: string;
  code: string;
  titleEn: string | null;
  titleAr: string | null;
  /** The class is the group itself rather than a class taught to it. */
  own: boolean;
}

export interface ClassGroups {
  groupsOf(
    context: UnitContext,
    classIds: readonly string[],
  ): Promise<Map<string, ClassGroup>>;
}

export const classGroups = point<ClassGroups>("class groups");

/** The group each class is or is taught to, where a module gives one. */
export async function classGroupsOf(
  context: UnitContext,
  classIds: readonly string[],
): Promise<Map<string, ClassGroup>> {
  const result = new Map<string, ClassGroup>();
  if (classIds.length === 0) return result;
  for (const contribution of await contributionsTo(context, classGroups))
    for (const [classId, group] of await contribution.groupsOf(
      context,
      classIds,
    ))
      if (!result.has(classId)) result.set(classId, group);
  return result;
}
