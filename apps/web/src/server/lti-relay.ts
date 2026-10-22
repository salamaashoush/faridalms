import { getCookie } from "@tanstack/react-start/server";

import { env } from "~/env";
import { getLocale } from "~/i18n/runtime";
import { currentSchool, sessionCookie } from "~/server/backend";
import { relayed } from "~/server/relay";

/**
 * Passes a request to the school's side of LTI in the API: a tool's call
 * as it came, and a person's own with their session when they have one,
 * since a tool sends some of them through the person's browser.
 */
export async function ltiRelay(request: Request, path: string) {
  const school = currentSchool();
  if (!school) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  const headers = new Headers({
    "x-farida-school": school,
    "x-farida-locale": getLocale(),
  });
  const token = getCookie(sessionCookie(school));
  if (token) headers.set("authorization", `Bearer ${token}`);
  const type = request.headers.get("content-type");
  if (type) headers.set("content-type", type);
  const url = new URL(request.url);
  return relayed(
    await fetch(`${env.BACKEND_URL}${path}${url.search}`, {
      method: request.method,
      headers,
      body: request.method === "POST" ? await request.text() : undefined,
    }),
  );
}
