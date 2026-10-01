import { getCookie } from "@tanstack/react-start/server";

import { env } from "~/env";
import { currentSchool, sessionCookie } from "~/server/backend";

const FORWARDED = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "content-disposition",
  "cache-control",
  "x-content-type-options",
  "location",
];

/**
 * Bytes pass straight through to the API with the session token from the
 * HTTP-only cookie. The web never stores a file and never decides who may
 * read one; the API answers 404 for anyone it cannot authorise.
 */
export function relayTo(
  request: Request,
  path: string,
  forward: readonly string[] = [],
): { refusal: Response } | { headers: Headers; target: string } {
  const school = currentSchool();
  const token = school ? getCookie(sessionCookie(school)) : undefined;
  if (!school || !token)
    return {
      refusal: Response.json({ code: "UNAUTHORIZED" }, { status: 401 }),
    };
  const headers = new Headers({
    authorization: `Bearer ${token}`,
    "x-farida-school": school,
  });
  for (const name of forward) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return { headers, target: `${env.BACKEND_URL}${path}` };
}

export function relayed(upstream: Response): Response {
  const headers = new Headers();
  for (const name of FORWARDED) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}
