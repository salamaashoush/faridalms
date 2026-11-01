import { hostOf, isEdgeName, placeOf } from "@faridalms/domain/hosts";

import type { RequestContext } from "../core/context";

export const ASK_PATH = "/edge/ask";

/**
 * A token bucket for the edge's questions. The edge asks once per name it
 * has no certificate for, so a flood means someone is handshaking with
 * made-up names, and the answer to them is a refusal rather than a query.
 */
export function askLimiter(perSecond = 20, burst = 100) {
  let tokens = burst;
  let at = performance.now();
  return () => {
    const now = performance.now();
    tokens = Math.min(burst, tokens + ((now - at) / 1000) * perSecond);
    at = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

/**
 * The edge's on-demand TLS question: may it get a certificate for this
 * name? Yes for a school's own host that is verified or active, for an
 * existing school's names under the platform's domains, and for the names
 * the edge serves the platform on. An edge with wildcard certificates never
 * asks about the platform's names; one that gets a certificate per name, as
 * a self-hosted server does, asks about every one. Anything else is refused,
 * so made-up names never spend the issuer's limits. It reads no session and
 * no school header.
 */
export async function handleEdgeAsk(
  request: Request,
  url: URL,
  context: RequestContext,
  allow: () => boolean,
): Promise<Response | null> {
  if (url.pathname !== ASK_PATH) return null;
  if (request.method !== "GET")
    return new Response(null, { status: 405, headers: { allow: "GET" } });
  const hostname = hostOf(url.searchParams.get("domain"));
  if (!hostname) return new Response(null, { status: 400 });
  const place = placeOf(hostname, context.domains);
  const edge = isEdgeName(hostname, context.domains);
  if (!edge && place.kind !== "custom" && place.kind !== "platform")
    return new Response(null, { status: 404 });
  if (!allow()) return new Response(null, { status: 429 });
  const allowed = edge
    ? true
    : place.kind === "custom"
      ? await context.directory.askAllowed(hostname)
      : place.kind === "platform" &&
        (await context.directory.bySlug(place.slug)) !== null;
  return new Response(null, { status: allowed ? 200 : 404 });
}
