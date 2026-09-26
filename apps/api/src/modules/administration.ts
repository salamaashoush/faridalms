import { schools, sessions } from "@faridalms/database/control-schema";
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
  saveUser as saveUserRow,
  saveStudent as saveStudentRow,
  saveClass as saveClassRow,
  managementOptions,
  studentForManagement,
  studentsWithNameAndBirthdate,
} from "@faridalms/database/repositories/management";
import {
  classDirectory,
  listSubjects,
  schoolAttendanceRate,
  schoolStats,
} from "@faridalms/database/repositories/school";
import {
  studentDirectory,
  staffDirectory,
} from "@faridalms/database/repositories/students";
import {
  schoolProfileSchema,
  saveSubjectSchema,
  publishNewsletterSchema,
  saveUserSchema,
  saveStudentSchema,
  saveClassSchema,
  managementOptionsSchema,
  studentMatchesSchema,
} from "@faridalms/domain/administration-schema";
import {
  studentDirectorySchema,
  staffDirectorySchema,
  classDirectorySchema,
} from "@faridalms/domain/school-schema";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

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

export const getAllStudents = protectedProcedure
  .input(studentDirectorySchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "users:read");
    const year = await manage(() => workingYear(context.db, input.year));
    return {
      ...(await studentDirectory(context.db, input, {
        schoolYearId: year.id,
        on: placementDate(year, context.today),
      })),
      year,
    };
  });

export const getAllUsers = protectedProcedure
  .input(staffDirectorySchema)
  .handler(async ({ context, input }) => {
    await requirePermission(context, "users:read");
    return staffDirectory(context.db, input);
  });

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

export const getSchoolSettings = protectedProcedure.handler(
  async ({ context }) => {
    await requirePermission(context, "school:manage");
    const year = await currentSchoolYear(context.db);
    const terms = await context.db.query.terms.findMany({
      where: { schoolYearId: year.id },
      orderBy: { startsOn: "asc" },
      columns: { id: true, name: true, startsOn: true, endsOn: true },
    });

    return {
      school: { name: context.school.name, timeZone: context.school.timeZone },
      year: { name: year.name, startsOn: year.startsOn, endsOn: year.endsOn },
      terms,
    };
  },
);

export const saveUser = protectedProcedure
  .input(saveUserSchema)
  .handler(async ({ input, context }) => {
    const actor = await requirePermission(context, "users:manage");
    const passwordHash = input.password
      ? await Bun.password.hash(input.password, { algorithm: "argon2id" })
      : undefined;
    const saved = await manage(() =>
      saveUserRow(context.db, input, actor.id, passwordHash),
    );
    if (input.id && (passwordHash || !input.isActive))
      await context.control
        .delete(sessions)
        .where(
          and(
            eq(sessions.schoolId, context.school.id),
            eq(sessions.userId, input.id),
          ),
        );
    return saved;
  });
export const saveStudent = protectedProcedure
  .input(saveStudentSchema)
  .handler(async ({ input, context }) => {
    await requirePermission(context, "users:manage");
    const year = await currentSchoolYear(context.db);
    return manage(() =>
      saveStudentRow(context.db, input, year.id, context.today),
    );
  });
export const saveClass = protectedProcedure
  .input(saveClassSchema)
  .handler(async ({ input, context }) => {
    await requirePermission(context, "classes:manage");
    const year = await currentSchoolYear(context.db);
    return manage(() => saveClassRow(context.db, input, year.id));
  });
// saveStudent needs only users:manage and takes a class, guardians and an
// account, so whoever may save a student may also list those choices.
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
export const getStudentForManagement = protectedProcedure
  .input(v.object({ id: v.pipe(v.string(), v.uuid()) }))
  .handler(async ({ input, context }) => {
    await requirePermission(context, "users:manage");
    const year = await currentSchoolYear(context.db);
    return manage(() =>
      studentForManagement(context.db, input.id, year.id, context.today),
    );
  });
export const getStudentMatches = protectedProcedure
  .input(studentMatchesSchema)
  .handler(async ({ input, context }) => {
    await requirePermission(context, "users:manage");
    return studentsWithNameAndBirthdate(context.db, input);
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

export const saveSchoolProfile = protectedProcedure
  .input(schoolProfileSchema)
  .handler(async ({ input, context }) => {
    await requirePermission(context, "school:manage");
    await context.control
      .update(schools)
      .set(input)
      .where(eq(schools.id, context.school.id));
    return { saved: true };
  });
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
