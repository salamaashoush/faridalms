import type { Audience } from "@faridalms/database/stores/audiences";
import type { AudienceInput } from "@faridalms/domain/announcements";

import { gradesInYear, reachOf } from "@faridalms/database/stores/audiences";
import { classesOfYear } from "@faridalms/database/stores/classes";
import { schoolYears, workingYear } from "@faridalms/database/stores/years";

import type { UnitContext } from "./context";

import { can } from "./procedure";

export function audienceOf(input: AudienceInput): Audience {
  return {
    scope: input.scope,
    classId: input.classId || null,
    gradeId: input.gradeId || null,
  };
}

/** The classes and grades of the working year a broadcast can go to. */
export async function audienceChoices(context: UnitContext) {
  const year = workingYear(
    await schoolYears(context.tx, context.tenantId, context.schoolId),
    context.today,
  );
  if (!year) return { classes: [], grades: [] };
  const scope = {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    yearId: year.id,
  };
  const [classes, grades] = await Promise.all([
    classesOfYear(context.tx, scope),
    gradesInYear(context.tx, scope),
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
