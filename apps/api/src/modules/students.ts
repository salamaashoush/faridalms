import { currentSchoolYear } from "@faridalms/database/repositories/academics";
import {
  getStudentProfile,
  listStudents,
} from "@faridalms/database/repositories/students";
import { studentScopedQuerySchema } from "@faridalms/domain/school-schema";
import { ORPCError } from "@orpc/server";

import {
  requirePermission,
  requireStudentAccess,
  visibleStudentIds,
  visibleClassIds,
} from "../authorization";
import { protectedProcedure } from "../procedure";

/** Students the signed-in user may switch between, for the header picker. */
export const getVisibleStudents = protectedProcedure.handler(
  async ({ context }) => {
    const user = await requirePermission(context, "student-profile:read");
    const ids = await visibleStudentIds(context, user);
    const year = await currentSchoolYear(context.db);
    return listStudents(context.db, ids, {
      schoolYearId: year.id,
      today: context.today,
    });
  },
);

export const getStudent = protectedProcedure
  .input(studentScopedQuerySchema)
  .handler(async ({ input: data, context }) => {
    const user = await requirePermission(context, "student-profile:read");
    const { studentId } = await requireStudentAccess(context, data.studentId);
    const access = {
      contacts: user.permissions.includes("student-contacts:read"),
      medical: user.permissions.includes("student-medical:read"),
      manage: user.permissions.includes("users:manage"),
      coursework: user.permissions.includes("assignments:read"),
      attendance: user.permissions.includes("attendance:read"),
      grades: user.permissions.includes("grades:read"),
    };
    const classes = await visibleClassIds(context, user);
    const year = await currentSchoolYear(context.db);
    const profile = await getStudentProfile(
      context.db,
      studentId,
      {
        ...access,
        historyClassIds: user.role === "teacher" ? classes : null,
        visibleClassIds: classes,
      },
      { schoolYearId: year.id, today: context.today },
    );
    if (!profile) {
      // Router-aware: the route renders its notFoundComponent instead of the
      // error boundary, and SSR responds 404 rather than 200.
      throw new ORPCError("NOT_FOUND");
    }
    return { today: context.today, profile, access };
  });
