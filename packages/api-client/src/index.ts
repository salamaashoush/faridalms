import type { AppRouter } from "@faridalms/api/router";
import type { RouterClient } from "@orpc/server";

import { createORPCClient, ORPCError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

/**
 * True when the API will not show the requested record: it does not exist, or
 * the caller's relationships do not reach it. Both read the same from a URL.
 */
export function isHiddenRecordError(error: unknown): boolean {
  return (
    error instanceof ORPCError &&
    (error.code === "NOT_FOUND" || error.code === "FORBIDDEN")
  );
}

export function createApiClient(options: {
  url: string;
  token?: string;
  /** The school slug the request is for; the API routes the tenant from it. */
  school?: string;
  /** The reader's language, for sorting and labels. */
  locale?: string;
  /** The visitor's address chain as the web server received it, for throttling. */
  forwardedFor?: string;
  fetch?: typeof globalThis.fetch;
}): RouterClient<AppRouter> {
  return createORPCClient(
    new RPCLink({
      url: options.url,
      headers: () => ({
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.school ? { "x-farida-school": options.school } : {}),
        ...(options.locale ? { "x-farida-locale": options.locale } : {}),
        ...(options.forwardedFor
          ? { "x-forwarded-for": options.forwardedFor }
          : {}),
      }),
      fetch:
        options.fetch ??
        ((request, init) =>
          globalThis.fetch(request, {
            ...init,
            signal: AbortSignal.any([
              request.signal,
              AbortSignal.timeout(15_000),
            ]),
          })),
    }),
  );
}
