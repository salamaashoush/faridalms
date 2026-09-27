import { createApiClient, isHiddenRecordError } from "@faridalms/api-client";
import { notFound } from "@tanstack/react-router";
import {
  getCookie,
  getRequestHeader,
  getRequestProtocol,
} from "@tanstack/react-start/server";

import { env } from "~/env";
import { getLocale } from "~/i18n/runtime";

/** The school chosen at sign-in, for hosts that do not name one. */
export const SCHOOL_COOKIE = "farida-school";

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export function isSecureRequest() {
  return getRequestProtocol({ xForwardedProto: true }) === "https";
}

/**
 * One session per school, in a cookie named for it. Over HTTPS it carries the
 * `__Host-` prefix; plain HTTP keeps the bare name, because Safari drops
 * Secure cookies there and would make sign-in silently impossible.
 */
export function sessionCookie(school: string) {
  return `${isSecureRequest() ? "__Host-" : ""}s-${school}`;
}

/**
 * The school a request is for: the host when it is `<school>.<APP_HOST>`,
 * otherwise the school the browser signed in to.
 */
export function currentSchool(): string | null {
  const host = getRequestHeader("host")?.split(":")[0]?.toLowerCase() ?? "";
  if (env.APP_HOST && host.endsWith(`.${env.APP_HOST}`)) {
    const slug = host.slice(0, -env.APP_HOST.length - 1);
    if (SLUG.test(slug)) return slug;
  }
  const chosen = getCookie(SCHOOL_COOKIE);
  return chosen && SLUG.test(chosen) ? chosen : null;
}

export function backend(school: string | null = currentSchool()) {
  return createApiClient({
    url: `${env.BACKEND_URL}/rpc`,
    school: school ?? undefined,
    locale: getLocale(),
    token: school ? getCookie(sessionCookie(school)) : undefined,
  });
}

/**
 * A record the API will not show becomes the router's not-found, so a stale,
 * guessed or out-of-scope URL renders the not-found page with a 404 instead
 * of the error boundary with a 500.
 */
export async function record<T>(call: Promise<T>): Promise<T> {
  try {
    return await call;
  } catch (error) {
    if (isHiddenRecordError(error)) throw notFound();
    throw error;
  }
}
