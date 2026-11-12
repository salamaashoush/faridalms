import {
  homeroomsOfClasses,
  linkedClasses,
  subjectClassIds,
} from "@faridalms/database/stores/homerooms";

import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { timetableGrids } from "../timetable/grids";
import { homeroomClass } from "./write";

/** A homeroom's grid on the timetable: the homeroom and its subject classes, planned together. */
export const HOMEROOMS_IN_TIMETABLE: ModuleContributions = {
  module: "homerooms",
  needs: ["timetable"],
  contributions: [
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
  ],
};
