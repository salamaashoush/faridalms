import type { CellTransaction } from "@faridalms/database/context";

import {
  claimStream,
  fileById,
  streamFailed,
  streamOf,
  streamProgress,
  streamReady,
} from "@faridalms/database/stores/files";
import { ORPCError } from "@orpc/server";
import { createCipheriv, createHmac, timingSafeEqual } from "node:crypto";
import * as v from "valibot";

import type { RequestContext, SchoolContext } from "../core/context";

import { openUnit, schoolOf } from "../core/procedure";
import { canReadFile } from "../files/authorize";
import { claimCaptions, reportCaptions } from "./captions";

/**
 * A worker holds a video this long between reports. An encode reports every
 * few seconds, so a lease runs out only once its worker is gone, and the
 * video is then taken again.
 */
export const LEASE_MS = 10 * 60 * 1000;
/** A player keeps a stream's link through a long lesson. */
export const STREAM_LINK_SECONDS = 4 * 60 * 60;

const derive = (secret: Uint8Array, label: string) =>
  createHmac("sha256", secret).update(label).digest();

/** The key stream links are sealed with; the media service opens them with the same derivation. */
export const streamLinkKey = (secret: Uint8Array) =>
  derive(secret, "media-link-v1");

/** What the media service shows when it asks for work. */
export const mediaWorkerToken = (secret: Uint8Array) =>
  derive(secret, "media-worker-v1").toString("base64url");

/**
 * Seals a link to one video's folder of streams, as the files host's links
 * are sealed: encrypted as well as signed, so it says nothing and cannot be
 * forged or widened to another folder.
 */
export function sealStream(
  key: Buffer,
  grant: { prefix: string; expires: number },
): string {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify([grant.prefix, grant.expires])),
    cipher.final(),
  ]);
  return Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url");
}

const streamFolder = (tenantId: string, fileId: string) =>
  `t/${tenantId}/v/${fileId}`;

const manifestSchema = v.object({
  durationSeconds: v.pipe(v.number(), v.minValue(0.01), v.maxValue(86_400)),
  width: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(16_384)),
  height: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(16_384)),
  master: v.literal("master.m3u8"),
  poster: v.literal("poster.jpg"),
  thumbnails: v.literal("thumbs/thumbs.vtt"),
});

const JOB_PATH =
  /^\/v1\/media\/(jobs|captions)\/([0-9a-f-]{36})\.([0-9a-f-]{36})\/(progress|done|failed)$/;
const STREAM_PATH = /^\/v1\/files\/([0-9a-f-]{36})\/stream$/;

export function problem(status: number, code: string, requestId: string) {
  return Response.json({ code, requestId }, { status });
}

function fromWorker(request: Request, context: RequestContext): boolean {
  const given = Buffer.from(
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "",
  );
  const expected = Buffer.from(mediaWorkerToken(context.cellSecret));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Only the worker may move a file's streams along, as it alone settles uploads. */
export const asWorker = <T>(
  context: RequestContext,
  tenantId: string,
  run: (tx: CellTransaction) => Promise<T>,
) =>
  context.cell.withWorker(
    { tenantId, requestId: context.requestId, actor: { kind: "system" } },
    "write",
    run,
  );

/**
 * The oldest waiting video in any school of the cell, leased to the asking
 * worker; with none, a recording whose captions are to be drafted, when the
 * worker has a speech model.
 */
async function claim(
  request: Request,
  context: RequestContext,
): Promise<Response> {
  const now = new Date();
  const until = new Date(now.getTime() + LEASE_MS);
  for (const tenantId of await context.directory.tenantsOfCell(
    context.cellId,
  )) {
    const job = await asWorker(context, tenantId, (tx) =>
      claimStream(tx, { tenantId, now, until }),
    );
    if (job)
      return Response.json({
        id: `${tenantId}.${job.fileId}`,
        kind: "streams",
        sourceKey: job.storageKey,
        outputPrefix: streamFolder(tenantId, job.fileId),
      });
  }
  const asked = v.safeParse(
    v.object({ captions: v.optional(v.boolean(), false) }),
    await request.json().catch(() => ({})),
  );
  const captions =
    asked.success && asked.output.captions && context.mediaCaptions
      ? await claimCaptions(context)
      : null;
  return captions ?? new Response(null, { status: 204 });
}

async function report(
  request: Request,
  context: RequestContext,
  tenantId: string,
  fileId: string,
  kind: "progress" | "done" | "failed",
): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  if (kind === "progress") {
    const input = v.safeParse(
      v.object({ progress: v.pipe(v.number(), v.minValue(0), v.maxValue(1)) }),
      body,
    );
    if (!input.success) return problem(400, "BAD_REQUEST", context.requestId);
    const kept = await asWorker(context, tenantId, (tx) =>
      streamProgress(tx, {
        tenantId,
        fileId,
        progress: input.output.progress,
        until: new Date(Date.now() + LEASE_MS),
      }),
    );
    return kept
      ? new Response(null, { status: 204 })
      : problem(409, "media.not_encoding", context.requestId);
  }
  if (kind === "failed") {
    const input = v.safeParse(v.object({ error: v.string() }), body);
    if (!input.success) return problem(400, "BAD_REQUEST", context.requestId);
    await asWorker(context, tenantId, (tx) =>
      streamFailed(tx, { tenantId, fileId, error: input.output.error }),
    );
    return new Response(null, { status: 204 });
  }
  const input = v.safeParse(v.object({ manifest: manifestSchema }), body);
  if (!input.success) return problem(400, "BAD_REQUEST", context.requestId);
  const { manifest } = input.output;
  const folder = streamFolder(tenantId, fileId);
  const done = await asWorker(context, tenantId, (tx) =>
    streamReady(tx, {
      tenantId,
      fileId,
      width: manifest.width,
      height: manifest.height,
      durationMs: Math.round(manifest.durationSeconds * 1000),
      derivatives: {
        hls: {
          key: folder,
          media_type: "application/vnd.apple.mpegurl",
          width: manifest.width,
          height: manifest.height,
          size: 0,
        },
        poster: {
          key: `${folder}/${manifest.poster}`,
          media_type: "image/jpeg",
          size: 0,
        },
        thumbnails: {
          key: `${folder}/${manifest.thumbnails}`,
          media_type: "text/vtt",
          size: 0,
        },
      },
    }),
  );
  return done
    ? new Response(null, { status: 204 })
    : problem(409, "media.not_encoding", context.requestId);
}

/**
 * Where a reader's player finds a video's streams: sealed links to its
 * playlist, poster and thumbnail track once they are ready, and otherwise
 * how far along they are, so the player plays the upload as it is.
 */
async function stream(
  context: SchoolContext,
  fileId: string,
): Promise<Response> {
  const found = await openUnit(context, "read", async (unit) => {
    const file = await fileById(unit.tx, unit.tenantId, fileId);
    if (!file || file.state !== "ready") return null;
    if (!(await canReadFile({ ...context, ...unit }, file))) return null;
    return {
      tenantId: unit.tenantId,
      stream: await streamOf(unit.tx, unit.tenantId, fileId),
    };
  });
  if (!found?.stream) return problem(404, "NOT_FOUND", context.requestId);
  const { stream: streams, tenantId } = found;
  const origin = context.mediaOrigin;
  if (
    streams.state !== "ready" ||
    !origin ||
    streams.prefix !== streamFolder(tenantId, fileId)
  )
    return Response.json({ state: streams.state, master: null });
  const token = sealStream(context.streamLinkKey, {
    prefix: streams.prefix,
    expires: Math.floor(Date.now() / 1000) + STREAM_LINK_SECONDS,
  });
  const base = `${origin}/v/${token}`;
  return Response.json({
    state: "ready",
    master: `${base}/master.m3u8`,
    poster: `${base}/poster.jpg`,
    thumbnails: `${base}/thumbs/thumbs.vtt`,
    width: streams.width,
    height: streams.height,
    durationMs: streams.durationMs,
  });
}

/** The media service's calls, and a player's request for a video's streams. */
export async function handleMediaRequest(
  request: Request,
  url: URL,
  context: RequestContext,
): Promise<Response | null> {
  const asked = STREAM_PATH.exec(url.pathname);
  if (asked?.[1]) {
    if (request.method !== "GET")
      return problem(405, "METHOD_NOT_ALLOWED", context.requestId);
    const school = await schoolOf(context);
    if (!school) return problem(401, "UNAUTHORIZED", context.requestId);
    try {
      return await stream({ ...context, school }, asked[1]);
    } catch (error) {
      if (error instanceof ORPCError)
        return problem(error.status, error.code, context.requestId);
      throw error;
    }
  }
  if (!url.pathname.startsWith("/v1/media/")) return null;
  if (request.method !== "POST")
    return problem(405, "METHOD_NOT_ALLOWED", context.requestId);
  if (!fromWorker(request, context))
    return problem(401, "UNAUTHORIZED", context.requestId);
  if (url.pathname === "/v1/media/claim") return claim(request, context);
  const job = JOB_PATH.exec(url.pathname);
  if (!job?.[1] || !job[2] || !job[3] || !job[4])
    return problem(404, "NOT_FOUND", context.requestId);
  const kind = job[4] as "progress" | "done" | "failed";
  return job[1] === "captions"
    ? reportCaptions(request, context, job[2], job[3], kind)
    : report(request, context, job[2], job[3], kind);
}
