import { currentSchoolYear } from "@faridalms/database/repositories/academics";
import { ManagementError } from "@faridalms/database/repositories/management";
import {
  saveTimetable as saveTimetableRows,
  timetableForManagement,
} from "@faridalms/database/repositories/timetable";
import {
  saveTimetableSchema,
  timetableQuerySchema,
} from "@faridalms/domain/timetable";
import { ORPCError } from "@orpc/server";

import { requirePermission } from "../authorization";
import { protectedProcedure } from "../procedure";

export const getClassTimetable = protectedProcedure
  .input(timetableQuerySchema)
  .handler(async ({ input, context }) => {
    await requirePermission(context, "classes:manage");
    const year = await currentSchoolYear(context.db);
    const row = await timetableForManagement(
      context.db,
      input.classId,
      year.id,
    );
    if (!row) throw new ORPCError("NOT_FOUND");
    return row;
  });

export const saveTimetable = protectedProcedure
  .input(saveTimetableSchema)
  .handler(async ({ input, context }) => {
    await requirePermission(context, "classes:manage");
    const year = await currentSchoolYear(context.db);
    try {
      return await saveTimetableRows(context.db, input, year.id);
    } catch (error) {
      if (error instanceof ManagementError)
        throw new ORPCError(error.code, { message: error.message });
      throw error;
    }
  });
