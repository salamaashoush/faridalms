import type { ChangePasswordInput } from "@faridalms/domain/first-sign-in";
import type { Workspace } from "@faridalms/domain/workspace";

import { changePasswordSchema } from "@faridalms/domain/first-sign-in";
import { childSessionSchema } from "@faridalms/domain/identity-schema";
import { createIsomorphicFn, createServerFn } from "@tanstack/react-start";
import {
  deleteCookie,
  getCookie,
  setCookie,
} from "@tanstack/react-start/server";
import * as v from "valibot";

import {
  acceptInviteLinkSchema,
  badgeLoginSchema,
  forgotPasswordSchema,
  inviteLinkSchema,
  loginSchema,
} from "~/schema/auth";

import {
  backend,
  currentSchool,
  guardianCookie,
  isSecureRequest,
  SCHOOL_COOKIE,
  sessionCookie,
} from "./backend";
import { checked } from "./input";

export interface AuthState {
  isAuthenticated: boolean;
  workspace: Workspace | null;
  school: string | null;
  /** A guardian handed this device to a young child and waits to return. */
  childMode: boolean;
}

const signedOut = (school: string | null): AuthState => ({
  isAuthenticated: false,
  workspace: null,
  school,
  childMode: false,
});

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    expires,
    secure: isSecureRequest(),
  };
}

/** The guardian's session parked during a hand-over: its token and expiry. */
function parked(school: string) {
  const value = getCookie(guardianCookie(school));
  const [token, expires] = value?.split("~") ?? [];
  return token && expires
    ? { token, expires: new Date(Number(expires)) }
    : null;
}

/**
 * Ends a hand-over that is left behind: the guardian's parked session is
 * signed out rather than given to whoever holds the device next.
 */
async function dropGuardian(school: string) {
  const guardian = parked(school);
  if (!guardian) return;
  try {
    await backend(school, guardian.token).identity.signOut();
  } catch (error) {
    if (!isUnauthorized(error)) throw error;
  }
  deleteCookie(guardianCookie(school), { path: "/" });
}

function isUnauthorized(error: unknown) {
  return (
    error instanceof Error && "code" in error && error.code === "UNAUTHORIZED"
  );
}

export const getAuthState = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthState> => {
    const school = currentSchool();
    if (!school) return signedOut(school);
    if (!getCookie(sessionCookie(school))) {
      await dropGuardian(school);
      return signedOut(school);
    }
    try {
      const user = await backend(school).identity.currentUser();
      return {
        isAuthenticated: true,
        workspace: user.workspace,
        school,
        childMode: parked(school) !== null,
      };
    } catch (error) {
      if (!isUnauthorized(error)) throw error;
      // The child's session closed while the device sat idle; the way back
      // is the guardian signing in again, not a session left for anyone.
      await dropGuardian(school);
      return signedOut(school);
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
      loginName: data.loginName,
      password: data.password,
    });
    await dropGuardian(school);
    const options = cookieOptions(session.expiresAt);
    setCookie(sessionCookie(school), session.token, options);
    setCookie(SCHOOL_COOKIE, school, options);
    return {
      isAuthenticated: true,
      workspace: session.workspace,
      school,
      childMode: false,
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
    await dropGuardian(data.school);
    const options = cookieOptions(session.expiresAt);
    setCookie(sessionCookie(data.school), session.token, options);
    setCookie(SCHOOL_COOKIE, data.school, options);
    return {
      isAuthenticated: true,
      workspace: session.workspace,
      school: data.school,
      childMode: false,
    };
  });

/** Whose password an emailed link chooses, for the page the link opens. */
export const readInvite = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof inviteLinkSchema>) =>
    v.parse(inviteLinkSchema, input),
  )
  .handler(({ data }) =>
    backend(data.school).identity.invite({ secret: data.secret }),
  );

export const acceptInvite = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof acceptInviteLinkSchema>) =>
    v.parse(acceptInviteLinkSchema, input),
  )
  .handler(({ data }) =>
    backend(data.school).identity.acceptInvite({
      secret: data.secret,
      password: data.password,
    }),
  );

/** Asks for a link that replaces a forgotten password. */
export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof forgotPasswordSchema>) =>
    v.parse(forgotPasswordSchema, input),
  )
  .handler(({ data }) =>
    backend(currentSchool() ?? data.school).identity.requestPasswordReset({
      loginName: data.loginName,
    }),
  );

export const changeOwnPassword = createServerFn({ method: "POST" })
  .validator((input: ChangePasswordInput) =>
    v.parse(changePasswordSchema, input),
  )
  .handler(({ data }) => backend().identity.changePassword(data));

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
      await dropGuardian(school);
    }
    return signedOut(school);
  },
);

/**
 * Hands the device to a young child of the signed-in guardian. The guardian's
 * session is parked in its own cookie, which the child's pages never read.
 */
export const startChildMode = createServerFn({ method: "POST" })
  .validator(checked(childSessionSchema))
  .handler(async ({ data }): Promise<AuthState> => {
    const school = currentSchool();
    const guardian = school ? getCookie(sessionCookie(school)) : undefined;
    if (!school || !guardian) return signedOut(school);
    const session = await backend(school).identity.childSession(data);
    const until = new Date(session.guardianExpiresAt);
    setCookie(
      guardianCookie(school),
      `${guardian}~${until.getTime()}`,
      cookieOptions(until),
    );
    setCookie(
      sessionCookie(school),
      session.token,
      cookieOptions(session.expiresAt),
    );
    return {
      isAuthenticated: true,
      workspace: session.workspace,
      school,
      childMode: true,
    };
  });

/** Ends a hand-over: the child's session closes and the guardian's returns. */
export const endChildMode = createServerFn({ method: "POST" }).handler(
  async (): Promise<AuthState> => {
    const school = currentSchool();
    const guardian = school ? parked(school) : null;
    if (!school || !guardian) return signedOut(school);
    try {
      await backend(school).identity.signOut();
    } catch (error) {
      if (!isUnauthorized(error)) throw error;
    }
    deleteCookie(guardianCookie(school), { path: "/" });
    try {
      const user = await backend(school, guardian.token).identity.currentUser();
      setCookie(
        sessionCookie(school),
        guardian.token,
        cookieOptions(guardian.expires),
      );
      return {
        isAuthenticated: true,
        workspace: user.workspace,
        school,
        childMode: false,
      };
    } catch (error) {
      if (!isUnauthorized(error)) throw error;
      deleteCookie(sessionCookie(school), { path: "/" });
      return signedOut(school);
    }
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
