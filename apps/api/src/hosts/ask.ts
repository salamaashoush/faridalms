import { hostOf, placeOf } from "@faridalms/domain/hosts";

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
 * name? Yes only for a school's own host that is verified or active. The
 * platform's names are under its wildcard certificates, so they are never
 * asked about and are refused if they are. It reads no session and no
 * school header.
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
  if (placeOf(hostname, context.domains).kind !== "custom")
    return new Response(null, { status: 404 });
  if (!allow()) return new Response(null, { status: 429 });
  return new Response(null, {
    status: (await context.directory.askAllowed(hostname)) ? 200 : 404,
  });
}
