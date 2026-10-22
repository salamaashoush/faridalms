import type { Digits } from "@faridalms/domain/people";

import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { AsyncLocalStorage } from "node:async_hooks";

import { paraglideMiddleware } from "~/i18n/server";
import { digitsOfCookie, overwriteDigitsSource } from "~/utils/digits";
import "~/preview-locale";

// Pages for two schools may be drawn at once; each keeps its own digits.
const requestDigits = new AsyncLocalStorage<Digits>();
overwriteDigitsSource(() => requestDigits.getStore() ?? "latn");

// The environment is validated at server init by src/server/preflight.ts, a Nitro
// app plugin -- doing it here would only fail per-request, once the process was
// already accepting traffic.

export default createServerEntry({
  fetch(request) {
    // Hand the ORIGINAL request to the handler, not the delocalized one the
    // middleware yields: TanStack Router does its own URL rewriting and the two
    // together produce a redirect loop.
    return requestDigits.run(
      digitsOfCookie(request.headers.get("cookie") ?? ""),
      () => paraglideMiddleware(request, () => handler.fetch(request)),
    );
  },
});
