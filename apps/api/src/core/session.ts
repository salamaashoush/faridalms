import { createHash, createHmac, randomBytes } from "node:crypto";

const TENANT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface ParsedToken {
  tenantId: string;
  tokenHash: Buffer;
}

/**
 * A session token is `<tenant uuid>.<32 random bytes, base64url>`. The tenant
 * part is not secret: it tells the API which tenant to bind before it can look
 * the session up under row level security. Only the secret's hash is stored.
 */
export function issueToken(tenantId: string): {
  token: string;
  tokenHash: Buffer;
} {
  const secret = randomBytes(32).toString("base64url");
  return {
    token: `${tenantId}.${secret}`,
    tokenHash: createHash("sha256").update(secret).digest(),
  };
}

export function parseToken(
  token: string | null | undefined,
): ParsedToken | null {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot !== 36) return null;
  const tenantId = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!TENANT.test(tenantId) || !/^[A-Za-z0-9_-]{43}$/.test(secret))
    return null;
  return { tenantId, tokenHash: createHash("sha256").update(secret).digest() };
}

export function bearer(headers: Headers): string | null {
  const value = headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7).trim() : null;
}

/**
 * Keys for sign-in counters: an HMAC under a per-tenant key derived from the
 * cell secret, so no raw login name or address is stored and one person's
 * attempts are not linkable across tenants.
 */
export function attemptKey(
  cellSecret: Uint8Array<ArrayBuffer>,
  tenantId: string,
  value: string,
): Buffer {
  const tenantKey = createHmac("sha256", cellSecret).update(tenantId).digest();
  return createHmac("sha256", tenantKey).update(value).digest();
}

/** The network the request came from, /24 for IPv4 and /48 for IPv6. */
export function ipPrefix(headers: Headers): string | null {
  const address = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!address) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(address)) {
    const [a, b, c] = address.split(".");
    return `${a}.${b}.${c}.0/24`;
  }
  if (address.includes(":")) {
    const groups = address.split(":").slice(0, 3);
    return `${groups.join(":")}::/48`;
  }
  return null;
}

export function userAgentSummary(headers: Headers): string | null {
  const agent = headers.get("user-agent");
  if (!agent) return null;
  const browser =
    /(Edg|Firefox|Chrome|Safari)\/[\d.]+/.exec(agent)?.[1] ?? "Browser";
  const system =
    /(Windows|Mac OS X|Android|iPhone|iPad|Linux)/.exec(agent)?.[1] ?? "";
  return `${browser}${system ? ` on ${system}` : ""}`.slice(0, 200);
}

/** Session lifetimes by context, in minutes. */
export const LIFETIME = {
  staff: { idle: 12 * 60, absolute: 7 * 24 * 60 },
  family: { idle: 14 * 24 * 60, absolute: 30 * 24 * 60 },
  student: { idle: 12 * 60, absolute: 7 * 24 * 60 },
} as const;
