import type { Database } from "@faridalms/database";
import type { AssessmentScope } from "@faridalms/domain/academic-access";
import type { Permission, Role } from "@faridalms/domain/identity";

import { effectiveAccess } from "@faridalms/database/repositories/access";
import { ORPCError } from "@orpc/server";

import type { SchoolContext } from "./context";

export interface SessionUser {
  permissions: Permission[];
  accessRoleId: string | null;
  accessRevision: number;
  id: string;
  email: string;
  name: string;
  role: Role;
  title: string | null;
  avatarUrl: string | null;
  /** Students this user may see. Empty for admins, who see all of them. */
  studentIds: string[];
  /** The student record this user *is*, when they are one. */
  ownStudentId: string | null;
  /** Classes this user teaches. */
  classIds: string[];
}

export async function loadUser(
  db: Database,
  userId: string,
): Promise<SessionUser> {
  const row = await db.query.users.findFirst({
    where: { id: userId, isActive: true },
    with: {
      guardianships: { columns: { studentId: true } },
      homeroomClasses: { columns: { id: true } },
      studentRecord: { columns: { id: true } },
    },
  });

  if (!row) {
    throw new ORPCError("UNAUTHORIZED");
  }

  const ownStudentId = row.studentRecord?.id ?? null;
  const teaching =
    row.role === "teacher"
      ? await db.query.classSubjects.findMany({
          where: { teacherId: row.id },
          columns: { classId: true },
        })
      : [];

  return {
    ...(await effectiveAccess(db, row)),
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    title: row.title,
    avatarUrl: row.avatarUrl,
    studentIds:
      row.role === "student"
        ? ownStudentId
          ? [ownStudentId]
          : []
        : row.guardianships.map((link) => link.studentId),
    ownStudentId,
    classIds: [
      ...new Set([
        ...row.homeroomClasses.map((taught) => taught.id),
        ...teaching.map((subject) => subject.classId),
      ]),
    ],
  };
}

/** Authorise by capability. Throws 403 rather than returning a partial view. */
export async function requirePermission(
  context: SchoolContext,
  permission: Permission,
): Promise<SessionUser> {
  const user = context.user;
  if (!user.permissions.includes(permission)) {
    throw new ORPCError("FORBIDDEN");
  }
  return user;
}

export function assessmentScope(
  context: SchoolContext,
  permission: "submissions:grade" | "assignments:author" = "submissions:grade",
): AssessmentScope {
  if (!context.user.permissions.includes(permission)) return { kind: "none" };
  return context.user.role === "admin"
    ? { kind: "school" }
    : { kind: "teacher", userId: context.user.id };
}

/**
 * Every student id this user may read, resolved against the database.
 *
 * Admins see the whole school; teachers see whoever is enrolled in the classes
 * they teach; parents and students see the ids already on their session.
 */
export async function visibleStudentIds(
  context: SchoolContext,
  user: SessionUser,
): Promise<string[]> {
  const db = context.db;

  if (user.role === "admin") {
    const rows = await db.query.students.findMany({ columns: { id: true } });
    return rows.map((row) => row.id);
  }

  if (user.role === "teacher") {
    if (user.classIds.length === 0) {
      return [];
    }
    const rows = await db.query.enrolments.findMany({
      columns: { studentId: true },
      where: {
        classId: { in: user.classIds },
        class: { schoolYear: { isCurrent: true } },
        since: { lte: context.today },
        OR: [{ until: { isNull: true } }, { until: { gt: context.today } }],
      },
    });
    return [...new Set(rows.map((row) => row.studentId))];
  }

  return user.studentIds;
}

/**
 * Narrow a requested student id to one the caller may actually see.
 *
 * Authorisation belongs on the server, so a parent passing another family's
 * student id gets a 403 rather than that family's data. An empty request means
 * "the first child", which is what makes a bare route work.
 */
export async function requireStudentAccess(
  context: SchoolContext,
  requested: string,
): Promise<{ user: SessionUser; studentId: string; allowed: string[] }> {
  const user = context.user;
  const allowed = await visibleStudentIds(context, user);

  const fallback = allowed[0];
  if (!fallback) {
    throw new ORPCError("FORBIDDEN");
  }

  if (!requested) {
    return { user, studentId: fallback, allowed };
  }
  if (!allowed.includes(requested)) {
    throw new ORPCError("FORBIDDEN");
  }
  return { user, studentId: requested, allowed };
}

/** Classes the caller may read, for the same reason as above. */
export async function visibleClassIds(
  context: SchoolContext,
  user: SessionUser,
): Promise<string[]> {
  if (user.role === "admin") {
    const rows = await context.db.query.classes.findMany({
      columns: { id: true },
    });
    return rows.map((row) => row.id);
  }
  if (user.role === "teacher") {
    const rows = await context.db.query.classes.findMany({
      where: { id: { in: user.classIds }, schoolYear: { isCurrent: true } },
      columns: { id: true },
    });
    return rows.map((row) => row.id);
  }

  if (user.studentIds.length === 0) {
    return [];
  }
  const rows = await context.db.query.enrolments.findMany({
    columns: { classId: true },
    where: {
      studentId: { in: user.studentIds },
      class: { schoolYear: { isCurrent: true } },
      since: { lte: context.today },
      OR: [{ until: { isNull: true } }, { until: { gt: context.today } }],
    },
  });
  return [...new Set(rows.map((row) => row.classId))];
}
