import {
  PROVISION_AUDIENCE,
  PROVISION_TOKEN_SECONDS,
} from "@faridalms/domain/provisioning";
import { jwtVerify } from "jose";

export interface ProvisionOperator {
  /** The console's opaque operator id, a digest of issuer and subject. */
  id: string;
  name: string | null;
}

/**
 * Checks the token the operator console signs for each call: HS256 under the
 * shared secret, for this audience, issued within the last minute, and never
 * seen before. Seen ids are kept until their token would have expired
 * anyway, which bounds the set by the console's call rate.
 */
export function createTokenCheck(secret: Uint8Array, now = () => Date.now()) {
  const seen = new Map<string, number>();
  return async (header: string | null): Promise<ProvisionOperator | null> => {
    const token = /^Bearer ([A-Za-z0-9._-]+)$/.exec(header ?? "")?.[1];
    if (!token) return null;
    const payload = await jwtVerify(token, secret, {
      algorithms: ["HS256"],
      audience: PROVISION_AUDIENCE,
      requiredClaims: ["exp", "iat", "jti", "sub"],
      maxTokenAge: PROVISION_TOKEN_SECONDS,
      currentDate: new Date(now()),
    }).then(
      (verified) => verified.payload,
      () => null,
    );
    if (
      !payload?.jti ||
      !payload.sub ||
      payload.exp === undefined ||
      payload.iat === undefined ||
      payload.exp - payload.iat > PROVISION_TOKEN_SECONDS
    )
      return null;
    const at = now();
    for (const [jti, until] of seen) if (until <= at) seen.delete(jti);
    if (seen.has(payload.jti)) return null;
    seen.set(payload.jti, payload.exp * 1000);
    return {
      id: payload.sub,
      name: typeof payload.name === "string" ? payload.name : null,
    };
  };
}

export type TokenCheck = ReturnType<typeof createTokenCheck>;
