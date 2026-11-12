import {
  recordEvidence,
  recordRubricEvidence,
} from "@faridalms/database/stores/standards";
import {
  isClassQuizOf,
  workOfSittings,
  workSitting,
} from "@faridalms/database/stores/work-sittings";
import { ORPCError } from "@orpc/server";

import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { markedWork } from "../coursework/points";
import { evidenceSources } from "./points";

/**
 * Standards where coursework is on: the evidence a quiz's marks and a
 * rubric's levels give, and the handed-in work that evidence came from.
 */
export const STANDARDS_FROM_WORK: ModuleContributions = {
  module: "standards",
  needs: ["coursework"],
  contributions: [
    contribute(markedWork, {
      quiz: async (scope, input) => {
        await recordEvidence(scope.tx, {
          tenantId: scope.tenantId,
          studentId: input.studentId,
          sittingId: await workSitting(scope.tx, {
            tenantId: scope.tenantId,
            submissionId: input.submissionId,
            studentId: input.studentId,
          }),
          source: "quiz",
          marks: input.marks,
          replace: input.replace,
        });
      },
      rubric: async (context, input) => {
        await recordRubricEvidence(context.tx, {
          tenantId: context.tenantId,
          studentId: input.studentId,
          sittingId: await workSitting(context.tx, {
            tenantId: context.tenantId,
            submissionId: input.submissionId,
            studentId: input.studentId,
          }),
          attempt: input.attempt,
          marks: input.marks,
        });
      },
    }),
    contribute(evidenceSources, {
      sittings: async (context, sittingIds) =>
        new Map(
          [
            ...(
              await workOfSittings(context.tx, {
                tenantId: context.tenantId,
                sittingIds,
              })
            ).entries(),
          ].map(([id, work]) => [
            id,
            {
              work: {
                assignmentId: work.assignmentId,
                submissionId: work.submissionId,
                title: work.title,
              },
              // Most quizzes show their answers at once; others, and every
              // rubric, once the grade is returned.
              shown: work.quizShown ? ["quiz"] : [],
              releasedAttempts: work.releasedAttempts,
            },
          ]),
        ),
      ofClass: async (context, input) =>
        new Set(
          [
            ...(
              await workOfSittings(context.tx, {
                tenantId: context.tenantId,
                sittingIds: input.sittingIds,
              })
            ).entries(),
          ].flatMap(([id, work]) =>
            work.classId === input.classId ? [id] : [],
          ),
        ),
      sittingFrom: async (context, input) => {
        if (!("submissionId" in input.from)) return null;
        if (
          !(await isClassQuizOf(context.tx, {
            tenantId: context.tenantId,
            submissionId: input.from.submissionId,
            studentId: input.studentId,
            classId: input.classId,
          }))
        )
          throw new ORPCError("NOT_FOUND");
        return workSitting(context.tx, {
          tenantId: context.tenantId,
          submissionId: input.from.submissionId,
          studentId: input.studentId,
        });
      },
    }),
  ],
};
