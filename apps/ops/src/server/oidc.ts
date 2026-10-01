import { createHash } from "node:crypto";
import * as client from "openid-client";

import type { Operator } from "./session";

import { opsEnv } from "./env";

let configuration: Promise<client.Configuration> | null = null;

/** The identity provider, discovered once per process. */
export function provider() {
  configuration ??= (async () => {
    const env = opsEnv();
    const issuer = new URL(env.OPS_OIDC_ISSUER);
    return client.discovery(
      issuer,
      env.OPS_OIDC_CLIENT_ID,
      env.OPS_OIDC_CLIENT_SECRET,
      undefined,
      // A provider on plain HTTP is only ever a development one.
      issuer.protocol === "http:"
        ? { execute: [client.allowInsecureRequests] }
        : undefined,
    );
  })();
  return configuration;
}

export const callbackUrl = () =>
  new URL("/auth/callback", opsEnv().OPS_ORIGIN).href;

/**
 * Who signed in, if their provider says they are an operator: the group claim
 * must name the console's group. The operator is kept as a digest of issuer
 * and subject, which fits the directory's change log and names no one there.
 */
export function operatorOf(
  claims: Record<string, unknown>,
): Operator | "not_operator" {
  const env = opsEnv();
  const groups = claims[env.OPS_OIDC_GROUP_CLAIM];
  const member = Array.isArray(groups)
    ? groups.includes(env.OPS_OIDC_GROUP)
    : groups === env.OPS_OIDC_GROUP;
  if (
    !member ||
    typeof claims.sub !== "string" ||
    typeof claims.iss !== "string"
  )
    return "not_operator";
  const id = createHash("sha256")
    .update(`${claims.iss}\n${claims.sub}`)
    .digest("base64url")
    .slice(0, 43);
  const name =
    [claims.name, claims.email, claims.preferred_username].find(
      (value): value is string => typeof value === "string" && value !== "",
    ) ?? id.slice(0, 8);
  return { id, name };
}
