import { currentSchoolYear } from "@faridalms/database/repositories/academics";
import {
  saveCalendarEvent as saveCalendarEventRow,
  eventsInRange,
  listEvents,
  listNewsletters,
} from "@faridalms/database/repositories/communication";
import {
  calendarEventSchema,
  calendarQuerySchema,
  newslettersQuerySchema,
} from "@faridalms/domain/school-schema";
import { ORPCError } from "@orpc/server";

import { requirePermission } from "../authorization";
import { protectedProcedure } from "../procedure";

export const getNewsletters = protectedProcedure
  .input(newslettersQuerySchema)
  .handler(async ({ input: data, context }) => {
    await requirePermission(context, "newsletters:read");
    return {
      ...(await listNewsletters(context.db, data)),
      today: context.today,
    };
  });

export const getCalendar = protectedProcedure
  .input(calendarQuerySchema)
  .handler(async ({ input: data, context }) => {
    await requirePermission(context, "calendar:read");
    const year = await currentSchoolYear(context.db);
    const month = data.month || context.today.slice(0, 7);
    const [yearPart = "2026", monthPart = "09"] = month.split("-");
    const lastDay = new Date(
      Date.UTC(Number(yearPart), Number(monthPart), 0),
    ).getUTCDate();

    const [monthRange, allEvents] = await Promise.all([
      eventsInRange(
        context.db,
        year.id,
        `${month}-01`,
        `${month}-${String(lastDay).padStart(2, "0")}`,
      ),
      listEvents(context.db, year.id, data.categories),
    ]);

    // The grid honours the same category filter as the agenda. Returning the
    // whole month made the client re-filter what the server already knew.
    const monthEvents =
      data.categories.length === 0
        ? monthRange
        : monthRange.filter((event) =>
            data.categories.includes(event.category),
          );

    return { month, today: context.today, monthEvents, allEvents };
  });

export const saveCalendarEvent = protectedProcedure
  .input(calendarEventSchema)
  .handler(async ({ input, context }) => {
    await requirePermission(context, "calendar:manage");
    const year = await currentSchoolYear(context.db);
    const saved = await saveCalendarEventRow(context.db, year.id, input);
    if (!saved)
      throw new ORPCError("CONFLICT", {
        message: "calendar.revision_conflict",
      });
    return saved;
  });
