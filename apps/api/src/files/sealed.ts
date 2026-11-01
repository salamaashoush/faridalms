import type { Cell } from "@faridalms/database/context";

import type { DataKey, KeyRing } from "../core/keys";
import type { FileStore } from "./store";

/**
 * A file sealed under its school's files key, at rest: a header, then the
 * bytes in segments, each encrypted and authenticated on its own so a
 * range can be read without the rest. The key that seals an object is
 * derived from the school's data key with a salt of its own and bound to
 * the tenant, the object's key and the data key's version, so an object
 * copied anywhere else does not open. The last segment says it is the
 * last, so cutting an object short is detected too.
 */
const FORMAT = 1;
const SALT_BYTES = 16;
const TAG_BYTES = 16;
export const HEADER_BYTES = 1 + SALT_BYTES;
export const SEGMENT_BYTES = 64 * 1024;

type Bytes = Uint8Array<ArrayBuffer>;

export interface SealedObject {
  tenantId: string;
  storageKey: string;
  keyVersion: number;
}

/** The school's files key, active or of a version, without a unit of work of the caller's. */
export interface FileKeys {
  active(tenantId: string): Promise<DataKey>;
  version(tenantId: string, keyVersion: number): Promise<DataKey>;
}

const unit = (tenantId: string) => ({
  tenantId,
  requestId: crypto.randomUUID(),
  actor: { kind: "system" as const },
});

/** Reads the files key through the key ring as the worker, which may read every tenant's wrapped keys. */
export function fileKeys(input: { cell: Cell; keys: KeyRing }): FileKeys {
  return {
    active: (tenantId) =>
      input.cell.withWorker(unit(tenantId), "read", (tx) =>
        input.keys.active(tx, tenantId, "files"),
      ),
    version: (tenantId, keyVersion) =>
      input.cell.withWorker(unit(tenantId), "read", (tx) =>
        input.keys.version(tx, tenantId, "files", keyVersion),
      ),
  };
}

const encoder = new TextEncoder();

async function objectKey(dek: Bytes, salt: Bytes, object: SealedObject) {
  const base = await crypto.subtle.importKey("raw", dek, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: encoder.encode(
        [
          "files",
          object.tenantId,
          object.storageKey,
          String(object.keyVersion),
        ].join("|"),
      ),
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** A segment's nonce is its index, unique under a key no other object shares. */
function nonce(index: number): Bytes {
  const bytes = new Uint8Array(12);
  new DataView(bytes.buffer).setBigUint64(4, BigInt(index));
  return bytes;
}

const finality = (last: boolean): Bytes => new Uint8Array([last ? 1 : 0]);

/** How many segments a plaintext of this size is sealed in: never none, so even nothing has an end. */
export const segmentsOf = (sizeBytes: number) =>
  Math.max(1, Math.ceil(sizeBytes / SEGMENT_BYTES));

/** What a sealed object of this plaintext size weighs at rest. */
export const sealedSize = (sizeBytes: number) =>
  HEADER_BYTES + sizeBytes + segmentsOf(sizeBytes) * TAG_BYTES;

/** Seals a plaintext stream as it passes, segment by segment. */
export function sealStream(
  body: ReadableStream<Uint8Array>,
  dek: DataKey,
  object: SealedObject,
): ReadableStream<Bytes> {
  const reader = body.getReader();
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = objectKey(dek.key, salt, object);
  let pending = new Uint8Array(0);
  let index = 0;
  let started = false;
  let finished = false;
  const segment = async (plain: Bytes, last: boolean) => {
    const sealed = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: nonce(index),
        additionalData: finality(last),
      },
      await key,
      plain,
    );
    index += 1;
    return new Uint8Array(sealed);
  };
  return new ReadableStream<Bytes>({
    async pull(controller) {
      if (!started) {
        started = true;
        const header = new Uint8Array(HEADER_BYTES);
        header[0] = FORMAT;
        header.set(salt, 1);
        controller.enqueue(header);
        return;
      }
      while (!finished) {
        if (pending.byteLength > SEGMENT_BYTES) {
          const plain = pending.slice(0, SEGMENT_BYTES);
          pending = pending.slice(SEGMENT_BYTES);
          controller.enqueue(await segment(plain, false));
          return;
        }
        const { done, value } = await reader.read();
        if (done) {
          finished = true;
          controller.enqueue(await segment(pending, true));
          controller.close();
          return;
        }
        const joined = new Uint8Array(pending.byteLength + value.byteLength);
        joined.set(pending);
        joined.set(value, pending.byteLength);
        pending = joined;
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

/** Reads exactly as many bytes as asked for, or fewer only where the stream ends. */
function exactReader(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  let held = new Uint8Array(0);
  return {
    async take(length: number): Promise<Bytes> {
      while (held.byteLength < length) {
        const { done, value } = await reader.read();
        if (done) break;
        const joined = new Uint8Array(held.byteLength + value.byteLength);
        joined.set(held);
        joined.set(value, held.byteLength);
        held = joined;
      }
      const taken = held.slice(0, length);
      held = held.slice(length);
      return taken;
    },
    cancel: (reason?: unknown) => reader.cancel(reason),
  };
}

export class SealError extends Error {}

/**
 * A sealed object's plaintext, or only the bytes from `start` to `end`
 * inclusive: just the segments the range falls in are read and opened.
 * Null when the object is not there.
 */
export async function openSealedObject(
  store: FileStore,
  keys: FileKeys,
  object: SealedObject & { sizeBytes: number },
  range?: { start: number; end: number },
): Promise<ReadableStream<Bytes> | null> {
  const segments = segmentsOf(object.sizeBytes);
  const start = range?.start ?? 0;
  const end = range?.end ?? object.sizeBytes - 1;
  const first = Math.floor(start / SEGMENT_BYTES);
  const last = Math.min(
    segments - 1,
    Math.floor(Math.max(end, 0) / SEGMENT_BYTES),
  );
  const plainOf = (index: number) =>
    index < segments - 1
      ? SEGMENT_BYTES
      : object.sizeBytes - (segments - 1) * SEGMENT_BYTES;
  const at = (index: number) =>
    HEADER_BYTES + index * (SEGMENT_BYTES + TAG_BYTES);
  const header = await store.open(object.storageKey, {
    start: 0,
    end: HEADER_BYTES - 1,
  });
  if (!header) return null;
  const head = exactReader(header);
  const leading = await head.take(HEADER_BYTES);
  await head.cancel();
  if (leading.byteLength !== HEADER_BYTES || leading[0] !== FORMAT)
    throw new SealError("not a sealed object");
  const dek = await keys.version(object.tenantId, object.keyVersion);
  const key = await objectKey(dek.key, leading.slice(1), object);
  const body = await store.open(object.storageKey, {
    start: at(first),
    end: at(last) + plainOf(last) + TAG_BYTES - 1,
  });
  if (!body) return null;
  const segmentsIn = exactReader(body);
  let index = first;
  return new ReadableStream<Bytes>({
    async pull(controller) {
      if (index > last) {
        controller.close();
        return;
      }
      const sealed = await segmentsIn.take(plainOf(index) + TAG_BYTES);
      if (sealed.byteLength !== plainOf(index) + TAG_BYTES)
        throw new SealError("sealed object cut short");
      const plain = new Uint8Array(
        await crypto.subtle
          .decrypt(
            {
              name: "AES-GCM",
              iv: nonce(index),
              additionalData: finality(index === segments - 1),
            },
            key,
            sealed,
          )
          .catch(() => {
            throw new SealError("sealed object does not open");
          }),
      );
      const from = index === first ? start - first * SEGMENT_BYTES : 0;
      const to = index === last ? end - last * SEGMENT_BYTES + 1 : plain.length;
      index += 1;
      controller.enqueue(plain.slice(from, Math.max(from, to)));
    },
    async cancel(reason) {
      await segmentsIn.cancel(reason);
    },
  });
}

/**
 * Seals what rests at `from` into `to` under the school's active files key,
 * removes the plaintext and checks it is gone. Answers the key version used.
 */
export async function sealObject(
  store: FileStore,
  keys: FileKeys,
  input: { tenantId: string; from: string; to: string; sizeBytes: number },
): Promise<number> {
  const plain = await store.open(input.from);
  if (!plain) throw new SealError("nothing to seal");
  const dek = await keys.active(input.tenantId);
  const stored = await store.write(
    input.to,
    sealStream(plain, dek, {
      tenantId: input.tenantId,
      storageKey: input.to,
      keyVersion: dek.version,
    }),
    sealedSize(input.sizeBytes),
  );
  if (stored.sizeBytes !== sealedSize(input.sizeBytes))
    throw new SealError("sealed object is not the size it should be");
  await store.remove(input.from);
  const left = await store.open(input.from);
  if (left) {
    await left.cancel();
    throw new SealError("plaintext left behind");
  }
  return dek.version;
}
