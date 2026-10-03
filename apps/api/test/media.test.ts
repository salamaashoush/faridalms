import { describe, expect, test } from "bun:test";
import { createDecipheriv } from "node:crypto";

import { mediaWorkerToken, streamLinkKey } from "../src/media/streams";
import { login, MEDIA_ORIGIN, raw, seeded, sessionFor } from "./harness";

/** An MP4's signature, which is all the upload check reads. */
const mp4 = () =>
  new Blob([
    new Uint8Array([
      0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0,
    ]),
  ]);

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
