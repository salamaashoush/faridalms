import {
  homeroomClassIds,
  homeroomsOfClasses,
  homeroomsOfStudents,
  linkedClasses,
  reachedThroughHomerooms,
  subjectClassIds,
} from "@faridalms/database/stores/homerooms";

import type { ModuleContributions } from "../core/extension";

import { dailyRegisters } from "../attendance/daily-registers";
import { classGroups, classGuards } from "../classes/points";
import { contribute } from "../core/extension";
import { sharedClassReach } from "../core/reach";
import { studentGroups } from "../core/student-groups";
import { timetableGrids } from "../timetable/grids";
import { homeroomClass } from "./write";

/** What homerooms tell the rest of the product, wherever it asks. */
export const HOMEROOMS: ModuleContributions = {
  module: "homerooms",
  contributions: [
    contribute(sharedClassReach, {
      classesReached: (context, scope, on) =>
        reachedThroughHomerooms(context.tx, scope, on),
    }),
    contribute(dailyRegisters, {
      classIds: (context, during) =>
        homeroomClassIds(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          during,
        }),
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
    contribute(timetableGrids, {
      ownersOf: async (context, classIds) =>
        new Map(
          [
            ...(
              await homeroomsOfClasses(context.tx, context.tenantId, classIds)
            ).entries(),
          ].flatMap(([classId, homeroom]) =>
            homeroom.own ? [] : [[classId, homeroom.homeroomClassId] as const],
          ),
        ),
      classesOf: async (context, ownerId) =>
        (await homeroomClass(context, ownerId))
          ? (await linkedClasses(context.tx, context, ownerId)).map(
              (row) => row.id,
            )
          : null,
      plannedElsewhere: (context, during) =>
        subjectClassIds(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          during,
        }),
    }),
    contribute(classGuards, {
      refusesEnding: (_context, enrolment) =>
        Promise.resolve(
          enrolment.source === "homeroom" ? "enrollment.derived" : null,
        ),
    }),
  ],
};
