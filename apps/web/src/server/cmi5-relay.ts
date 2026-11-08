import { env } from "~/env";
import { getLocale } from "~/i18n/runtime";
import { currentSchool } from "~/server/backend";

/** What an AU's calls carry that the record store reads, and what it reads back. */
const ASKED = [
  "authorization",
  "content-type",
  "x-experience-api-version",
  "if-match",
  "if-none-match",
];
const ANSWERED = [
  "content-type",
  "x-experience-api-version",
  "last-modified",
  "cache-control",
  "access-control-allow-origin",
  "access-control-allow-headers",
  "access-control-allow-methods",
  "access-control-expose-headers",
  "access-control-max-age",
];

/**
 * Passes a course package's call to the API: an AU's fetch address and
 * the record store it reports to. An AU runs on the files host, never as
 * the school, so these carry the AU's own token and never a session.
 */
export async function cmi5Relay(request: Request) {
  const school = currentSchool();
  if (!school) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  const url = new URL(request.url);
  const headers = new Headers({
    "x-farida-school": school,
    "x-farida-locale": getLocale(),
  });
  for (const name of ASKED) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const upstream = await fetch(
    `${env.BACKEND_URL}${url.pathname}${url.search}`,
    {
      method: request.method,
      headers,
      body:
        request.method === "POST" || request.method === "PUT"
          ? await request.text()
          : undefined,
    },
  );
  const answered = new Headers();
  for (const name of ANSWERED) {
    const value = upstream.headers.get(name);
    if (value) answered.set(name, value);
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: answered,
  });
}
