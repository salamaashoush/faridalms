import {
  homeroomsOfClasses,
  homeroomsOfStudents,
  reachedThroughHomerooms,
} from "@faridalms/database/stores/homerooms";

import type { ModuleContributions } from "../core/extension";

import { classGroups, classGuards } from "../classes/points";
import { contribute } from "../core/extension";
import { sharedClassReach } from "../core/reach";
import { studentGroups } from "../core/student-groups";

/** What homerooms tell the rest of the product, wherever it asks. */
export const HOMEROOMS: ModuleContributions = {
  module: "homerooms",
  contributions: [
    contribute(sharedClassReach, {
      classesReached: (context, scope, on) =>
        reachedThroughHomerooms(context.tx, scope, on),
    }),
    contribute(studentGroups, {
      groupsOf: (context, studentIds, on) =>
        homeroomsOfStudents(context.tx, context, studentIds, on),
    }),
    contribute(classGroups, {
      groupsOf: async (context, classIds) =>
        new Map(
          [
            ...(
              await homeroomsOfClasses(context.tx, context.tenantId, classIds)
            ).entries(),
          ].map(([classId, homeroom]) => [
            classId,
            {
              classId: homeroom.homeroomClassId,
              code: homeroom.code,
              titleEn: homeroom.titleEn,
              titleAr: homeroom.titleAr,
              own: homeroom.own,
            },
          ]),
        ),
    }),
    contribute(classGuards, {
      refusesEnding: (_context, enrolment) =>
        Promise.resolve(
          enrolment.source === "homeroom" ? "enrollment.derived" : null,
        ),
    }),
  ],
};
