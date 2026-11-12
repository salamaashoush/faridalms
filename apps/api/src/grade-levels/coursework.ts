import {
  classesOfGrades,
  gradesOfClasses,
} from "@faridalms/database/stores/class-grades";
import {
  levelsOfProgrammes,
  programmesByLevel,
  setProgrammeLevels,
} from "@faridalms/database/stores/programme-grades";
import { gradeMeaningsOver } from "@faridalms/database/stores/student-grades";
import { programmeLevelsPartSchema } from "@faridalms/domain/grade-levels";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";
import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import {
  programmeDefaults,
  programmeParts,
  readingGrades,
} from "../coursework/points";
import { rederiveProgrammes } from "../coursework/programmes";
import { gradesOf } from "./levels";
import { classGradeFollowers } from "./points";

/** Derives again the programme of every class of the grades. */
async function rederiveGrades(
  context: UnitContext,
  gradeIds: readonly string[],
) {
  await rederiveProgrammes(
    context,
    await classesOfGrades(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      gradeIds,
    }),
  );
}

/**
 * Programmes by grade, and reading by grade, where coursework and grade
 * levels are both on: the grade levels a programme covers, the programme a
 * class of a grade follows when it has none of its own (the one programme
 * covering its grade), and the grade a student read in.
 */
export const GRADE_LEVELS_WITH_COURSEWORK: ModuleContributions = {
  module: "grade_levels",
  needs: ["coursework"],
  contributions: [
    contribute(programmeParts, {
      key: "levels",
      read: async (context, programmeIds) =>
        new Map(
          [
            ...(await levelsOfProgrammes(context.tx, {
              tenantId: context.tenantId,
              programmeIds,
            })),
          ].map(([id, gradeLevelIds]) => [id, { gradeLevelIds }]),
        ),
      save: async (context, input) => {
        const read = v.safeParse(programmeLevelsPartSchema, input.value);
        if (!read.success)
          throw new ORPCError("BAD_REQUEST", { message: "validation.invalid" });
        const known = await gradesOf(context, context.today);
        if (
          read.output.gradeLevelIds.some(
            (id) => !known.some((row) => row.id === id),
          )
        )
          throw new ORPCError("BAD_REQUEST", {
            message: "grade_level.unknown",
          });
        const before =
          (
            await levelsOfProgrammes(context.tx, {
              tenantId: context.tenantId,
              programmeIds: [input.programmeId],
            })
          ).get(input.programmeId) ?? [];
        await setProgrammeLevels(context.tx, {
          tenantId: context.tenantId,
          programmeId: input.programmeId,
          gradeIds: read.output.gradeLevelIds,
        });
        await rederiveGrades(context, [
          ...new Set([...before, ...read.output.gradeLevelIds]),
        ]);
      },
      retired: async (context, programmeId) => {
        const before =
          (
            await levelsOfProgrammes(context.tx, {
              tenantId: context.tenantId,
              programmeIds: [programmeId],
            })
          ).get(programmeId) ?? [];
        await setProgrammeLevels(context.tx, {
          tenantId: context.tenantId,
          programmeId,
          gradeIds: [],
        });
        await rederiveGrades(context, before);
      },
    }),
    contribute(programmeDefaults, {
      programmesFor: async (context, classIds) => {
        const [grades, byLevel] = await Promise.all([
          gradesOfClasses(context.tx, context.tenantId, classIds),
          programmesByLevel(context.tx, {
            tenantId: context.tenantId,
            orgId: context.schoolId,
          }),
        ]);
        // Two programmes sharing the level leave the class to choose.
        return new Map(
          classIds.map((classId) => {
            const covering = byLevel.get(grades.get(classId) ?? "") ?? [];
            return [
              classId,
              covering.length === 1 ? (covering[0] ?? null) : null,
            ];
          }),
        );
      },
    }),
    contribute(classGradeFollowers, {
      changed: (context, classIds) => rederiveProgrammes(context, classIds),
    }),
    contribute(readingGrades, {
      gradesOver: (context, studentId) =>
        gradeMeaningsOver(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          studentId,
        }),
    }),
  ],
};
