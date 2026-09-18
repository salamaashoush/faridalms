import type { Role } from "@faridalms/domain/identity";

import { createIsomorphicFn, createServerFn } from "@tanstack/react-start";
import {
  deleteCookie,
  getCookie,
  getRequestProtocol,
  setCookie,
} from "@tanstack/react-start/server";
import * as v from "valibot";

import { loginSchema } from "~/schema/auth";

import { backend, SESSION_COOKIE } from "./backend";

export interface AuthState {
  isAuthenticated: boolean;
  role: Role | null;
}

export const getAuthState = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthState> => {
    try {
      const user = await backend().auth.currentUser();
      return { isAuthenticated: true, role: user.role };
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "UNAUTHORIZED"
      )
        return { isAuthenticated: false, role: null };
      throw error;
    }
  },
);

export const login = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof loginSchema>) =>
    v.parse(loginSchema, input),
  )
  .handler(async ({ data }): Promise<AuthState> => {
    const session = await backend().auth.signIn(data);
    setCookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      expires: session.expiresAt,
      secure: getRequestProtocol({ xForwardedProto: true }) === "https",
    });
    return { isAuthenticated: true, role: session.role };
  });

export const logout = createServerFn({ method: "POST" }).handler(
  async (): Promise<AuthState> => {
    try {
      await backend().auth.signOut();
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          "code" in error &&
          error.code === "UNAUTHORIZED"
        )
      )
        throw error;
    }
    deleteCookie(SESSION_COOKIE, { path: "/" });
    return { isAuthenticated: false, role: null };
  },
);

export const getCurrentUser = createServerFn({ method: "GET" }).handler(() =>
  backend().auth.currentUser(),
);

export const getWorkspacePreferences = createIsomorphicFn()
  .server(() => ({ sidebarOpen: getCookie("sidebar_state") !== "false" }))
  .client(() => ({
    sidebarOpen: !document.cookie
      .split(";")
      .some((cookie) => cookie.trim() === "sidebar_state=false"),
  }));
