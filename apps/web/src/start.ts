import { notFound } from "@tanstack/react-router";
import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start";

import { hostView } from "~/utils/host";

const SECURITY_HEADERS: Record<string, string> = {
  // Only this application frames its own pages (the lesson preview).
  "content-security-policy": "frame-ancestors 'self'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

const securityHeaders = createMiddleware().server(async ({ next, request }) => {
  const result = await next();
  // A redirect's headers are immutable, so the response is rebuilt.
  const headers = new Headers(result.response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS))
    if (!headers.has(name)) headers.set(name, value);
  if (
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https"
  )
    headers.set("strict-transport-security", "max-age=31536000");
  return {
    ...result,
    response: new Response(result.response.body, {
      status: result.response.status,
      statusText: result.response.statusText,
      headers,
    }),
  };
});

// What a school's website calls from its own host, all in src/server/site.ts.
const WEBSITE_FUNCTIONS = new Set([
  "getPublicSite",
  "getPublicPage",
  "getPublicPosts",
  "getPublicPost",
  "submitSiteEnquiry",
]);

// Global middleware sees a call's data before its own validator does.
const schoolNamed = (data: unknown): unknown =>
  typeof data === "object" && data !== null && "school" in data
    ? data.school
    : undefined;

/**
 * A school's website host runs the website's own server functions, for its
 * own school, and nothing else: no sign-in, no session, no other school.
 */
const websiteOnly = createMiddleware({ type: "function" }).server(
  ({ next, data, serverFnMeta }) => {
    const school = hostView().site;
    if (school === null) return next();
    const ownSchool = schoolNamed(data) === school;
    if (
      !ownSchool ||
      !WEBSITE_FUNCTIONS.has(serverFnMeta.name) ||
      !serverFnMeta.filename.endsWith("src/server/site.ts")
    )
      throw notFound();
    return next();
  },
);

export const startInstance = createStart(() => ({
  requestMiddleware: [
    securityHeaders,
    createCsrfMiddleware({
      filter: (context) => context.handlerType === "serverFn",
    }),
  ],
  functionMiddleware: [websiteOnly],
}));
