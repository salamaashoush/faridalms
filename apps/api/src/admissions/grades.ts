import {
  gradesOfIntakes,
  setIntakeGrade,
} from "@faridalms/database/stores/intake-grades";
import { intakeGradePartSchema } from "@faridalms/domain/grade-levels";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { changeStudentGrade } from "../grade-levels/contributions";
import { gradesOf } from "../grade-levels/levels";
import { enrolmentParts, intakeParts } from "./points";

/**
 * Intakes by grade, where admissions and grade levels are both on: the
 * grade an intake admits into, and that grade for a child enrolled from it,
 * from the intake's first day.
 */
export const ADMISSIONS_BY_GRADE: ModuleContributions = {
  module: "admissions",
  needs: ["grade_levels"],
  contributions: [
    contribute(intakeParts, {
      key: "grade",
      save: async (context, input) => {
        const read = v.safeParse(intakeGradePartSchema, input.value);
        if (!read.success)
          throw new ORPCError("BAD_REQUEST", { message: "validation.invalid" });
        const { gradeId } = read.output;
        const held = (
          await gradesOfIntakes(context.tx, {
            tenantId: context.tenantId,
            intakeIds: [input.intakeId],
          })
        ).get(input.intakeId);
        // An intake's grade is fixed once it has one.
        if (held && held.gradeId !== gradeId)
          throw new ORPCError("BAD_REQUEST", { message: "intake.fixed" });
        if (!gradeId || held) return;
        if (
          !(await gradesOf(context, context.today)).some(
            (row) => row.id === gradeId,
          )
        )
          throw new ORPCError("BAD_REQUEST", { message: "intake.grade" });
        await setIntakeGrade(context.tx, {
          tenantId: context.tenantId,
          intakeId: input.intakeId,
          gradeId,
        });
      },
      factsOf: async (context, intakeIds) =>
        new Map(
          [
            ...(await gradesOfIntakes(context.tx, {
              tenantId: context.tenantId,
              intakeIds,
            })),
          ].map(([intakeId, grade]) => [
            intakeId,
            {
              value: { gradeId: grade.gradeId },
              labelEn: grade.labelEn,
              labelAr: grade.labelAr,
              rank: grade.sortOrder,
            },
          ]),
        ),
    }),
    contribute(enrolmentParts, {
      enrolled: async (context, input) => {
        const held = (
          await gradesOfIntakes(context.tx, {
            tenantId: context.tenantId,
            intakeIds: [input.intakeId],
          })
        ).get(input.intakeId);
        if (held)
          await changeStudentGrade(context, {
            studentId: input.studentId,
            gradeId: held.gradeId,
            from: input.startsOn,
            source: "admission",
          });
      },
    }),
  ],
};
