import { afterAll, describe, expect, test } from "bun:test";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { FileStore } from "../src/files/store";

import { DiskFileStore, S3FileStore, StoreError } from "../src/files/store";

/**
 * A stand-in S3 endpoint holding objects in memory: path-style requests,
 * ranges, and the multipart calls a large upload makes. It checks no
 * signatures; the store's job is the protocol, not the credentials.
 */
function fakeS3() {
  const objects = new Map<string, Uint8Array<ArrayBuffer>>();
  const uploads = new Map<string, Map<number, Uint8Array<ArrayBuffer>>>();
  let next = 0;
  const multipart = () => next;
  const server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const key = decodeURIComponent(url.pathname.replace(/^\/bucket\//, ""));
      const uploadId = url.searchParams.get("uploadId");
      if (request.method === "POST" && url.searchParams.has("uploads")) {
        next += 1;
        uploads.set(String(next), new Map());
        return new Response(
          `<InitiateMultipartUploadResult><Bucket>bucket</Bucket><Key>${key}</Key><UploadId>${next}</UploadId></InitiateMultipartUploadResult>`,
          { headers: { "content-type": "application/xml" } },
        );
      }
      if (uploadId !== null) {
        const parts = uploads.get(uploadId);
        if (!parts) return new Response(null, { status: 404 });
        if (request.method === "PUT") {
          const number = Number(url.searchParams.get("partNumber"));
          parts.set(number, new Uint8Array(await request.arrayBuffer()));
          return new Response(null, { headers: { etag: `"${number}"` } });
        }
        if (request.method === "POST") {
          const ordered = [...parts.entries()]
            .toSorted(([a], [b]) => a - b)
            .map(([, bytes]) => bytes);
          objects.set(key, new Uint8Array(Buffer.concat(ordered)));
          uploads.delete(uploadId);
          return new Response(
            `<CompleteMultipartUploadResult><Key>${key}</Key><ETag>"done"</ETag></CompleteMultipartUploadResult>`,
            { headers: { "content-type": "application/xml" } },
          );
        }
        uploads.delete(uploadId);
        return new Response(null, { status: 204 });
      }
      if (request.method === "GET" && url.searchParams.has("list-type")) {
        const prefix = url.searchParams.get("prefix") ?? "";
        const listed = [...objects.keys()]
          .filter((each) => each.startsWith(prefix))
          .map((each) => `<Contents><Key>${each}</Key></Contents>`);
        return new Response(
          `<ListBucketResult><IsTruncated>false</IsTruncated>${listed.join("")}</ListBucketResult>`,
          { headers: { "content-type": "application/xml" } },
        );
      }
      const stored = objects.get(key);
      switch (request.method) {
        case "PUT":
          objects.set(key, new Uint8Array(await request.arrayBuffer()));
          return new Response(null, { headers: { etag: '"put"' } });
        case "DELETE":
          objects.delete(key);
          return new Response(null, { status: 204 });
        case "HEAD":
          return stored
            ? new Response(null, {
                headers: { "content-length": String(stored.byteLength) },
              })
            : new Response(null, { status: 404 });
        default: {
          if (!stored)
            return new Response(
              "<Error><Code>NoSuchKey</Code><Message>missing</Message></Error>",
              { status: 404, headers: { "content-type": "application/xml" } },
            );
          const range = /^bytes=(\d+)-(\d*)$/.exec(
            request.headers.get("range") ?? "",
          );
          if (!range) return new Response(stored);
          const start = Number(range[1]);
          const end = range[2] ? Number(range[2]) : stored.byteLength - 1;
          return new Response(stored.subarray(start, end + 1), {
            status: 206,
            headers: {
              "content-range": `bytes ${start}-${end}/${stored.byteLength}`,
            },
          });
        }
      }
    },
  });
  return { server, objects, uploads, multipart };
}

const s3 = fakeS3();
const diskRoot = join(tmpdir(), `farida-store-test-${crypto.randomUUID()}`);
afterAll(async () => {
  await s3.server.stop(true);
  await rm(diskRoot, { recursive: true, force: true });
});

const stores: [string, FileStore][] = [
  ["disk", new DiskFileStore(diskRoot)],
  [
    "s3",
    new S3FileStore(
      new Bun.S3Client({
        bucket: "bucket",
        endpoint: `http://127.0.0.1:${s3.server.port}`,
        region: "us-east-1",
        accessKeyId: "test",
        secretAccessKey: "test",
      }),
    ),
  ],
];

const tenant = "0190a1b2-0000-7000-8000-000000000001";
const keyOf = (area: "q" | "f") => `t/${tenant}/${area}/${crypto.randomUUID()}`;

function streamOf(bytes: Uint8Array, chunk = 64 * 1024) {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.subarray(offset, offset + chunk));
      offset += chunk;
    },
  });
}

async function read(store: FileStore, key: string, range?: [number, number]) {
  const body = await store.open(
    key,
    range ? { start: range[0], end: range[1] } : undefined,
  );
  return body ? new Uint8Array(await new Response(body).arrayBuffer()) : null;
}

const sha256 = (bytes: Uint8Array) =>
  new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

describe.each(stores)("%s file store", (name, store) => {
  const held = async (key: string) =>
    name === "disk"
      ? stat(join(diskRoot, key)).then(
          () => true,
          () => false,
        )
      : s3.objects.has(key);

  test("keeps what it is given and reads it back whole or in part", async () => {
    const key = keyOf("q");
    const bytes = new TextEncoder().encode("Salama's notes on photosynthesis");
    const stored = await store.write(key, streamOf(bytes, 5), 1024);
    expect(stored).toEqual({
      sizeBytes: bytes.byteLength,
      sha256: sha256(bytes),
    });
    expect(await read(store, key)).toEqual(bytes);
    expect(
      new TextDecoder().decode((await read(store, key, [9, 13])) ?? undefined),
    ).toBe("notes");
  });

  test("streams a large object through in parts", async () => {
    const key = keyOf("q");
    const large = new Uint8Array(6 * 1024 * 1024 + 17).map(
      (_value, index) => index % 251,
    );
    const stored = await store.write(key, streamOf(large), large.byteLength);
    expect(stored.sha256).toBe(sha256(large));
    const back = await read(store, key);
    expect(back?.byteLength).toBe(large.byteLength);
    expect(back && sha256(back)).toBe(sha256(large));
  });

  test("refuses an object over the limit and keeps nothing of it", async () => {
    const key = keyOf("q");
    const write = store.write(key, streamOf(new Uint8Array(4096), 1024), 2048);
    expect(write).rejects.toEqual(new StoreError("too_large"));
    await write.catch(() => undefined);
    expect(await store.open(key)).toBeNull();
  });

  test("moves an object to its ready key and removes it", async () => {
    const from = keyOf("q");
    const to = keyOf("f");
    const bytes = new TextEncoder().encode("ready");
    await store.write(from, streamOf(bytes), 1024);
    await store.move(from, to);
    expect(await store.open(from)).toBeNull();
    expect(await read(store, to)).toEqual(bytes);
    await store.remove(to);
    expect(await store.open(to)).toBeNull();
    await store.remove(to);
  });

  test("answers a missing object with nothing", async () => {
    expect(await store.open(keyOf("f"))).toBeNull();
  });

  test("removes a video's streams, every file of them, and nothing beside", async () => {
    const folder = `t/${tenant}/v/${crypto.randomUUID()}`;
    const parts = ["master.m3u8", "poster.jpg", "720p/seg_000.m4s"];
    for (const part of parts) {
      if (name === "disk") {
        await mkdir(join(diskRoot, folder, "720p"), { recursive: true });
        await writeFile(join(diskRoot, folder, part), "stream");
      } else s3.objects.set(`${folder}/${part}`, new Uint8Array([1]));
    }
    const kept = keyOf("f");
    await store.write(kept, streamOf(new TextEncoder().encode("kept")), 64);

    await store.removeFolder(folder);
    for (const part of parts)
      expect(await held(`${folder}/${part}`)).toBe(false);
    expect(await store.open(kept)).not.toBeNull();
    // Streams already gone are no error, and only a stream folder is taken.
    await store.removeFolder(folder);
    expect(store.removeFolder(`t/${tenant}/f`)).rejects.toEqual(
      new StoreError("invalid_key"),
    );
    expect(store.removeFolder(`t/${tenant}`)).rejects.toEqual(
      new StoreError("invalid_key"),
    );
  });

  test("refuses a key outside the school's prefixes", async () => {
    expect(store.open("../../etc/passwd")).rejects.toEqual(
      new StoreError("invalid_key"),
    );
    expect(
      store.write(
        `t/${tenant}/x/${crypto.randomUUID()}`,
        streamOf(new Uint8Array(1)),
        8,
      ),
    ).rejects.toEqual(new StoreError("invalid_key"));
  });
});

test("the large object went up in parts, and none was left unfinished", () => {
  expect(s3.multipart()).toBeGreaterThan(0);
  expect(s3.uploads.size).toBe(0);
});
