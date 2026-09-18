import type { AppRouter } from "@faridalms/api/router";
import type { RouterClient } from "@orpc/server";

import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";

export function createApiClient(options: {
  url: string;
  token?: string;
  fetch?: typeof globalThis.fetch;
}): RouterClient<AppRouter> {
  return createORPCClient(
    new RPCLink({
      url: options.url,
      headers: () =>
        options.token ? { authorization: `Bearer ${options.token}` } : {},
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
