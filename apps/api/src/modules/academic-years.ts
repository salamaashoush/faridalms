import {
  academicYearEvents,
  getAcademicYear as getYear,
  listAcademicYears,
  saveAcademicYear as saveYear,
  setAcademicYearStatus as setYearStatus,
  setDefaultAcademicYear as setDefaultYear,
} from "@faridalms/database/repositories/academic-years";
import { ManagementError } from "@faridalms/database/repositories/management";
import {
  academicYearQuerySchema,
  saveAcademicYearSchema,
  setDefaultYearSchema,
  setYearStatusSchema,
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

async function managed<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ManagementError)
      throw new ORPCError(error.code, { message: error.message });
    throw error;
  }
}

export const setAcademicYearStatus = protectedProcedure
  .input(setYearStatusSchema)
  .handler(async ({ context, input }) => {
    const user = await requirePermission(context, "school:manage");
    return managed(() =>
      setYearStatus(context.db, input, {
        id: user.id,
        canReopen: user.permissions.includes("years:reopen"),
      }),
    );
  });

export const setDefaultAcademicYear = protectedProcedure
  .input(setDefaultYearSchema)
  .handler(async ({ context, input }) => {
    const user = await requirePermission(context, "school:manage");
    return managed(() => setDefaultYear(context.db, input, user.id));
  });

export const getAcademicYearEvents = protectedProcedure
  .input(academicYearQuerySchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "school:manage");
    return academicYearEvents(context.db, input.id);
  });
