import type { UnitContext } from "../core/context";

import { contributionsTo, point } from "../core/extension";

/** A module that keeps something in step with the grades classes teach. */
export interface ClassGradeFollower {
  changed(context: UnitContext, classIds: readonly string[]): Promise<void>;
}

export const classGradeFollowers = point<ClassGradeFollower>(
  "class grade followers",
);

/** Tells the modules on that the classes' grades changed. */
export async function classGradesChanged(
  context: UnitContext,
  classIds: readonly string[],
) {
  for (const follower of await contributionsTo(context, classGradeFollowers))
    await follower.changed(context, classIds);
}
