import type { Audience } from "@faridalms/database/stores/audiences";
import type { AudienceInput } from "@faridalms/domain/announcements";

import { gradesRunning, reachOf } from "@faridalms/database/stores/audiences";
import { classesRunning } from "@faridalms/database/stores/classes";

import type { UnitContext } from "./context";

import { can } from "./procedure";

export function audienceOf(input: AudienceInput): Audience {
  return {
    scope: input.scope,
    classId: input.classId || null,
    gradeId: input.gradeId || null,
  };
}

/** The classes running today, and their grades, a broadcast can go to. */
export async function audienceChoices(context: UnitContext) {
  const scope = {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    on: context.today,
  };
  const [classes, grades] = await Promise.all([
    classesRunning(context.tx, scope),
    gradesRunning(context.tx, scope),
  ]);
  return { classes, grades };
}

/** Who the viewer is to the calendar's audience scopes today; managers see every event. */
export async function calendarReach(context: UnitContext) {
  if (can(context, "calendar:manage")) return null;
  return reachOf(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    userId: context.actor.userId,
    on: context.today,
  });
}
