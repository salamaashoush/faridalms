import {
  getRequestProtocol,
  setResponseStatus,
  useSession,
} from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";

import type { Permission, Role } from "~/data/identity";

import { can } from "~/data/identity";
import { getDb, schema } from "~/db";
import { env } from "~/env";

export interface AppSession {
  isAuthenticated: boolean;
  userId: string;
  role: Role;
  accessToken: string;
}

/**
 * The client-safe projection of AppSession. Anything placed in router context
 * ends up in the SSR payload, so only this shape may cross that boundary: the
 * role is needed to pick a landing route, the access token never is.
 */
export interface AuthState {
  isAuthenticated: boolean;
  role: Role | null;
}

export function useAppSession() {
  return useSession<AppSession>({
    password: env.SESSION_SECRET,
    cookie: {
      // Keyed off the actual request protocol, not the build mode: the default
      // (`secure: true`) makes WebKit drop the cookie on any http:// origin, so
      // sign-in fails outright in Safari against a dev server or a plain-http
      // preview. xForwardedProto keeps this correct behind a TLS-terminating
      // proxy, where the origin request arrives as http.
      secure: getRequestProtocol({ xForwardedProto: true }) === "https",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    },
  });
}

export interface SessionUser {
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

export async function isAuthenticatedGuard() {
  const session = await useAppSession();
  if (!session.data.accessToken) {
    setResponseStatus(401);
    await session.clear();
    throw new Error("Unauthorized");
  }
}

/**
 * The signed-in user, resolved from the database on every request.
 *
 * Deliberately not cached in a module: a process-wide "current user" is how a
 * server hands one caller's profile to the next.
 */
export async function requireUser(): Promise<SessionUser> {
  await isAuthenticatedGuard();
  const session = await useAppSession();
  const db = getDb();

  const row = await db.query.users.findFirst({
    where: { id: session.data.userId, isActive: true },
    with: {
      guardianships: { columns: { studentId: true } },
      homeroomClasses: { columns: { id: true } },
      studentRecord: { columns: { id: true } },
    },
  });

  if (!row) {
    setResponseStatus(401);
    await session.clear();
    throw new Error("Unauthorized");
  }

  const ownStudentId = row.studentRecord?.id ?? null;

  return {
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
    classIds: row.homeroomClasses.map((taught) => taught.id),
  };
}

/** Authorise by capability. Throws 403 rather than returning a partial view. */
export async function requirePermission(
  permission: Permission,
): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) {
    setResponseStatus(403);
    throw new Error(`Forbidden: ${permission} is not granted to ${user.role}`);
  }
  return user;
}

/**
 * Every student id this user may read, resolved against the database.
 *
 * Admins see the whole school; teachers see whoever is enrolled in the classes
 * they teach; parents and students see the ids already on their session.
 */
export async function visibleStudentIds(user: SessionUser): Promise<string[]> {
  const db = getDb();

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
      where: { classId: { in: user.classIds } },
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
  requested: string,
): Promise<{ user: SessionUser; studentId: string; allowed: string[] }> {
  const user = await requireUser();
  const allowed = await visibleStudentIds(user);

  const fallback = allowed[0];
  if (!fallback) {
    setResponseStatus(403);
    throw new Error("Forbidden: no students are visible to this account");
  }

  if (!requested) {
    return { user, studentId: fallback, allowed };
  }
  if (!allowed.includes(requested)) {
    setResponseStatus(403);
    throw new Error("Forbidden: that student is not visible to this account");
  }
  return { user, studentId: requested, allowed };
}

/** Classes the caller may read, for the same reason as above. */
export async function visibleClassIds(user: SessionUser): Promise<string[]> {
  if (user.role === "admin") {
    const rows = await getDb().query.classes.findMany({
      columns: { id: true },
    });
    return rows.map((row) => row.id);
  }
  if (user.role === "teacher") {
    return user.classIds;
  }

  if (user.studentIds.length === 0) {
    return [];
  }
  const rows = await getDb().query.enrolments.findMany({
    columns: { classId: true },
    where: { studentId: { in: user.studentIds } },
  });
  return [...new Set(rows.map((row) => row.classId))];
}

export async function touchLastSignIn(userId: string): Promise<void> {
  const db = getDb();
  await db
    .update(schema.users)
    .set({ lastSignedInAt: new Date() })
    .where(eq(schema.users.id, userId));
}
