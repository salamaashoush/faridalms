import type { ChangePasswordInput } from "@faridalms/domain/first-sign-in";
import type { Workspace } from "@faridalms/domain/workspace";

import { changePasswordSchema } from "@faridalms/domain/first-sign-in";
import {
  childSessionSchema,
  discoverResetSchema,
  discoverSignInSchema,
  redeemHandoffSchema,
} from "@faridalms/domain/identity-schema";
import { createIsomorphicFn, createServerFn } from "@tanstack/react-start";
import {
  deleteCookie,
  getCookie,
  getCookies,
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
import { hostHref } from "~/utils/host";

import {
  backend,
  currentSchool,
  guardianCookie,
  isSecureRequest,
  rememberedSchool,
  REMEMBER_SECONDS,
  SCHOOL_COOKIE,
  sessionCookie,
} from "./backend";
import { checked } from "./input";
import { currentPlace } from "./place";

export interface AuthState {
  isAuthenticated: boolean;
  workspace: Workspace | null;
  /** The school whose portal this is; none on the bare domain. */
  school: string | null;
  /** On the bare domain, the school this browser chose there last. */
  remembered?: string;
  /** A guardian handed this device to a young child and waits to return. */
  childMode: boolean;
}

const signedOut = (school: string | null): AuthState => ({
  isAuthenticated: false,
  workspace: null,
  school,
  childMode: false,
});

/**
 * The school whose portal this request reached. Signing in, choosing a
 * password and asking for a reset happen only there, so no session is ever
 * set on a host that is not the school's own.
 */
function portalSchool(): string {
  const school = currentSchool();
  if (!school) throw new Error("Only a school's portal signs people in");
  return school;
}

const SESSION_COOKIE = /^(?:__Host-)?([sg])-([a-z0-9-]+)$/;

/**
 * Ends the sessions a browser still holds on the bare domain from before
 * each school had its own origin: each is signed out at the API and its
 * cookie removed, and none is ever read.
 */
async function dropBareSessions() {
  if (currentPlace().kind !== "bare") return;
  for (const [name, value] of Object.entries(getCookies())) {
    const found = SESSION_COOKIE.exec(name);
    if (!found) continue;
    const [, kind, school = ""] = found;
    const token = kind === "s" ? value : value.split("~")[0];
    if (token) {
      try {
        await backend(school, token).identity.signOut();
      } catch (error) {
        if (!isUnauthorized(error)) console.error(error);
      }
    }
    dropCookie(name);
  }
}

/**
 * Removes a cookie. Over HTTPS the session cookies carry the `__Host-`
 * prefix, and a browser ignores any change to such a cookie, removal
 * included, unless it is marked Secure: signing out left the session in
 * place.
 */
function dropCookie(name: string) {
  deleteCookie(name, { path: "/", secure: name.startsWith("__Host-") });
}

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
  dropCookie(guardianCookie(school));
}

function isUnauthorized(error: unknown) {
  return (
    error instanceof Error && "code" in error && error.code === "UNAUTHORIZED"
  );
}

export const getAuthState = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthState> => {
    const school = currentSchool();
    if (!school) {
      await dropBareSessions();
      const remembered = rememberedSchool();
      return remembered ? { ...signedOut(null), remembered } : signedOut(null);
    }
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
    const school = portalSchool();
    const session = await backend(school).identity.signIn({
      loginName: data.loginName,
      password: data.password,
    });
    await dropGuardian(school);
    const options = cookieOptions(session.expiresAt);
    setCookie(sessionCookie(school), session.token, options);
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
    const school = portalSchool();
    const api = backend(school);
    const session = await api.badges.signIn({ secret: data.secret });
    if (getCookie(sessionCookie(school))) {
      try {
        await api.identity.signOut();
      } catch (error) {
        if (!isUnauthorized(error)) throw error;
      }
    }
    await dropGuardian(school);
    const options = cookieOptions(session.expiresAt);
    setCookie(sessionCookie(school), session.token, options);
    return {
      isAuthenticated: true,
      workspace: session.workspace,
      school,
      childMode: false,
    };
  });

/** Whose password an emailed link chooses, for the page the link opens. */
export const readInvite = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof inviteLinkSchema>) =>
    v.parse(inviteLinkSchema, input),
  )
  .handler(({ data }) =>
    backend(portalSchool()).identity.invite({
      secret: data.secret,
    }),
  );

export const acceptInvite = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof acceptInviteLinkSchema>) =>
    v.parse(acceptInviteLinkSchema, input),
  )
  .handler(({ data }) =>
    backend(portalSchool()).identity.acceptInvite({
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
    backend(portalSchool()).identity.requestPasswordReset({
      loginName: data.loginName,
    }),
  );

function bareOnly() {
  if (currentPlace().kind !== "bare")
    throw new Error("Only the bare portal domain finds a person's school");
}

/**
 * Sign-in on the bare portal domain. It opens no session here: a proved
 * password comes back as the address of a handoff on the school's own
 * portal, which the browser goes to, and the bare domain remembers the
 * school for next time. Several schools come back as their names.
 */
export const discoverSignIn = createServerFn({ method: "POST" })
  .validator(checked(discoverSignInSchema))
  .handler(
    async ({
      data,
    }): Promise<
      | { href: string }
      | {
          schools: {
            slug: string;
            nameEn: string | null;
            nameAr: string | null;
          }[];
        }
    > => {
      bareOnly();
      const answer = await backend(null).identity.discoverSignIn(data);
      if (!("handoff" in answer)) return { schools: answer.schools };
      const { slug, portalHost, token } = answer.handoff;
      setCookie(SCHOOL_COOKIE, slug, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: REMEMBER_SECONDS,
        secure: isSecureRequest(),
      });
      // The secret rides in the fragment, which never reaches a server log
      // or a Referer.
      return { href: hostHref(portalHost, `/auth/handoff#${token}`) };
    },
  );

/** The public key the bare domain's forms render their human check with, if any. */
export const getHumanCheck = createServerFn({ method: "GET" }).handler(() => {
  bareOnly();
  return backend(null).identity.humanCheck();
});

/** A forgotten password asked for on the bare portal domain. */
export const discoverReset = createServerFn({ method: "POST" })
  .validator(checked(discoverResetSchema))
  .handler(({ data }) => {
    bareOnly();
    return backend(null).identity.discoverReset(data);
  });

/** Opens the session a handoff from the bare portal domain carries, on the school's portal. */
export const redeemHandoff = createServerFn({ method: "POST" })
  .validator(checked(redeemHandoffSchema))
  .handler(async ({ data }): Promise<AuthState> => {
    const school = portalSchool();
    const session = await backend(school).identity.redeemHandoff(data);
    await dropGuardian(school);
    setCookie(
      sessionCookie(school),
      session.token,
      cookieOptions(session.expiresAt),
    );
    return {
      isAuthenticated: true,
      workspace: session.workspace,
      school,
      childMode: false,
    };
  });

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
      dropCookie(sessionCookie(school));
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
    dropCookie(guardianCookie(school));
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
      dropCookie(sessionCookie(school));
      return signedOut(school);
    }
  },
);

export const getCurrentUser = createServerFn({ method: "GET" }).handler(() =>
  backend().identity.currentUser(),
);

/** The sections whose More the person left open, kept like the sidebar's own state. */
export const SIDEBAR_MORE_COOKIE = "sidebar_more";

const sectionIds = (value: string | undefined) =>
  (value ?? "").split(".").filter((id) => /^[a-z]+$/.test(id));

export const getWorkspacePreferences = createIsomorphicFn()
  .server(() => ({
    sidebarOpen: getCookie("sidebar_state") !== "false",
    moreOpen: sectionIds(getCookie(SIDEBAR_MORE_COOKIE)),
  }))
  .client(() => {
    const cookies = document.cookie.split(";").map((cookie) => cookie.trim());
    return {
      sidebarOpen: !cookies.includes("sidebar_state=false"),
      moreOpen: sectionIds(
        cookies
          .find((cookie) => cookie.startsWith(`${SIDEBAR_MORE_COOKIE}=`))
          ?.slice(SIDEBAR_MORE_COOKIE.length + 1),
      ),
    };
  });
