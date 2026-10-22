import { getCookie } from "@tanstack/react-start/server";

import { env } from "~/env";
import { getLocale } from "~/i18n/runtime";
import { currentSchool, sessionCookie } from "~/server/backend";
import { relayed } from "~/server/relay";

/**
 * Passes a request to the school's side of LTI in the API: a person's own
 * with their session when they have one, since a tool sends some of them
 * through the person's browser, and a tool's own call with the token the
 * tool carries and never a session.
 */
export async function ltiRelay(
  request: Request,
  path: string,
  from: "person" | "tool" = "person",
) {
  const school = currentSchool();
  if (!school) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  const headers = new Headers({
    "x-farida-school": school,
    "x-farida-locale": getLocale(),
  });
  const session = getCookie(sessionCookie(school));
  const token =
    from === "tool"
      ? request.headers.get("authorization")
      : session
        ? `Bearer ${session}`
        : null;
  if (token) headers.set("authorization", token);
  const type = request.headers.get("content-type");
  if (type) headers.set("content-type", type);
  const url = new URL(request.url);
  return relayed(
    await fetch(`${env.BACKEND_URL}${path}${url.search}`, {
      method: request.method,
      headers,
      body:
        request.method === "POST" || request.method === "PUT"
          ? await request.text()
          : undefined,
    }),
    ["link", "www-authenticate", "pragma"],
  );
}
