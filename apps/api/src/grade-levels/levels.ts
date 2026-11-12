import type { Descriptor } from "@faridalms/database/stores/descriptors";

import { descriptorsFor } from "@faridalms/database/stores/descriptors";

import type { ModuleScope } from "../core/extension";

/**
 * The school's grades or levels in its order: those in use on the day, or
 * given no day, every one it has had, as old rows still name them.
 */
export async function gradesOf(
  context: ModuleScope,
  today: string | null,
): Promise<Descriptor[]> {
  return descriptorsFor(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    namespace: "grade_level",
    today,
  });
}

/** A grade's labels, by id, from the school's grades. */
export const labelOf = (grades: readonly Descriptor[], id: string | null) => {
  const grade = id ? grades.find((row) => row.id === id) : undefined;
  return grade
    ? { id: grade.id, labelEn: grade.labelEn, labelAr: grade.labelAr }
    : null;
};
