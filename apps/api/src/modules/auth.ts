import { schema } from "@faridalms/database";
import {
  loginAttempts,
  schools,
  sessions,
} from "@faridalms/database/control-schema";
import { getFeatures } from "@faridalms/database/repositories/learning";
import { signInSchema } from "@faridalms/domain/auth-schema";
import { ORPCError } from "@orpc/server";
import { and, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";

import { hashToken, protectedProcedure, publicProcedure } from "../procedure";

const dummyHash = await Bun.password.hash(randomBytes(32).toString("hex"));

export const signIn = publicProcedure
  .input(signInSchema)
  .handler(async ({ input, context }) => {
    const key = hashToken(`${input.school}:${input.email}`);
    const [attempt] = await context.control
      .insert(loginAttempts)
      .values({ key, resetsAt: new Date(Date.now() + 15 * 60_000) })
      .onConflictDoUpdate({
        target: loginAttempts.key,
        set: {
          count: sql`case when ${loginAttempts.resetsAt} < now() then 1 else ${loginAttempts.count} + 1 end`,
          resetsAt: sql`case when ${loginAttempts.resetsAt} < now() then now() + interval '15 minutes' else ${loginAttempts.resetsAt} end`,
        },
      })
      .returning();
    if (!attempt || attempt.count > 10)
      throw new ORPCError("TOO_MANY_REQUESTS");
    const [school] = await context.control
      .select()
      .from(schools)
      .where(and(eq(schools.slug, input.school), eq(schools.isActive, true)));
    if (!school) {
      await Bun.password.verify(input.password, dummyHash);
      throw new ORPCError("BAD_REQUEST", {
        message: "auth.invalid_credentials",
      });
    }
    const lease = await context.pools.acquire(school);
    try {
      const user = await lease.db.query.users.findFirst({
        where: { email: input.email, isActive: true },
      });
      const valid = await Bun.password.verify(
        input.password,
        user?.passwordHash ?? dummyHash,
      );
      if (!user || !valid)
        throw new ORPCError("BAD_REQUEST", {
          message: "auth.invalid_credentials",
        });
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
      await context.control.insert(sessions).values({
        tokenHash: hashToken(token),
        schoolId: school.id,
        userId: user.id,
        expiresAt,
      });
      await lease.db
        .update(schema.users)
        .set({ lastSignedInAt: new Date() })
        .where(eq(schema.users.id, user.id));
      await context.control
        .delete(loginAttempts)
        .where(eq(loginAttempts.key, key));
      return { token, expiresAt, role: user.role };
    } finally {
      lease.release();
    }
  });

export const signOut = protectedProcedure.handler(async ({ context }) => {
  await context.control
    .delete(sessions)
    .where(eq(sessions.tokenHash, context.sessionHash));
  return { signedOut: true };
});

export const currentUser = protectedProcedure.handler(async ({ context }) => ({
  ...context.user,
  features: await getFeatures(context.db),
  school: {
    id: context.school.id,
    slug: context.school.slug,
    name: context.school.name,
    timeZone: context.school.timeZone,
  },
}));
