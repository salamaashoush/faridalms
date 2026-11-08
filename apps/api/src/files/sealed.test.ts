import { describe, expect, it } from "vitest";

import type { FileKeys } from "./sealed";
import type { FileStore } from "./store";

import {
  openSealedObject,
  SEGMENT_BYTES,
  sealedSize,
  sealObject,
} from "./sealed";

class MemoryStore implements FileStore {
  readonly objects = new Map<string, Uint8Array<ArrayBuffer>>();

  async write(key: string, body: ReadableStream<Uint8Array>, limit: number) {
    const bytes = new Uint8Array(await new Response(body).arrayBuffer());
    if (bytes.byteLength > limit) throw new Error("too large");
    this.objects.set(key, bytes);
    return { sizeBytes: bytes.byteLength, sha256: "" };
  }

  async open(key: string, range?: { start: number; end: number }) {
    const bytes = this.objects.get(key);
    if (!bytes) return null;
    const part = range ? bytes.slice(range.start, range.end + 1) : bytes;
    return new Blob([part]).stream();
  }

  async has(key: string) {
    return this.objects.has(key);
  }

  async move(from: string, to: string) {
    const bytes = this.objects.get(from);
    if (bytes) this.objects.set(to, bytes);
    this.objects.delete(from);
  }

  async remove(key: string) {
    this.objects.delete(key);
  }

  async removeFolder() {}
}

const dataKey = () => ({
  key: crypto.getRandomValues(new Uint8Array(32)),
  version: 1,
});

function keysOf(
  byTenant: Record<string, ReturnType<typeof dataKey>>,
): FileKeys {
  const of = (tenantId: string) => {
    const key = byTenant[tenantId];
    if (!key) throw new Error("no key");
    return Promise.resolve(key);
  };
  return { active: of, version: of };
}

/** A stream's bytes, its own error thrown as it is. */
async function drain(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return new Uint8Array(Buffer.concat(parts));
    parts.push(value);
  }
}

const TENANT = "0190a1b2-0000-7000-8000-000000000001";
const PLAIN = `t/${TENANT}/q/0190a1b2-0000-7000-8000-0000000000aa`;
const SEALED = `t/${TENANT}/h/0190a1b2-0000-7000-8000-0000000000aa`;

async function sealed(size: number) {
  const store = new MemoryStore();
  const keys = keysOf({ [TENANT]: dataKey() });
  const plain = Uint8Array.from(
    { length: size },
    (_, at) => (at * 31 + 7) % 251,
  );
  store.objects.set(PLAIN, plain);
  const keyVersion = await sealObject(store, keys, {
    tenantId: TENANT,
    from: PLAIN,
    to: SEALED,
    sizeBytes: size,
  });
  const object = {
    tenantId: TENANT,
    storageKey: SEALED,
    keyVersion,
    sizeBytes: size,
  };
  const read = async (range?: { start: number; end: number }) => {
    const body = await openSealedObject(store, keys, object, range);
    return body ? drain(body) : null;
  };
  return { store, keys, plain, object, read };
}

describe("sealed files", () => {
  it("rest as ciphertext of a known size and leave no plaintext behind", async () => {
    const kept: { plain: Uint8Array; atRest: Uint8Array }[] = [];
    for (const size of [
      1,
      SEGMENT_BYTES,
      SEGMENT_BYTES + 1,
      3 * SEGMENT_BYTES + 7,
    ]) {
      const { store, plain, read } = await sealed(size);
      expect(store.objects.has(PLAIN)).toBe(false);
      const atRest = store.objects.get(SEALED) ?? new Uint8Array(0);
      expect(atRest.byteLength).toBe(sealedSize(size));
      expect(await read()).toEqual(plain);
      kept.push({ plain, atRest });
    }
    // A needle of a few bytes turns up in random ciphertext by chance: the
    // one byte of the smallest file sits in its 34 about one run in eight.
    const plaintextLeft = kept
      .filter(({ plain }) => plain.byteLength >= 16)
      .some(({ plain, atRest }) =>
        Buffer.from(atRest).includes(Buffer.from(plain.slice(0, 32))),
      );
    expect(plaintextLeft).toBe(false);
  });

  it("open any range, reading only the segments it falls in", async () => {
    const size = 3 * SEGMENT_BYTES + 7;
    const { plain, read } = await sealed(size);
    for (const [start, end] of [
      [0, 0],
      [SEGMENT_BYTES - 1, SEGMENT_BYTES],
      [SEGMENT_BYTES + 10, 2 * SEGMENT_BYTES + 10],
      [size - 3, size - 1],
      [0, size - 1],
    ] as const)
      expect(await read({ start, end })).toEqual(plain.slice(start, end + 1));
  });

  it("refuse a changed byte, a cut-short object and another school's key", async () => {
    const { store, object, read } = await sealed(SEGMENT_BYTES + 100);
    const atRest = store.objects.get(SEALED) ?? new Uint8Array(0);

    const changed = atRest.slice();
    changed[40] = (changed[40] ?? 0) ^ 1;
    store.objects.set(SEALED, changed);
    await expect(read()).rejects.toThrow("does not open");

    const firstSegmentEnds = 17 + SEGMENT_BYTES + 16;
    store.objects.set(SEALED, atRest.slice(0, firstSegmentEnds));
    await expect(read()).rejects.toThrow("cut short");

    store.objects.set(SEALED, atRest);
    const other = "0190a1b2-0000-7000-8000-000000000002";
    const stranger = keysOf({ [other]: dataKey() });
    const elsewhere = await openSealedObject(store, stranger, {
      ...object,
      tenantId: other,
    });
    if (!elsewhere) throw new Error("the object is there");
    await expect(drain(elsewhere)).rejects.toThrow("does not open");
    expect(await read()).not.toBeNull();
  });
});
