import { readyKey } from "@faridalms/database/stores/files";
import { plainContent } from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import type { FileStore } from "../src/files/store";

import { sweepTenantFiles } from "../src/files/sweep";
import { mediaWorkerToken } from "../src/media/streams";
import { client, login, raw, seeded, sessionFor } from "./harness";

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));

const segment = (marker: number, body: number[]) => [
  0xff,
  marker,
  (body.length + 2) >> 8,
  (body.length + 2) & 0xff,
  ...body,
];

/** An EXIF block naming an orientation and where the photo was taken. */
function cameraExif(orientation: number) {
  // A big-endian TIFF: an IFD of the orientation and a pointer to the
  // GPS data, which follows as text.
  const tiff = [
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08,
    0x00,
    0x02,
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    orientation,
    0x00,
    0x00,
    0x88,
    0x25,
    0x00,
    0x04,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x26,
    0x00,
    0x00,
    0x00,
    0x00,
    ...ascii("GPSLatitude 30.0444N 31.2357E"),
  ];
  return [...ascii("Exif\0\0"), ...tiff];
}

/**
 * A phone's photo as its bytes are laid out, though not a picture worth
 * decoding. Its comment carries a mark of its own, since the school keeps
 * one copy of the same bytes and another photo's previews would be shared.
 */
const cameraJpeg = (orientation = 6, mark: string = crypto.randomUUID()) =>
  Uint8Array.from([
    0xff,
    0xd8,
    ...segment(0xe0, [...ascii("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segment(0xe1, cameraExif(orientation)),
    ...segment(0xfe, ascii(`Taken by a phone at home ${mark}`)),
    ...segment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]),
    ...segment(0xc0, [8, 0, 16, 0, 16, 1, 1, 0x11, 0]),
    ...segment(0xda, [1, 1, 0, 0, 63, 0]),
    0x12,
    0x34,
    0x56,
    0xff,
    0xd9,
  ]);

const has = (bytes: Uint8Array, text: string) =>
  Buffer.from(bytes).includes(Buffer.from(text, "latin1"));

const worker = () => mediaWorkerToken(seeded().cellSecret);

const call = (path: string, body: unknown = {}) =>
  raw("northwind", worker(), path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

type Session = Awaited<ReturnType<typeof sessionFor>>;

async function upload(
  session: Session,
  name: string,
  mediaType: string,
  bytes: Uint8Array<ArrayBuffer>,
) {
  const file = await session.api.files.initiate({
    purpose: "document_media",
    name,
    mediaType,
    sizeBytes: bytes.byteLength,
  });
  const put = await raw(
    "northwind",
    session.token,
    `/v1/files/${file.id}/content`,
    { method: "PUT", body: bytes },
  );
  expect(put.status).toBe(200);
  return file.id;
}

interface PreviewJob {
  id: string;
  kind: string;
  sourceKey: string;
  outputPrefix: string;
  mediaType: string;
  rewrite: boolean;
}

/**
 * Claims previews only, as the service's own lane does, until the file's
 * come up; any other test's are failed out of the way.
 */
async function claimPreview(
  fileKey: string,
  can = { pdf: true, office: true },
): Promise<PreviewJob | null> {
  // Every picture other suites uploaded waits in the same queue, so the
  // queue is walked to its end; a claimed job leaves it, so the walk ends.
  for (;;) {
    const response = await call("/v1/media/claim", {
      streams: false,
      captions: false,
      previews: can,
    });
    if (response.status === 204) return null;
    const job = (await response.json()) as PreviewJob;
    if (job.sourceKey === fileKey) return job;
    await call(`/v1/media/previews/${job.id}/failed`, {
      error: "not this test's",
    });
  }
}

const tenantId = () => seeded().tenants[0]?.tenantId ?? "";

/** Puts what the worker made where it says it made it. */
async function made(
  prefix: string,
  name: string,
  bytes: Uint8Array<ArrayBuffer>,
) {
  await seeded().files.write(
    `${prefix}/${name}`,
    new Blob([bytes]).stream(),
    bytes.byteLength,
  );
}

const sizeOf = (name: string, width: number, bytes: number) => ({
  name,
  width,
  height: Math.round((width * 3) / 4),
  mediaType: name.endsWith(".avif") ? "image/avif" : "image/webp",
  bytes,
});

describe("pictures", () => {
  test("a photo keeps neither where it was taken nor its camera, only how it stands", async () => {
    const teacher = await sessionFor("northwind", login("teacher"));
    const photo = cameraJpeg(6);
    const fileId = await upload(teacher, "trip.jpg", "image/jpeg", photo);
    const stored = await seeded().files.open(readyKey(tenantId(), fileId));
    if (!stored) throw new Error("the photo was not kept");
    const bytes = await new Response(stored).bytes();
    expect(has(bytes, "GPSLatitude")).toBe(false);
    expect(has(bytes, "Taken by a phone")).toBe(false);
    expect(has(bytes, "JFIF")).toBe(true);
    // Its orientation alone stays, for the media service to turn it upright.
    expect(has(bytes, "Exif")).toBe(true);
    expect(bytes.byteLength).toBeLessThan(photo.byteLength);
    const [facts] = (await teacher.api.files.facts({ ids: [fileId] })).files;
    expect(facts?.sizeBytes).toBe(bytes.byteLength);
  });

  test("its sizes are made once, and a browser is sent the size it needs in the best format it draws", async () => {
    const teacher = await sessionFor("northwind", login("teacher"));
    const fileId = await upload(
      teacher,
      "hall.jpg",
      "image/jpeg",
      cameraJpeg(1),
    );
    const key = readyKey(tenantId(), fileId);
    const job = await claimPreview(key);
    if (!job) throw new Error("the picture was never offered");
    expect(job).toMatchObject({
      kind: "previews",
      mediaType: "image/jpeg",
      rewrite: true,
    });
    expect(job.outputPrefix).toMatch(
      new RegExp(`^t/${tenantId()}/r/[0-9a-f-]{36}$`),
    );
    expect(
      (await call(`/v1/media/previews/${job.id}/progress`, { progress: 0.5 }))
        .status,
    ).toBe(204);

    const sizes = [
      sizeOf("w320.webp", 320, 11),
      sizeOf("w320.avif", 320, 7),
      sizeOf("w640.webp", 640, 22),
      sizeOf("w640.avif", 640, 14),
    ];
    for (const size of sizes)
      await made(
        job.outputPrefix,
        size.name,
        new Uint8Array(size.bytes).fill(size.width / 32),
      );
    expect(
      (
        await call(`/v1/media/previews/${job.id}/done`, {
          sizes: [{ ...sizes[0], name: "../escape.webp" }],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(`/v1/media/previews/${job.id}/done`, {
          width: 1000,
          height: 750,
          placeholder: "1QcSHQRnh493V4dIh4eXh1h4kJUI",
          sizes,
          bytes: 54,
        })
      ).status,
    ).toBe(204);

    const fetchAt = (query: string, accept?: string) =>
      raw("northwind", teacher.token, `/v1/files/${fileId}/content${query}`, {
        headers: accept ? { accept } : {},
      });
    const avif = await fetchAt("?w=300", "image/avif,image/webp,*/*");
    expect(avif.headers.get("content-type")).toBe("image/avif");
    expect((await avif.bytes()).byteLength).toBe(7);
    const webp = await fetchAt("?w=600", "image/webp,*/*");
    expect(webp.headers.get("content-type")).toBe("image/webp");
    expect((await webp.bytes()).byteLength).toBe(22);
    // Wider than anything made, or a browser that draws neither format, gets the picture itself.
    expect(
      (await fetchAt("?w=2400", "image/avif")).headers.get("content-type"),
    ).toBe("image/jpeg");
    expect(
      (await fetchAt("?w=320", "image/png")).headers.get("content-type"),
    ).toBe("image/jpeg");
    // Downloading always gives the picture as kept.
    expect(
      (await fetchAt("?w=320&download", "image/avif")).headers.get(
        "content-type",
      ),
    ).toBe("image/jpeg");

    const [facts] = (await teacher.api.files.facts({ ids: [fileId] })).files;
    expect(facts).toMatchObject({
      width: 1000,
      height: 750,
      placeholder: "1QcSHQRnh493V4dIh4eXh1h4kJUI",
    });

    // Its sizes reach only those who may see the picture.
    const stranger = await sessionFor("northwind", login("student"));
    expect(
      (
        await raw(
          "northwind",
          stranger.token,
          `/v1/files/${fileId}/content?w=320`,
          { headers: { accept: "image/avif" } },
        )
      ).status,
    ).toBe(404);
  });

  test("a post published before its picture's sizes existed gets them as they are made", async () => {
    const office = await sessionFor("northwind", login("principal"));
    const fileId = await upload(
      office,
      "harvest.jpg",
      "image/jpeg",
      cameraJpeg(1),
    );
    const slug = `harvest-${crypto.randomUUID().slice(0, 8)}`;
    const body = plainContent("The harvest came in.");
    const saved = await office.api.broadcasts.news.save({
      id: "",
      expectedVersion: 0,
      visibility: "public",
      primaryLocale: "en",
      titleEn: "Harvest",
      titleAr: "",
      excerptEn: "",
      excerptAr: "",
      slug,
      categoryId: "",
      coverFileId: fileId,
      coverAltEn: "Baskets of dates",
      coverAltAr: "",
      pinned: false,
      audiences: [],
      body: {
        root: {
          ...body.root,
          children: [
            {
              type: "image",
              version: 1,
              fileId,
              alt: "Baskets of dates",
              caption: "",
              size: "full",
            },
            ...(body.root.children ?? []),
          ],
        },
      },
      translation: null,
    });
    const published = await office.api.broadcasts.news.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const read = () =>
      client("northwind").site.publicSitePost({
        school: "northwind",
        locale: "en",
        slug,
      });
    const before = await read();
    expect(before.coverKey).not.toBeNull();
    expect(before.coverPicture).toBeNull();
    expect(before.pictures[fileId]).toBeUndefined();

    const job = await claimPreview(readyKey(tenantId(), fileId));
    if (!job) throw new Error("the picture was never offered");
    const sizes = [sizeOf("w320.webp", 320, 9), sizeOf("w320.avif", 320, 5)];
    for (const size of sizes)
      await made(job.outputPrefix, size.name, new Uint8Array(size.bytes));
    expect(
      (
        await call(`/v1/media/previews/${job.id}/done`, {
          width: 800,
          height: 600,
          placeholder: "1QcSHQRnh493V4dIh4eXh1h4kJUI",
          sizes,
          bytes: 14,
        })
      ).status,
    ).toBe(204);

    // Without publishing again, the copy visitors read draws from its sizes,
    // which sit beside the picture in its public folder.
    const after = await read();
    const kept = {
      width: 800,
      height: 600,
      placeholder: "1QcSHQRnh493V4dIh4eXh1h4kJUI",
      sizes: [
        { name: "w320.webp", width: 320, mediaType: "image/webp" as const },
        { name: "w320.avif", width: 320, mediaType: "image/avif" as const },
      ],
    };
    expect(after.pictures[fileId]).toEqual(kept);
    expect(after.coverPicture).toEqual(kept);
    const folder = (after.coverKey ?? "").slice(
      0,
      (after.coverKey ?? "").lastIndexOf("/"),
    );
    const size = await seeded().dependencies.publicMedia.open(
      `${folder}/w320.avif`,
    );
    expect(size ? (await new Response(size).bytes()).byteLength : 0).toBe(5);
    // Publishing again finds them published and copies nothing twice.
    await office.api.broadcasts.news.publish({
      id: saved.id,
      expectedVersion: published.version,
    });
    expect((await read()).coverPicture).toEqual(kept);
  });

  test("a worker that never asked for previews is never handed one", async () => {
    const teacher = await sessionFor("northwind", login("teacher"));
    await upload(teacher, "old-worker.jpg", "image/jpeg", cameraJpeg(1));
    const response = await call("/v1/media/claim", {
      streams: false,
      captions: false,
    });
    expect(response.status).toBe(204);
  });
});

describe("documents and sound", () => {
  test("a PDF's first page and a recording's waveform are shown from what the worker made", async () => {
    const teacher = await sessionFor("northwind", login("teacher"));
    const pdfId = await upload(
      teacher,
      "timetable.pdf",
      "application/pdf",
      new TextEncoder().encode("%PDF-1.4\n%%EOF\n"),
    );
    const job = await claimPreview(readyKey(tenantId(), pdfId));
    if (!job) throw new Error("the PDF was never offered");
    expect(job.rewrite).toBe(false);
    await made(job.outputPrefix, "page1-w320.webp", new Uint8Array(9));
    expect(
      (
        await call(`/v1/media/previews/${job.id}/done`, {
          width: 1131,
          height: 1600,
          placeholder: "1QcSHQRnh493V4dIh4eXh1h4kJUI",
          sizes: [sizeOf("page1-w320.webp", 320, 9)],
          pages: 3,
          bytes: 9,
        })
      ).status,
    ).toBe(204);
    const page = await raw(
      "northwind",
      teacher.token,
      `/v1/files/${pdfId}/content?page=1&w=320`,
    );
    expect(page.headers.get("content-type")).toBe("image/webp");
    const [pdf] = (await teacher.api.files.facts({ ids: [pdfId] })).files;
    expect(pdf).toMatchObject({ page: true });
    // A page is the document's, not the picture's size of it.
    expect(pdf?.width).toBeUndefined();

    const soundId = await upload(
      teacher,
      "reading.mp3",
      "audio/mpeg",
      Uint8Array.from([...ascii("ID3"), 4, 0, 0, 0, 0, 0, 0]),
    );
    const sound = await claimPreview(readyKey(tenantId(), soundId));
    if (!sound) throw new Error("the recording was never offered");
    const waveform = Array.from({ length: 100 }, (_, at) => at % 101);
    expect(
      (
        await call(`/v1/media/previews/${sound.id}/done`, {
          durationMs: 61_000,
          waveform,
          bytes: 0,
        })
      ).status,
    ).toBe(204);
    const [recording] = (await teacher.api.files.facts({ ids: [soundId] }))
      .files;
    expect(recording).toMatchObject({ durationMs: 61_000, waveform });
  });

  test("an office file waits for a worker that converts, and then reads as a PDF", async () => {
    const teacher = await sessionFor("northwind", login("teacher"));
    const docxId = await upload(
      teacher,
      "letter.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]),
    );
    const key = readyKey(tenantId(), docxId);
    expect(await claimPreview(key, { pdf: true, office: false })).toBeNull();
    const path = `/v1/files/${docxId}/content?as=pdf`;
    expect((await raw("northwind", teacher.token, path)).status).toBe(404);

    const job = await claimPreview(key);
    if (!job) throw new Error("the office file was never offered");
    await made(
      job.outputPrefix,
      "document.pdf",
      new TextEncoder().encode("%PDF-1.4\n%%EOF\n"),
    );
    expect(
      (
        await call(`/v1/media/previews/${job.id}/done`, {
          sizes: [],
          document: { name: "document.pdf", bytes: 15 },
          bytes: 15,
        })
      ).status,
    ).toBe(204);
    const converted = await raw("northwind", teacher.token, path);
    expect(converted.headers.get("content-type")).toBe("application/pdf");
    expect(converted.headers.get("content-disposition")).toContain("inline");
    expect(converted.headers.get("content-disposition")).toContain(
      "letter.pdf",
    );
    const [facts] = (await teacher.api.files.facts({ ids: [docxId] })).files;
    expect(facts).toMatchObject({ pdf: true });
  });
});

describe("the sweep", () => {
  test("cleans and queues a picture kept before previews, and retires previews no file holds", async () => {
    const teacher = await sessionFor("northwind", login("teacher"));
    const mark = crypto.randomUUID();
    const fileId = await upload(
      teacher,
      "archive.jpg",
      "image/jpeg",
      cameraJpeg(1, mark),
    );
    const { cell, files } = seeded();
    const key = readyKey(tenantId(), fileId);
    // As it was before previews: the camera's bytes, and nothing asked.
    const original = cameraJpeg(1, mark);
    await files.write(key, new Blob([original]).stream(), original.byteLength);
    await cell.withWorker(
      {
        tenantId: tenantId(),
        requestId: crypto.randomUUID(),
        actor: { kind: "system" },
      },
      "write",
      (tx) =>
        tx.execute(sql`
          update core.file_previews set status = 'tobedeleted'
          where tenant_id = ${tenantId()}::uuid and storage_key = ${key}`),
    );
    const removed: string[] = [];
    const store: FileStore = {
      write: (at, body, limit) => files.write(at, body, limit),
      open: (at, range) => files.open(at, range),
      has: (at) => files.has(at),
      move: (from, to) => files.move(from, to),
      remove: (at) => files.remove(at),
      removeFolder: async (folder) => {
        removed.push(folder);
        await files.removeFolder(folder);
      },
    };
    await sweepTenantFiles(cell, store, tenantId(), new Date(), 1000);
    const cleaned = await files.open(key);
    if (!cleaned) throw new Error("the picture is gone");
    expect(has(await new Response(cleaned).bytes(), "GPSLatitude")).toBe(false);
    const job = await claimPreview(key);
    if (!job) throw new Error("the backfill queued nothing");
    await call(`/v1/media/previews/${job.id}/done`, { sizes: [], bytes: 0 });

    // Nothing used it, so a week on it is retired, and its previews with it.
    const later = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    const swept = await sweepTenantFiles(cell, store, tenantId(), later, 1000);
    expect(swept.previews).toBeGreaterThanOrEqual(1);
    expect(removed).toContain(job.outputPrefix);
  });
});
