import {
  placementDate,
  workingYear,
} from "@faridalms/database/repositories/academic-years";
import { currentSchoolYear } from "@faridalms/database/repositories/academics";
import { upcomingEvents } from "@faridalms/database/repositories/communication";
import {
  saveSubject as saveSubjectRow,
  publishNewsletter as publishNewsletterRow,
  ManagementError,
  saveClass as saveClassRow,
  managementOptions,
} from "@faridalms/database/repositories/management";
import {
  classDirectory,
  listSubjects,
  schoolAttendanceRate,
  schoolStats,
} from "@faridalms/database/repositories/school";
import {
  saveSubjectSchema,
  publishNewsletterSchema,
  saveClassSchema,
  managementOptionsSchema,
} from "@faridalms/domain/administration-schema";
import { classDirectorySchema } from "@faridalms/domain/school-schema";
import { ORPCError } from "@orpc/server";

import { requirePermission } from "../authorization";
import { protectedProcedure } from "../procedure";

export const getAdminOverview = protectedProcedure.handler(
  async ({ context }) => {
    await requirePermission(context, "school:manage");
    const year = await currentSchoolYear(context.db);
    const [stats, rate, classes, upcoming] = await Promise.all([
      schoolStats(context.db, {
        id: year.id,
        on: placementDate(year, context.today),
      }),
      schoolAttendanceRate(context.db, year.id),
      classDirectory(
        context.db,
        {
          year: "",
          classId: "",
          q: "",
          page: 1,
          pageSize: 12,
          sort: "name",
          dir: "asc",
        },
        year.id,
      ),
      upcomingEvents(context.db, year.id, context.today, 6),
    ]);
    return {
      today: context.today,
      schoolYear: year.name,
      stats,
      attendanceRate: rate,
      classes: classes.rows,
      upcoming,
    };
  },
);

export const getAllClasses = protectedProcedure
  .input(classDirectorySchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "school:manage");
    const year = await manage(() => workingYear(context.db, input.year));
    return { ...(await classDirectory(context.db, input, year.id)), year };
  });

export const getSubjects = protectedProcedure.handler(async ({ context }) => {
  return listSubjects(context.db);
});

export const saveClass = protectedProcedure
  .input(saveClassSchema)
  .handler(async ({ input, context }) => {
    await requirePermission(context, "classes:manage");
    const year = await currentSchoolYear(context.db);
    return manage(() => saveClassRow(context.db, input, year.id));
  });
// Class, parent and student pickers serve editors gated on users:manage, so
// that permission is enough to list those choices.
const STUDENT_CHOICES = new Set(["classes", "parents", "students"]);

export const getManagementOptions = protectedProcedure
  .input(managementOptionsSchema)
  .handler(async ({ input, context }) => {
    await requirePermission(
      context,
      STUDENT_CHOICES.has(input.kind) &&
        !context.user.permissions.includes("school:manage")
        ? "users:manage"
        : "school:manage",
    );
    const year = await currentSchoolYear(context.db);
    return managementOptions(
      context.db,
      input.kind,
      input.q,
      year.id,
      input.selectedIds,
      input.studentId,
    );
  });
async function manage<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof ManagementError)
      throw new ORPCError(error.code, { message: error.message });
    throw error;
  }
}

export const saveSubject = protectedProcedure
  .input(saveSubjectSchema)
  .handler(async ({ input, context }) => {
    await requirePermission(context, "classes:manage");
    return manage(() => saveSubjectRow(context.db, input));
  });
export const publishNewsletter = protectedProcedure
  .input(publishNewsletterSchema)
  .handler(async ({ input, context }) => {
    await requirePermission(context, "announcements:manage");
    const year = await currentSchoolYear(context.db);
    return manage(() => publishNewsletterRow(context.db, input, year.id));
  });
