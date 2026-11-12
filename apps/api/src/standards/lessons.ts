import type { ContentDocument } from "@faridalms/domain/content";

import { contentsOf } from "@faridalms/database/stores/documents";
import {
  classesOfModule,
  lessonById,
  modulesInUse,
} from "@faridalms/database/stores/learning";
import {
  lessonSitting,
  lessonSittingsOfClass,
  lessonsOfSittings,
} from "@faridalms/database/stores/lesson-sittings";
import {
  judgementsOf,
  recordEvidence,
  standardsByIds,
} from "@faridalms/database/stores/standards";
import { planTargets } from "@faridalms/domain/standards";
import { ORPCError } from "@orpc/server";

import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { lessonStandards, markedLessons } from "../learning/points";
import { curriculumUnits, evidenceSources } from "./points";

/**
 * Standards where e-learning is on: the evidence a lesson's answers give,
 * the lessons that evidence came from, the goals a young class's teacher
 * judges from lesson answers, and the unit plans the curriculum map reads.
 */
export const STANDARDS_FROM_LESSONS: ModuleContributions = {
  module: "standards",
  needs: ["elearning"],
  contributions: [
    contribute(markedLessons, {
      lesson: async (scope, input) => {
        await recordEvidence(scope.tx, {
          tenantId: scope.tenantId,
          studentId: input.studentId,
          sittingId: await lessonSitting(scope.tx, {
            tenantId: scope.tenantId,
            lessonId: input.lessonId,
            studentId: input.studentId,
          }),
          source: "lesson",
          marks: input.marks,
          replace: input.replace,
        });
      },
    }),
    contribute(lessonStandards, {
      standardsOf: (context, ids) =>
        standardsByIds(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          ids,
        }),
      judgementsOf: async (context, input) =>
        (
          await judgementsOf(context.tx, {
            tenantId: context.tenantId,
            orgId: context.schoolId,
            studentIds: input.studentIds,
            standardIds: input.standardIds,
          })
        ).map((row) => ({
          studentId: row.studentId,
          standardId: row.standardId,
          level: row.level,
        })),
    }),
    contribute(evidenceSources, {
      sittings: async (context, sittingIds) =>
        new Map(
          [
            ...(
              await lessonsOfSittings(context.tx, {
                tenantId: context.tenantId,
                sittingIds,
              })
            ).entries(),
          ].map(([id, lesson]) => [
            id,
            {
              work: { lessonId: lesson.lessonId, title: lesson.title },
              // A lesson's answers are the student's own as they give them.
              shown: ["lesson"],
              releasedAttempts: [],
            },
          ]),
        ),
      ofClass: (context, input) =>
        lessonSittingsOfClass(context.tx, {
          tenantId: context.tenantId,
          ...input,
        }),
      sittingFrom: async (context, input) => {
        if (!("lessonId" in input.from)) return null;
        const lesson = await lessonById(
          context.tx,
          context.tenantId,
          input.from.lessonId,
        );
        const classes = lesson
          ? await classesOfModule(context.tx, context.tenantId, lesson.moduleId)
          : [];
        if (!lesson || !classes.some((row) => row.id === input.classId))
          throw new ORPCError("NOT_FOUND");
        return lessonSitting(context.tx, {
          tenantId: context.tenantId,
          lessonId: lesson.id,
          studentId: input.studentId,
        });
      },
    }),
    contribute(curriculumUnits, {
      unitsOf: async (context, viewed) => {
        const modules = await modulesInUse(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          viewed,
        });
        const plans = await contentsOf(
          context.tx,
          context.tenantId,
          "module_plan",
          modules.map((row) => row.id),
        );
        return modules.map((row) => {
          const plan = plans.get(row.id);
          return {
            ...row,
            named: plan
              ? [
                  ...new Set(
                    planTargets(plan as unknown as ContentDocument).map(
                      (target) => target.id,
                    ),
                  ),
                ]
              : [],
          };
        });
      },
    }),
  ],
};
