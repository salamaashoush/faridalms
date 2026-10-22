import type { CellTransaction } from "@faridalms/database/context";
import type { JWK } from "jose";

import { keepSigningKey, signingKey } from "@faridalms/database/stores/lti";
import {
  createRemoteJWKSet,
  exportJWK,
  generateKeyPair,
  importJWK,
  SignJWT,
} from "jose";

import type { LtiSecrets } from "./crypto";

const imported = new Map<string, CryptoKey>();

/**
 * The key a school signs what it sends tools with, made the first time it
 * is needed: RSA of 2048 bits, as LTI asks, its private half sealed.
 */
export async function schoolSigningKey(
  tx: CellTransaction,
  school: { tenantId: string; schoolId: string },
  secrets: LtiSecrets,
): Promise<{ kid: string; key: CryptoKey }> {
  const scope = { tenantId: school.tenantId, orgId: school.schoolId };
  let row = await signingKey(tx, scope);
  if (!row) {
    const pair = await generateKeyPair("RS256", {
      modulusLength: 2048,
      extractable: true,
    });
    const kid = crypto.randomUUID();
    row = await keepSigningKey(tx, {
      ...scope,
      kid,
      publicJwk: {
        ...(await exportJWK(pair.publicKey)),
        kid,
        alg: "RS256",
        use: "sig",
      },
      sealedPrivateJwk: await secrets.seal(await exportJWK(pair.privateKey)),
    });
  }
  let key = imported.get(row.kid);
  if (!key) {
    key = (await importJWK(
      await secrets.open<JWK>(row.sealedPrivateJwk),
      "RS256",
    )) as CryptoKey;
    imported.set(row.kid, key);
  }
  return { kid: row.kid, key };
}

/** Claims signed with a school's key, valid for five minutes. */
export async function signed(
  claims: Record<string, unknown>,
  signer: { kid: string; key: CryptoKey },
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: signer.kid, typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signer.key);
}

const toolKeySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * A tool's public keys, fetched from the address it registered and kept a
 * while, so what it signs can be checked; a key it has newly rotated to is
 * fetched again when first seen.
 */
export function toolKeys(jwksUrl: string) {
  let keys = toolKeySets.get(jwksUrl);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(jwksUrl));
    toolKeySets.set(jwksUrl, keys);
  }
  return keys;
}
