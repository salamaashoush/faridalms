import { createServerFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import * as v from "valibot";

import type { LoginSchemaInput } from "~/schema/auth";
import type { AppSession, AuthState } from "~/utils/session";

import { ROLE_PERMISSIONS } from "~/data/identity";
import { getDb } from "~/db";
import { loginSchema } from "~/schema/auth";
import { requireUser, touchLastSignIn, useAppSession } from "~/utils/session";

// Router context is dehydrated into the SSR HTML, so this returns the auth flag
// and the role alone -- never the access token or the profile behind it.
export const getAuthState = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthState> => {
    const session = await useAppSession();
    return {
      isAuthenticated: session.data.isAuthenticated === true,
      role: session.data.isAuthenticated ? (session.data.role ?? null) : null,
    };
  },
);

export const login = createServerFn({ method: "POST" })
  .validator((payload: LoginSchemaInput) => v.parse(loginSchema, payload))
  .handler(async ({ data }): Promise<AuthState> => {
    const db = getDb();
    const user = await db.query.users.findFirst({
      where: { email: data.email.trim().toLowerCase(), isActive: true },
    });

    // One failure message for both a missing account and a wrong password, so
    // the response cannot be used to enumerate who has an account here.
    const ok = user
      ? await Bun.password.verify(data.password, user.passwordHash)
      : false;
    if (!user || !ok) {
      setResponseStatus(400);
      throw new Error("Wrong email or password");
    }

    const session = await useAppSession();
    const sessionData: AppSession = {
      isAuthenticated: true,
      userId: user.id,
      role: user.role,
      accessToken: `demo-token-${user.id}`,
    };
    await session.update(sessionData);
    await touchLastSignIn(user.id);
    return { isAuthenticated: true, role: user.role };
  });

export const logout = createServerFn({ method: "POST" }).handler(
  async (): Promise<AuthState> => {
    const session = await useAppSession();
    await session.clear();
    return { isAuthenticated: false, role: null };
  },
);

/** The signed-in user plus the capabilities their role grants. */
export const getCurrentUser = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requireUser();
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      title: user.title,
      avatarUrl: user.avatarUrl,
      studentIds: user.studentIds,
      ownStudentId: user.ownStudentId,
      classIds: user.classIds,
      permissions: ROLE_PERMISSIONS[user.role],
    };
  },
);
