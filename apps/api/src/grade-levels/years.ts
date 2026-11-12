import { gradesOfClasses } from "@faridalms/database/stores/class-grades";
import {
  nextGrade,
  rolloverGradePartSchema,
} from "@faridalms/domain/grade-levels";
import * as v from "valibot";

import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { rolloverParts } from "../years/carry";
import { changeStudentGrade } from "./contributions";
import { gradesOf } from "./levels";

/**
 * Grades through a rollover, where grade levels and school years are both
 * on: each class carried goes into the next grade, and each staying
 * student takes the grade of the class they go on in from the year's
 * first day.
 */
export const GRADE_LEVELS_IN_YEARS: ModuleContributions = {
  module: "grade_levels",
  needs: ["school_years"],
  contributions: [
    contribute(rolloverParts, {
      key: "grade",
      propose: async (context, sourceClassIds) => {
        const [grades, ofClasses] = await Promise.all([
          gradesOf(context, context.today),
          gradesOfClasses(context.tx, context.tenantId, sourceClassIds),
        ]);
        return new Map(
          sourceClassIds.map((classId) => [
            classId,
            { gradeId: nextGrade(grades, ofClasses.get(classId) ?? null) },
          ]),
        );
      },
      stayed: async (context, input) => {
        for (const stay of input.stays) {
          const read = v.safeParse(rolloverGradePartSchema, stay.part);
          if (!read.success || !read.output.gradeId) continue;
          await changeStudentGrade(context, {
            studentId: stay.studentId,
            gradeId: read.output.gradeId,
            from: input.from,
            source: "rollover",
          });
        }
      },
    }),
  ],
};
