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

/**
 * The school a person last signed in to from the bare portal domain, which
 * sends them straight to that school's portal the next time.
 */
export const SCHOOL_COOKIE = "farida-school";

/** How long the bare domain remembers a school: a year. */
export const REMEMBER_SECONDS = 365 * 24 * 60 * 60;

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
 * The school a request is for: the one its portal host names, and none
 * anywhere else. Each school's sessions live on its own origin, out of reach
 * of every other school's pages, so the bare domain, which only finds a
 * school, and a website host sign nobody in.
 */
export function currentSchool(): string | null {
  const place = currentPlace();
  return place.kind === "portal" ? place.slug : null;
}

/** The school the bare portal domain remembers this browser choosing. */
export function rememberedSchool(): string | null {
  if (currentPlace().kind !== "bare") return null;
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
