import type { Digits } from "@faridalms/domain/people";

import { hostOf } from "@faridalms/domain/hosts";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { AsyncLocalStorage } from "node:async_hooks";

import type { Routing } from "~/server/place";
import type { HostView } from "~/utils/host";

import { paraglideMiddleware } from "~/i18n/server";
import { routeHost, withPlace } from "~/server/place";
import {
  DIGITS_COOKIE,
  digitsOfCookie,
  overwriteDigitsSource,
} from "~/utils/digits";
import { overwriteHostSource } from "~/utils/host";
import "~/preview-locale";

// Pages for two schools may be drawn at once; each keeps its own digits,
// which a public website changes to its school's as it is drawn.
const requestDigits = new AsyncLocalStorage<{ digits: Digits }>();
overwriteDigitsSource(
  () => requestDigits.getStore()?.digits ?? "latn",
  (next) => {
    const held = requestDigits.getStore();
    if (held) held.digits = next;
  },
);

const requestHost = new AsyncLocalStorage<HostView>();
overwriteHostSource(
  () => requestHost.getStore() ?? { site: null, protocol: "https:", port: "" },
);

// The environment is validated at server init by src/server/preflight.ts, a Nitro
// app plugin -- doing it here would only fail per-request, once the process was
// already accepting traffic.

const plain = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

// The only cookies a website's host lets through: the reader's language and
// digits, neither of which says who they are.
const SITE_COOKIES = new Set(["language-tag", DIGITS_COOKIE]);

/** The request without any cookie but the website's own two. */
function withoutSession(request: Request): Request {
  const kept = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => SITE_COOKIES.has(part.split("=")[0] ?? ""));
  const headers = new Headers(request.headers);
  if (kept.length) headers.set("cookie", kept.join("; "));
  else headers.delete("cookie");
  return new Request(request, { headers });
}

/** The response without anything that would set a cookie on a website's host. */
function withoutCookies(response: Response): Response {
  if (!response.headers.has("set-cookie")) return response;
  const headers = new Headers(response.headers);
  headers.delete("set-cookie");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function render(request: Request) {
  // Hand the ORIGINAL request to the handler, not the delocalized one the
  // middleware yields: TanStack Router does its own URL rewriting and the two
  // together produce a redirect loop.
  return requestDigits.run(
    { digits: digitsOfCookie(request.headers.get("cookie") ?? "") },
    () => paraglideMiddleware(request, () => handler.fetch(request)),
  );
}

export default createServerEntry({
  async fetch(request) {
    const url = new URL(request.url);
    // Probes reach the process by its address or through a school's host
    // being verified, before any host is resolved.
    if (url.pathname === "/api/health") return render(request);
    const raw = request.headers.get("host");
    const host = hostOf(raw);
    let routing: Routing;
    try {
      routing = host ? await routeHost(host) : null;
    } catch {
      return plain(503, "Service unavailable");
    }
    if (!routing) return plain(404, "Not found");
    if ("redirect" in routing)
      return new Response(null, {
        status: 308,
        headers: {
          location: `https://${routing.redirect}${url.pathname}${url.search}`,
          "cache-control": "no-store",
        },
      });
    const { place } = routing;
    const view: HostView = {
      site: place.kind === "site" ? place.slug : null,
      protocol:
        request.headers.get("x-forwarded-proto") === "https" ||
        url.protocol === "https:"
          ? "https:"
          : "http:",
      port: /:(\d+)$/.exec(raw ?? "")?.[1] ?? "",
    };
    return withPlace(place, () =>
      requestHost.run(view, async () => {
        if (place.kind !== "site") return render(request);
        return withoutCookies(await render(withoutSession(request)));
      }),
    );
  },
});
