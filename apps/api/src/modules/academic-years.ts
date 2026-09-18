import {
  getAcademicYear as getYear,
  listAcademicYears,
  saveAcademicYear as saveYear,
} from "@faridalms/database/repositories/academic-years";
import { ManagementError } from "@faridalms/database/repositories/management";
import {
  academicYearQuerySchema,
  saveAcademicYearSchema,
} from "@faridalms/domain/academic-year";
import { ORPCError } from "@orpc/server";

import { requirePermission } from "../authorization";
import { protectedProcedure } from "../procedure";

export const getAcademicYears = protectedProcedure.handler(
  async ({ context }) => {
    await requirePermission(context, "school:manage");
    return listAcademicYears(context.db);
  },
);

export const getAcademicYear = protectedProcedure
  .input(academicYearQuerySchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "school:manage");
    const year = await getYear(context.db, input.id);
    if (!year) throw new ORPCError("NOT_FOUND");
    return year;
  });

export const saveAcademicYear = protectedProcedure
  .input(saveAcademicYearSchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "school:manage");
    try {
      return await saveYear(context.db, input);
    } catch (error) {
      if (error instanceof ManagementError)
        throw new ORPCError(error.code, { message: error.message });
      throw error;
    }
  });
