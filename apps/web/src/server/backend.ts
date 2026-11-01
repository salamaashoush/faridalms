import { createApiClient, isHiddenRecordError } from "@faridalms/api-client";
import { clientAddress } from "@faridalms/domain/forwarded";
import { notFound } from "@tanstack/react-router";
import {
  getCookie,
  getRequestHeader,
  getRequestProtocol,
} from "@tanstack/react-start/server";

import { env } from "~/env";
import { getLocale } from "~/i18n/runtime";

import { currentPlace } from "./place";

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

/** The school this request's host names: a school's portal, or nothing. */
export function hostSchool(): string | null {
  const place = currentPlace();
  return place.kind === "portal" ? place.slug : null;
}

/**
 * The school a request is for: the one its portal host names, otherwise,
 * on the bare domain, the school the browser signed in to. A school's
 * website host has none: nothing there reads a session.
 */
export function currentSchool(): string | null {
  const place = currentPlace();
  if (place.kind === "portal") return place.slug;
  if (place.kind === "site") return null;
  const chosen = getCookie(SCHOOL_COOKIE);
  return chosen && SLUG.test(chosen) ? chosen : null;
}

/**
 * While a guardian has handed the device to a young child, the guardian's
 * own session waits here, out of the child's reach, for the way back.
 */
export function guardianCookie(school: string) {
  return `${isSecureRequest() ? "__Host-" : ""}g-${school}`;
}

export function backend(
  school: string | null = currentSchool(),
  token: string | undefined = school
    ? getCookie(sessionCookie(school))
    : undefined,
) {
  return createApiClient({
    url: `${env.BACKEND_URL}/rpc`,
    school: school ?? undefined,
    locale: getLocale(),
    token,
    forwardedFor:
      clientAddress(
        getRequestHeader("x-forwarded-for"),
        env.TRUSTED_PROXY_HOPS,
      ) ?? undefined,
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
