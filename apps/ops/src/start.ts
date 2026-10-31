import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start";

const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy": "frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
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

export const startInstance = createStart(() => ({
  requestMiddleware: [
    securityHeaders,
    createCsrfMiddleware({
      filter: (context) => context.handlerType === "serverFn",
    }),
  ],
}));
