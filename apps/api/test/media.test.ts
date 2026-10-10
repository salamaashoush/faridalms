import { partKey, readyKey } from "@faridalms/database/stores/files";
import { plainContent } from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";
import { createDecipheriv } from "node:crypto";

import type { FileStore } from "../src/files/store";

import { sweepTenantFiles } from "../src/files/sweep";
import { mediaWorkerToken, streamLinkKey } from "../src/media/streams";
import {
  login,
  MEDIA_ORIGIN,
  PART_BYTES,
  raw,
  rejection,
  seeded,
  sessionFor,
  VIDEO_BYTES,
} from "./harness";

/** An MP4's signature, which is all the upload check reads. */
const mp4 = () =>
  new Blob([
    new Uint8Array([
      0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0,
    ]),
  ]);

/** A WebM's signature: the EBML header a browser's recorder writes first. */
const webm = () =>
  new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81])]);

async function uploadVideo(
  session: Awaited<ReturnType<typeof sessionFor>>,
  name = "lesson.mp4",
) {
  const file = await session.api.files.initiate({
    purpose: "document_media",
    name,
    mediaType: "video/mp4",
    sizeBytes: mp4().size,
  });
  const put = await raw(
    "northwind",
    session.token,
    `/v1/files/${file.id}/content`,
    {
      method: "PUT",
      body: mp4(),
    },
  );
  expect(put.status).toBe(200);
  return file.id;
}

const worker = () => mediaWorkerToken(seeded().cellSecret);

const call = (path: string, body: unknown = {}, token = worker()) =>
  raw("northwind", token, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

/** Claims until the given video comes up, settling any other test's videos first. */
async function claimVideo(fileId: string) {
  for (let tries = 0; tries < 20; tries += 1) {
    const response = await call("/v1/media/claim");
    if (response.status === 204) return null;
    const job = (await response.json()) as {
      id: string;
      sourceKey: string;
      outputPrefix: string;
      trim: { startSeconds: number; endSeconds: number } | null;
    };
    if (job.id.endsWith(`.${fileId}`)) return job;
    await call(`/v1/media/jobs/${job.id}/failed`, { error: "not this test's" });
  }
  return null;
}

function openStream(token: string) {
  const sealed = Buffer.from(token, "base64url");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    streamLinkKey(seeded().cellSecret),
    sealed.subarray(0, 12),
  );
  decipher.setAuthTag(sealed.subarray(-16));
  const plain = Buffer.concat([
    decipher.update(sealed.subarray(12, -16)),
    decipher.final(),
  ]).toString();
  return JSON.parse(plain) as [string, number];
}

const MANIFEST = {
  durationSeconds: 61.5,
  width: 1280,
  height: 720,
  renditions: [{ name: "720p", height: 720, bandwidth: 2_800_000 }],
  audio: true,
  master: "master.m3u8",
  poster: "poster.jpg",
  thumbnails: "thumbs/thumbs.vtt",
};

describe("video streams", () => {
  test("an uploaded video is encoded by the media service and plays from a sealed link", async () => {
    const teacher = await sessionFor("northwind", login("teacher"));
    const fileId = await uploadVideo(teacher);
    const streamPath = `/v1/files/${fileId}/stream`;

    const waiting = await raw("northwind", teacher.token, streamPath);
    expect(await waiting.json()).toEqual({ state: "queued", master: null });

    expect((await call("/v1/media/claim", {}, "not-the-token")).status).toBe(
      401,
    );
    const job = await claimVideo(fileId);
    if (!job) throw new Error("the video was never offered");
    const [tenantId] = job.id.split(".");
    expect(job.outputPrefix).toBe(`t/${tenantId}/v/${fileId}`);
    expect(job.sourceKey.startsWith(`t/${tenantId}/`)).toBe(true);

    expect(
      (await call(`/v1/media/jobs/${job.id}/progress`, { progress: 0.4 }))
        .status,
    ).toBe(204);
    expect(
      (
        await call(`/v1/media/jobs/${job.id}/done`, {
          manifest: { ...MANIFEST, master: "../../escape.m3u8" },
        })
      ).status,
    ).toBe(400);
    expect(
      (await call(`/v1/media/jobs/${job.id}/done`, { manifest: MANIFEST }))
        .status,
    ).toBe(204);

    const ready = (await (
      await raw("northwind", teacher.token, streamPath)
    ).json()) as {
      state: string;
      master: string;
      poster: string;
      durationMs: number;
      height: number;
    };
    expect(ready).toMatchObject({
      state: "ready",
      durationMs: 61_500,
      height: 720,
    });
    const match =
      /^http:\/\/media\.test\/v\/([A-Za-z0-9_-]+)\/master\.m3u8$/.exec(
        ready.master,
      );
    expect(match).not.toBeNull();
    expect(ready.master.startsWith(MEDIA_ORIGIN)).toBe(true);
    const [prefix, expires] = openStream(match?.[1] ?? "");
    expect(prefix).toBe(job.outputPrefix);
    expect(expires).toBeGreaterThan(Date.now() / 1000);

    // Someone the upload is not shared with cannot ask for it.
    const stranger = await sessionFor("northwind", login("student"));
    expect((await raw("northwind", stranger.token, streamPath)).status).toBe(404);
  });

  test("a video that is gone takes its streams with it", async () => {
    const teacher = await sessionFor("northwind", login("teacher"));
    const fileId = await uploadVideo(teacher, "never-used.mp4");
    const job = await claimVideo(fileId);
    if (!job) throw new Error("the video was never offered");
    expect(
      (await call(`/v1/media/jobs/${job.id}/done`, { manifest: MANIFEST }))
        .status,
    ).toBe(204);

    const { cell, files, tenants } = seeded();
    const tenantId = tenants[0]?.tenantId ?? "";
    const removed: string[] = [];
    const store: FileStore = {
      write: (key, body, limit) => files.write(key, body, limit),
      open: (key, range) => files.open(key, range),
      move: (from, to) => files.move(from, to),
      remove: (key) => files.remove(key),
      removeFolder: async (folder) => {
        removed.push(folder);
        await files.removeFolder(folder);
      },
    };
    // While the video is kept, so are its streams.
    await sweepTenantFiles(cell, store, tenantId, new Date());
    expect(removed).not.toContain(job.outputPrefix);

    // Nothing ever used it, so the sweep retires it a week on.
    const later = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    const swept = await sweepTenantFiles(cell, store, tenantId, later);
    expect(swept.streams).toBeGreaterThanOrEqual(1);
    expect(removed).toContain(job.outputPrefix);
    expect(
      (await raw("northwind", teacher.token, `/v1/files/${fileId}/stream`)).status,
    ).toBe(404);

    // The folder is handed back once.
    removed.length = 0;
    await sweepTenantFiles(cell, store, tenantId, later);
    expect(removed).not.toContain(job.outputPrefix);
  });

  test("a video that keeps failing is left playing as uploaded", async () => {
    const teacher = await sessionFor("northwind", login("teacher"));
    const fileId = await uploadVideo(teacher, "broken.mp4");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const job = await claimVideo(fileId);
      if (!job) throw new Error(`attempt ${attempt + 1} was never offered`);
      await call(`/v1/media/jobs/${job.id}/failed`, {
        error: "ffmpeg failed: moov atom not found",
      });
    }
    expect(await claimVideo(fileId)).toBeNull();
    const shown = await raw(
      "northwind",
      teacher.token,
      `/v1/files/${fileId}/stream`,
    );
    expect(await shown.json()).toEqual({ state: "failed", master: null });
  });
});

/** Claims caption drafts until the given recording's comes up, failing any other test's. */
async function claimDraft(fileId: string) {
  for (let tries = 0; tries < 20; tries += 1) {
    const response = await call("/v1/media/claim", { captions: true });
    if (response.status === 204) return null;
    const job = (await response.json()) as {
      id: string;
      kind: "streams" | "captions";
      language?: string;
    };
    if (job.kind === "captions" && job.id.endsWith(`.${fileId}`)) return job;
    await call(
      `/v1/media/${job.kind === "captions" ? "captions" : "jobs"}/${job.id}/failed`,
      { error: "not this test's" },
    );
  }
  return null;
}

describe("a recording its maker cut", () => {
  test("is cut by the media service, and until then opens for nobody else", async () => {
    // The seed's second teacher teaches Arabic to every grade.
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const file = await teacher.api.files.initiate({
      purpose: "document_media",
      name: "recording.webm",
      mediaType: "video/webm",
      sizeBytes: webm().size,
      trim: { startMs: 2500, endMs: 61_000 },
    });
    expect(
      (
        await raw("northwind", teacher.token, `/v1/files/${file.id}/content`, {
          method: "PUT",
          body: webm(),
        })
      ).status,
    ).toBe(200);

    // The recording goes out to a class in an assignment's brief.
    const { classes } = await teacher.api.coursework.options();
    let classId = "";
    for (const row of classes.filter(
      (item) => item.classType === "scheduled",
    )) {
      const { roster } = await teacher.api.coursework.groups({
        classId: row.id,
      });
      if (roster.some((pupil) => pupil.id === me.id)) classId = row.id;
    }
    const brief = plainContent("Watch the recording.");
    brief.root.children?.push({
      type: "media",
      version: 1,
      format: "",
      fileId: file.id,
      name: "recording.webm",
      mime: "video/webm",
      bytes: webm().size,
    });
    const saved = await teacher.api.coursework.save({
      classId,
      title: "A recording in the brief",
      brief,
      audience: "class",
      latePolicy: "accept",
      submissionFormat: "both",
      points: 10,
      rubric: null,
    });
    await teacher.api.coursework.publish({
      id: saved.id,
      expectedVersion: saved.version,
    });
    const path = `/v1/files/${file.id}/content`;
    // Its maker sees it; the class does not, while it holds what was cut.
    expect((await raw("northwind", teacher.token, path)).status).toBe(200);
    expect((await raw("northwind", student.token, path)).status).toBe(404);
    expect(
      (await raw("northwind", student.token, `/v1/files/${file.id}/stream`)).status,
    ).toBe(404);

    const job = await claimVideo(file.id);
    if (!job) throw new Error("the recording was never offered");
    expect(job.trim).toEqual({ startSeconds: 2.5, endSeconds: 61 });
    // A worker that made streams but no cut has not finished the job.
    expect(
      (await call(`/v1/media/jobs/${job.id}/done`, { manifest: MANIFEST }))
        .status,
    ).toBe(409);
    expect(
      (
        await call(`/v1/media/jobs/${job.id}/done`, {
          manifest: MANIFEST,
          source: { sizeBytes: 4321, sha256: "ab".repeat(32) },
        })
      ).status,
    ).toBe(204);

    // Cut, it opens for the class, as the MP4 the worker put in its place.
    expect((await raw("northwind", student.token, path)).status).toBe(200);
    const [facts] = (await teacher.api.files.facts({ ids: [file.id] })).files;
    expect(facts).toMatchObject({
      name: "recording.mp4",
      mediaType: "video/mp4",
      sizeBytes: 4321,
    });
  });

  test("is refused where no media service could cut it", async () => {
    const teacher = await sessionFor("northwind", login("teacher"));
    expect(
      await rejection(
        teacher.api.files.initiate({
          purpose: "document_media",
          name: "notes.pdf",
          mediaType: "application/pdf",
          sizeBytes: 100,
          trim: { startMs: 0, endMs: 5000 },
        }),
      ),
    ).toBeTruthy();
    expect(await teacher.api.files.abilities()).toEqual({ trim: true });
  });
});

describe("a large upload sent in parts", () => {
  test("parts arrive in any order, a lost one is named, and the whole is checked", async () => {
    const teacher = await sessionFor("northwind", login("teacher"));
    const bytes = new Uint8Array(PART_BYTES + 4096).map(
      (_value, index) => index % 251,
    );
    bytes.set(new Uint8Array(await mp4().arrayBuffer()));
    const file = await teacher.api.files.initiate({
      purpose: "document_media",
      name: "long-lesson.mp4",
      mediaType: "video/mp4",
      sizeBytes: bytes.byteLength,
    });
    const send = (
      path: string,
      method: string,
      body?: Uint8Array<ArrayBuffer>,
    ) =>
      raw("northwind", teacher.token, `/v1/files/${file.id}/parts${path}`, {
        method,
        ...(body ? { body } : {}),
      });
    const first = bytes.subarray(0, PART_BYTES);
    const last = bytes.subarray(PART_BYTES);

    // The tail arrives before the head, and the head is asked for.
    expect((await send("/1", "PUT", last)).status).toBe(204);
    const early = await send("", "POST");
    expect(early.status).toBe(409);
    expect(await early.json()).toMatchObject({
      code: "file.part_missing",
      part: 0,
    });

    // A part past the file's end, one too big, and one from someone else.
    expect((await send("/2", "PUT", last)).status).toBe(400);
    expect(
      (await send("/0", "PUT", new Uint8Array(PART_BYTES + 1))).status,
    ).toBe(413);
    const stranger = await sessionFor("northwind", login("student"));
    expect(
      (
        await raw("northwind", stranger.token, `/v1/files/${file.id}/parts/0`, {
          method: "PUT",
          body: first,
        })
      ).status,
    ).toBe(404);

    // Sent twice, a part replaces itself.
    expect((await send("/0", "PUT", first)).status).toBe(204);
    expect((await send("/0", "PUT", first)).status).toBe(204);
    const done = await send("", "POST");
    expect(done.status).toBe(200);
    expect(await done.json()).toMatchObject({
      id: file.id,
      sizeBytes: bytes.byteLength,
    });
    expect(file.partBytes).toBe(PART_BYTES);

    const { files, tenants } = seeded();
    const tenantId = tenants[0]?.tenantId ?? "";
    const stored = await files.open(readyKey(tenantId, file.id));
    const back = new Uint8Array(await new Response(stored).arrayBuffer());
    expect(new Bun.CryptoHasher("sha256").update(back).digest("hex")).toBe(
      new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
    );
    expect(await files.open(partKey(tenantId, file.id, 0))).toBeNull();
    // Once whole, the upload takes no more parts.
    expect((await send("/0", "PUT", first)).status).toBe(404);
  });

  test("a video may weigh more than any other file, and no more than a video may", async () => {
    const teacher = await sessionFor("northwind", login("teacher"));
    const sizeBytes = VIDEO_BYTES - 1024;
    const bytes = new Uint8Array(sizeBytes);
    bytes.set(new Uint8Array(await mp4().arrayBuffer()));
    const video = await teacher.api.files.initiate({
      purpose: "document_media",
      name: "whole-lesson.mp4",
      mediaType: "video/mp4",
      sizeBytes,
    });
    const parts = Math.ceil(sizeBytes / PART_BYTES);
    for (let part = 0; part < parts; part += 1) {
      const sent = await raw(
        "northwind",
        teacher.token,
        `/v1/files/${video.id}/parts/${part}`,
        {
          method: "PUT",
          body: bytes.subarray(part * PART_BYTES, (part + 1) * PART_BYTES),
        },
      );
      expect(sent.status).toBe(204);
    }
    const done = await raw(
      "northwind",
      teacher.token,
      `/v1/files/${video.id}/parts`,
      { method: "POST" },
    );
    expect(done.status).toBe(200);

    // The same weight as a document is refused, and so is a video past its limit.
    expect(
      await rejection(
        teacher.api.files.initiate({
          purpose: "document_media",
          name: "heavy.pdf",
          mediaType: "application/pdf",
          sizeBytes,
        }),
      ),
    ).toMatchObject({ message: "file.too_large" });
    expect(
      await rejection(
        teacher.api.files.initiate({
          purpose: "document_media",
          name: "too-long.mp4",
          mediaType: "video/mp4",
          sizeBytes: VIDEO_BYTES + 1,
        }),
      ),
    ).toMatchObject({ message: "file.too_large" });
  });

  test("an upload given up part way leaves no parts behind", async () => {
    const teacher = await sessionFor("northwind", login("teacher"));
    const file = await teacher.api.files.initiate({
      purpose: "document_media",
      name: "given-up.mp4",
      mediaType: "video/mp4",
      sizeBytes: PART_BYTES + 10,
    });
    expect(
      (
        await raw("northwind", teacher.token, `/v1/files/${file.id}/parts/1`, {
          method: "PUT",
          body: new Uint8Array(10),
        })
      ).status,
    ).toBe(204);
    const { cell, files, tenants } = seeded();
    const tenantId = tenants[0]?.tenantId ?? "";
    expect(await files.open(partKey(tenantId, file.id, 1))).not.toBeNull();
    await sweepTenantFiles(
      cell,
      files,
      tenantId,
      new Date(Date.now() + 25 * 60 * 60 * 1000),
    );
    expect(await files.open(partKey(tenantId, file.id, 1))).toBeNull();
  });
});

describe("captions drafted from speech", () => {
  test("a teacher asks for a recording's captions, which the media service drafts", async () => {
    const teacher = await sessionFor("northwind", login("teacher"));
    const fileId = await uploadVideo(teacher, "talk.mp4");
    expect(await teacher.api.files.captionDraft({ fileId })).toEqual({
      available: true,
      draft: null,
    });
    await teacher.api.files.draftCaptions({ fileId, language: "en" });
    expect(await teacher.api.files.captionDraft({ fileId })).toMatchObject({
      draft: { state: "queued", language: "en" },
    });

    const job = await claimDraft(fileId);
    if (!job) throw new Error("the draft was never offered");
    expect(job.language).toBe("en");
    expect(
      (await call(`/v1/media/captions/${job.id}/progress`, { progress: 0.5 }))
        .status,
    ).toBe(204);
    expect(await teacher.api.files.captionDraft({ fileId })).toMatchObject({
      draft: { state: "working", progress: 0.5 },
    });
    expect(
      (await call(`/v1/media/captions/${job.id}/done`, { vtt: "not captions" }))
        .status,
    ).toBe(400);
    const vtt = "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nHello, class.\n";
    expect(
      (await call(`/v1/media/captions/${job.id}/done`, { vtt })).status,
    ).toBe(204);
    expect(await teacher.api.files.captionDraft({ fileId })).toMatchObject({
      draft: { state: "ready", vtt },
    });

    // A student may neither ask for captions nor read a draft.
    const pupil = await sessionFor("northwind", login("student"));
    expect(
      await rejection(pupil.api.files.captionDraft({ fileId })),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});
