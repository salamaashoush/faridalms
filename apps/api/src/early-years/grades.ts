import {
  classesOfYoungGrades,
  learnersOfYoungGrades,
} from "@faridalms/database/stores/young-grades";

import type { ModuleContributions } from "../core/extension";

import { youngClasses } from "../classes/points";
import { contribute } from "../core/extension";
import { youngStudents } from "../people/points";

/**
 * A young grade makes its classes and learners young where a school has
 * grades too, beside the classes it marks itself.
 */
export const EARLY_YEARS_BY_GRADE: ModuleContributions = {
  module: "early_years",
  needs: ["grade_levels"],
  contributions: [
    contribute(youngClasses, {
      youngAmong: (context, classIds) =>
        classesOfYoungGrades(context.tx, context.tenantId, classIds),
    }),
    contribute(youngStudents, {
      youngAmong: (context, studentIds, on) =>
        learnersOfYoungGrades(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          userIds: studentIds,
          on,
        }),
    }),
  ],
};
