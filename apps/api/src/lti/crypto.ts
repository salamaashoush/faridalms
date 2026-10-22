const encoder = new TextEncoder();
const decoder = new TextDecoder();

const base64url = (bytes: Uint8Array) =>
  Buffer.from(bytes).toString("base64url");
const unbase64url = (text: string) =>
  new Uint8Array(Buffer.from(text, "base64url"));

async function derive(
  secret: Uint8Array<ArrayBuffer>,
  info: string,
  use: "seal" | "sign",
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", secret, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("farida-lti"),
      info: encoder.encode(info),
    },
    base,
    use === "seal"
      ? { name: "AES-GCM", length: 256 }
      : { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    use === "seal" ? ["encrypt", "decrypt"] : ["sign", "verify"],
  );
}

/**
 * The cell's secrets for outside tools, each derived from the cell secret
 * for one use: sealing the private halves of the schools' signing keys,
 * and signing the short-lived hints a launch carries through a tool.
 */
export function ltiSecrets(cellSecret: Uint8Array<ArrayBuffer>) {
  const sealing = derive(cellSecret, "lti signing keys", "seal");
  const hints = derive(cellSecret, "lti launch hints", "sign");
  return {
    async seal(value: unknown): Promise<string> {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const sealed = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        await sealing,
        encoder.encode(JSON.stringify(value)),
      );
      return `${base64url(iv)}.${base64url(new Uint8Array(sealed))}`;
    },
    async open<T>(sealed: string): Promise<T> {
      const [iv = "", body = ""] = sealed.split(".");
      const opened = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: unbase64url(iv) },
        await sealing,
        unbase64url(body),
      );
      return JSON.parse(decoder.decode(opened)) as T;
    },
    /** A value only this cell can have written, readable until it expires. */
    async sign(value: object, seconds: number): Promise<string> {
      const body = base64url(
        encoder.encode(
          JSON.stringify({
            ...value,
            exp: Math.floor(Date.now() / 1000) + seconds,
          }),
        ),
      );
      const mac = await crypto.subtle.sign(
        "HMAC",
        await hints,
        encoder.encode(body),
      );
      return `${body}.${base64url(new Uint8Array(mac))}`;
    },
    async read<T extends object>(token: string): Promise<T | null> {
      const [body = "", mac = ""] = token.split(".");
      if (!body || !mac) return null;
      const valid = await crypto.subtle.verify(
        "HMAC",
        await hints,
        unbase64url(mac),
        encoder.encode(body),
      );
      if (!valid) return null;
      const value = JSON.parse(decoder.decode(unbase64url(body))) as T & {
        exp: number;
      };
      return value.exp > Math.floor(Date.now() / 1000) ? value : null;
    },
  };
}

export type LtiSecrets = ReturnType<typeof ltiSecrets>;
