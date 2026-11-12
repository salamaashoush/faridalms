import {
  dayMarks,
  paintDays,
  schoolWeek,
} from "@faridalms/database/stores/school-days";
import {
  paintDaysSchema,
  schoolDays,
  schoolDaysQuerySchema,
} from "@faridalms/domain/school-days";

import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";

/**
 * The school's days over a span: its week, and every day it marked as
 * other than its week says. They belong to no year.
 */
export const days = readProcedure
  .input(schoolDaysQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "school:manage", "calendar:manage");
    const scope = { tenantId: context.tenantId, schoolId: context.schoolId };
    const [week, marks] = await Promise.all([
      schoolWeek(context.tx, context.tenantId, context.schoolId),
      dayMarks(context.tx, { ...scope, from: input.from, to: input.to }),
    ]);
    return {
      from: input.from,
      to: input.to,
      today: context.today,
      weekStart: week.weekStart,
      weekendDays: [...week.weekendDays],
      weekdays: schoolDays(week.weekStart, week.weekendDays),
      days: marks,
      canEdit: can(context, "calendar:manage"),
    };
  });

/**
 * Marks a run of days as holidays, exam days, staff days, closures or back
 * to normal. Registers and lessons follow at once: a day that stops being a
 * school day asks for none.
 */
export const paint = writeProcedure
  .input(paintDaysSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "calendar:manage");
    const changed = await paintDays(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      from: input.from,
      to: input.to,
      kind: input.kind,
      noteEn: input.noteEn || null,
      noteAr: input.noteAr || null,
      provisional: input.provisional,
    });
    await audit(context, {
      action: "calendar_dates.mark",
      objectType: "org",
      objectId: context.schoolId,
      details: { from: input.from, to: input.to, kind: input.kind, changed },
    });
    return { changed };
  });
