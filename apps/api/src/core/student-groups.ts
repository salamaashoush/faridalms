import type { UnitContext } from "./context";

import { contributionsTo, point } from "./extension";

/** The class a student belongs to, as the school knows them by it. */
export interface StudentGroup {
  classId: string;
  code: string;
  titleEn: string | null;
  titleAr: string | null;
}

export interface StudentGroups {
  groupsOf(
    context: UnitContext,
    studentIds: readonly string[],
    on: string,
  ): Promise<Map<string, StudentGroup>>;
}

export const studentGroups = point<StudentGroups>("student groups");

/** Each student's group on the date, where a module gives them one. */
export async function studentGroupsOf(
  context: UnitContext,
  studentIds: readonly string[],
  on: string,
): Promise<Map<string, StudentGroup>> {
  const result = new Map<string, StudentGroup>();
  if (studentIds.length === 0) return result;
  for (const contribution of await contributionsTo(context, studentGroups))
    for (const [studentId, group] of await contribution.groupsOf(
      context,
      studentIds,
      on,
    ))
      if (!result.has(studentId)) result.set(studentId, group);
  return result;
}
