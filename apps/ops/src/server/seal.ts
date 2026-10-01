import { createCipheriv, createDecipheriv, createHash } from "node:crypto";
import * as v from "valibot";

import { opsEnv } from "./env";

function key(purpose: string) {
  return createHash("sha256")
    .update(Buffer.from(opsEnv().OPS_SESSION_SECRET, "base64"))
    .update(purpose)
    .digest();
}

/** Encrypts and signs a value for a cookie, until a time in seconds. */
export function seal(purpose: string, value: unknown, expires: number) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = createCipheriv("aes-256-gcm", key(purpose), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify({ value, expires })),
    cipher.final(),
  ]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url");
}

export function unseal<S extends v.GenericSchema>(
  purpose: string,
  token: string | undefined,
  schema: S,
): v.InferOutput<S> | null {
  if (!token) return null;
  const sealed = Buffer.from(token, "base64url");
  if (sealed.length < 12 + 16 + 2) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(purpose),
      sealed.subarray(0, 12),
    );
    decipher.setAuthTag(sealed.subarray(-16));
    const sealedValue = v.parse(
      v.object({ value: v.unknown(), expires: v.number() }),
      JSON.parse(
        Buffer.concat([
          decipher.update(sealed.subarray(12, -16)),
          decipher.final(),
        ]).toString(),
      ),
    );
    if (sealedValue.expires < Date.now() / 1000) return null;
    return v.parse(schema, sealedValue.value);
  } catch {
    return null;
  }
}
