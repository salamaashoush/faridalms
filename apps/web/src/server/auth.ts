import type { Workspace } from "@faridalms/domain/workspace";

import { createIsomorphicFn, createServerFn } from "@tanstack/react-start";
import {
  deleteCookie,
  getCookie,
  setCookie,
} from "@tanstack/react-start/server";
import * as v from "valibot";

import { badgeLoginSchema, loginSchema } from "~/schema/auth";

import {
  backend,
  currentSchool,
  isSecureRequest,
  SCHOOL_COOKIE,
  sessionCookie,
} from "./backend";

export interface AuthState {
  isAuthenticated: boolean;
  workspace: Workspace | null;
  school: string | null;
}

const signedOut = (school: string | null): AuthState => ({
  isAuthenticated: false,
  workspace: null,
  school,
});

function isUnauthorized(error: unknown) {
  return (
    error instanceof Error && "code" in error && error.code === "UNAUTHORIZED"
  );
}

export const getAuthState = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthState> => {
    const school = currentSchool();
    if (!school || !getCookie(sessionCookie(school))) return signedOut(school);
    try {
      const user = await backend(school).identity.currentUser();
      return { isAuthenticated: true, workspace: user.workspace, school };
    } catch (error) {
      if (isUnauthorized(error)) return signedOut(school);
      throw error;
    }
  },
);

export const login = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof loginSchema>) =>
    v.parse(loginSchema, input),
  )
  .handler(async ({ data }): Promise<AuthState> => {
    const school = currentSchool() ?? data.school;
    const session = await backend(school).identity.signIn({
      loginName: data.email,
      password: data.password,
    });
    const options = {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      expires: session.expiresAt,
      secure: isSecureRequest(),
    };
    setCookie(sessionCookie(school), session.token, options);
    setCookie(SCHOOL_COOKIE, school, options);
    return {
      isAuthenticated: true,
      workspace: session.workspace,
      school,
    };
  });

/**
 * Sign-in with a scanned badge. On a device the class shares, the last
 * child's session is ended once the new one opens, so a scan never leaves
 * two children signed in on the same tablet.
 */
export const badgeLogin = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof badgeLoginSchema>) =>
    v.parse(badgeLoginSchema, input),
  )
  .handler(async ({ data }): Promise<AuthState> => {
    const api = backend(data.school);
    const session = await api.identity.badgeSignIn({ secret: data.secret });
    if (getCookie(sessionCookie(data.school))) {
      try {
        await api.identity.signOut();
      } catch (error) {
        if (!isUnauthorized(error)) throw error;
      }
    }
    const options = {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      expires: session.expiresAt,
      secure: isSecureRequest(),
    };
    setCookie(sessionCookie(data.school), session.token, options);
    setCookie(SCHOOL_COOKIE, data.school, options);
    return {
      isAuthenticated: true,
      workspace: session.workspace,
      school: data.school,
    };
  });

export const logout = createServerFn({ method: "POST" }).handler(
  async (): Promise<AuthState> => {
    const school = currentSchool();
    if (school) {
      try {
        await backend(school).identity.signOut();
      } catch (error) {
        if (!isUnauthorized(error)) throw error;
      }
      deleteCookie(sessionCookie(school), { path: "/" });
    }
    return signedOut(school);
  },
);

export const getCurrentUser = createServerFn({ method: "GET" }).handler(() =>
  backend().identity.currentUser(),
);

export const getWorkspacePreferences = createIsomorphicFn()
  .server(() => ({ sidebarOpen: getCookie("sidebar_state") !== "false" }))
  .client(() => ({
    sidebarOpen: !document.cookie
      .split(";")
      .some((cookie) => cookie.trim() === "sidebar_state=false"),
  }));
