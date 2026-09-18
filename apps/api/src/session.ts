import { schools, sessions } from "@faridalms/database/control-schema";
import { schoolDate } from "@faridalms/domain/school";
import { ORPCError } from "@orpc/server";
import { and, eq, gt } from "drizzle-orm";
import { createHash } from "node:crypto";

import type { ApiContext, SchoolContext } from "./context";

import { loadUser } from "./authorization";

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type Session = Omit<SchoolContext, keyof ApiContext> & {
  release: () => void;
};

/**
 * Resolves the bearer token to a school database lease and the current user.
 * Every caller releases the lease in a `finally`, whether it came through oRPC
 * or a raw file route.
 */
export async function authenticate(context: ApiContext): Promise<Session> {
  const authorization = context.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    throw new ORPCError("UNAUTHORIZED");
  const sessionHash = hashToken(authorization.slice(7));
  const [record] = await context.control
    .select({ session: sessions, school: schools })
    .from(sessions)
    .innerJoin(schools, eq(sessions.schoolId, schools.id))
    .where(
      and(
        eq(sessions.tokenHash, sessionHash),
        gt(sessions.expiresAt, new Date()),
        eq(schools.isActive, true),
      ),
    );
  if (!record) throw new ORPCError("UNAUTHORIZED");
  const lease = await context.pools.acquire(record.school);
  try {
    const user = await loadUser(lease.db, record.session.userId);
    return {
      db: lease.db,
      school: record.school,
      user,
      sessionHash,
      today: schoolDate(record.school.timeZone),
      release: lease.release,
    };
  } catch (error) {
    lease.release();
    throw error;
  }
}
