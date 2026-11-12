import { gradesOfClasses } from "@faridalms/database/stores/class-grades";

import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { changeStudentGrade } from "../grade-levels/contributions";
import { homeroomPlacements } from "./points";

/**
 * Where homerooms and grade levels are both on, a student placed in a
 * homeroom of a grade is in that grade from the day of the placement.
 */
export const HOMEROOMS_BY_GRADE: ModuleContributions = {
  module: "homerooms",
  needs: ["grade_levels"],
  contributions: [
    contribute(homeroomPlacements, {
      placed: async (context, input) => {
        const gradeId = (
          await gradesOfClasses(context.tx, context.tenantId, [
            input.homeroomClassId,
          ])
        ).get(input.homeroomClassId);
        if (gradeId)
          await changeStudentGrade(context, {
            studentId: input.studentId,
            gradeId,
            from: input.from,
            source: "homeroom",
          });
      },
    }),
  ],
};
