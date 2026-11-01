import type { HostRole, PlatformDomains } from "@faridalms/domain/hosts";

import { createApiClient } from "@faridalms/api-client";
import { isHostname, placeOf } from "@faridalms/domain/hosts";
import { AsyncLocalStorage } from "node:async_hooks";

import { env } from "~/env";

/**
 * What the request's host serves: one school's portal (the host names the
 * school), one school's website, or the bare portal domain, where the
 * school is the one the browser chose.
 */
export type Place =
  | { kind: "portal"; slug: string }
  | { kind: "site"; slug: string }
  | { kind: "bare" };

export type Routing = { place: Place } | { redirect: string } | null;

const isDomain = (value: string | undefined): value is string =>
  value !== undefined && (value === "localhost" || isHostname(value));

/** The platform's domains, or null when they are missing or the same. */
export function platformDomains(): PlatformDomains | null {
  const portal = env.PORTAL_DOMAIN;
  const sites = env.SITES_DOMAIN;
  return isDomain(portal) && isDomain(sites) && portal !== sites
    ? { portal, sites }
    : null;
}

const store = new AsyncLocalStorage<Place>();

/** Runs the rest of a request knowing what its host serves. */
export const withPlace = <T>(place: Place, run: () => T): T =>
  store.run(place, run);

/** What this request's host serves; outside a request, the bare domain. */
export const currentPlace = (): Place => store.getStore() ?? { kind: "bare" };

const TTL_MS = 60_000;
// Hostnames come from requests, so the cache must not grow with whatever
// names a client makes up.
const MAX_CACHED = 5_000;
const cache = new Map<string, { at: number; value: Routing }>();

function remember(host: string, value: Routing) {
  cache.delete(host);
  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(host, { at: Date.now(), value });
}

const asPlace = (role: HostRole, slug: string): Place =>
  role === "site" ? { kind: "site", slug } : { kind: "portal", slug };

/**
 * Routes a request by its host, which comes from the `Host` header alone:
 * the edge passes it through, and `X-Forwarded-Host` is never read, because
 * a client can set it to any school. A school's name or own host is asked
 * of the API (which reads the directory) and kept for a minute.
 */
export async function routeHost(host: string): Promise<Routing> {
  const domains = platformDomains();
  if (!domains) return null;
  const place = placeOf(host, domains);
  if (place.kind === "bare") return { place };
  if (place.kind === "none") return null;
  const hit = cache.get(host);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const resolved = await createApiClient({
    url: `${env.BACKEND_URL}/rpc`,
  }).identity.resolveHost({ host });
  const value: Routing = !resolved
    ? null
    : resolved.redirect
      ? { redirect: resolved.redirect }
      : { place: asPlace(resolved.role, resolved.slug) };
  remember(host, value);
  return value;
}
