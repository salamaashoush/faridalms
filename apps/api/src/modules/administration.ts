import { placementDate } from "@faridalms/database/repositories/academic-years";
import { currentSchoolYear } from "@faridalms/database/repositories/academics";
import { upcomingEvents } from "@faridalms/database/repositories/communication";
import {
  publishNewsletter as publishNewsletterRow,
  ManagementError,
  managementOptions,
} from "@faridalms/database/repositories/management";
import {
  classDirectory,
  schoolAttendanceRate,
  schoolStats,
} from "@faridalms/database/repositories/school";
import {
  publishNewsletterSchema,
  managementOptionsSchema,
} from "@faridalms/domain/administration-schema";
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

export const publishNewsletter = protectedProcedure
  .input(publishNewsletterSchema)
  .handler(async ({ input, context }) => {
    await requirePermission(context, "announcements:manage");
    const year = await currentSchoolYear(context.db);
    return manage(() => publishNewsletterRow(context.db, input, year.id));
  });
