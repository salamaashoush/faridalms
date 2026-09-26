/**
 * Envelope encryption: AES-256-GCM through WebCrypto. A tenant's data keys are
 * wrapped by the cell's key-encryption key with the tenant, purpose and version
 * as associated data, so a wrapped key copied to another tenant fails to
 * unwrap; ciphertext binds its tenant, table, column, row and key version.
 */
type Bytes = Uint8Array<ArrayBuffer>;

const VERSION = 1;
const encoder = new TextEncoder();

export type KeyPurpose =
  | "health"
  | "identifiers"
  | "identifier_lookup"
  | "files";

export interface KeyContext {
  cell: string;
  tenantId: string;
  purpose: KeyPurpose;
  keyVersion: number;
}

export interface KeyEncryptionKey {
  readonly ref: string;
  wrap(dek: Bytes, context: KeyContext): Promise<Bytes>;
  unwrap(wrapped: Bytes, context: KeyContext): Promise<Bytes>;
}

const contextBytes = (context: KeyContext) =>
  encoder.encode(
    JSON.stringify([
      context.cell,
      context.tenantId,
      context.purpose,
      context.keyVersion,
    ]),
  );

async function aesKey(raw: Bytes) {
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

async function seal(key: CryptoKey, plaintext: Bytes, aad: Bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad },
      key,
      plaintext,
    ),
  );
  const out = new Uint8Array(1 + iv.length + sealed.length);
  out[0] = VERSION;
  out.set(iv, 1);
  out.set(sealed, 1 + iv.length);
  return out;
}

async function open(key: CryptoKey, envelope: Bytes, aad: Bytes) {
  if (envelope[0] !== VERSION) throw new Error("Unknown ciphertext version");
  const iv = envelope.slice(1, 13);
  const body = envelope.slice(13);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: aad },
      key,
      body,
    ),
  );
}

/**
 * A key-encryption key held by the process, for development and tests. A
 * deployed cell wraps through its KMS instead; the interface is the same.
 */
export function localKek(secret: Bytes, ref: string): KeyEncryptionKey {
  if (secret.length !== 32) throw new Error("The KEK must be 32 bytes");
  const key = aesKey(secret);
  return {
    ref,
    wrap: async (dek, context) => seal(await key, dek, contextBytes(context)),
    unwrap: async (wrapped, context) =>
      open(await key, wrapped, contextBytes(context)),
  };
}

export function newDataKey(): Bytes {
  return crypto.getRandomValues(new Uint8Array(32));
}

export interface CipherContext {
  tenantId: string;
  table: string;
  column: string;
  rowId: string;
  keyVersion: number;
}

const cipherAad = (context: CipherContext) =>
  encoder.encode(
    [
      context.tenantId,
      context.table,
      context.column,
      context.rowId,
      String(context.keyVersion),
    ].join("|"),
  );

export async function encryptField(
  dek: Bytes,
  plaintext: string,
  context: CipherContext,
): Promise<Bytes> {
  return seal(await aesKey(dek), encoder.encode(plaintext), cipherAad(context));
}

export async function decryptField(
  dek: Bytes,
  ciphertext: Bytes,
  context: CipherContext,
): Promise<string> {
  return new TextDecoder().decode(
    await open(await aesKey(dek), ciphertext, cipherAad(context)),
  );
}

/** HMAC-SHA-256 for exact lookup and uniqueness of sealed identifiers. */
export async function lookupHmac(
  lookupKey: Bytes,
  normalised: string,
): Promise<Bytes> {
  const key = await crypto.subtle.importKey(
    "raw",
    lookupKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(normalised)),
  );
}
