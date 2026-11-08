import type { CellTransaction } from "@faridalms/database/context";

import {
  claimStream,
  fileById,
  streamFailed,
  streamOf,
  streamProgress,
  streamReady,
  streamReleased,
} from "@faridalms/database/stores/files";
import { ORPCError } from "@orpc/server";
import { createCipheriv, createHmac, timingSafeEqual } from "node:crypto";
import * as v from "valibot";

import type { RequestContext, SchoolContext } from "../core/context";

import { openUnit, schoolOf } from "../core/procedure";
import { refusalResponse } from "../core/refusal";
import { canReadFile } from "../files/authorize";
import { claimCaptions, reportCaptions } from "./captions";
import { claimPreviews, previewKinds, reportPreviews } from "./previews";

/**
 * A worker holds a video this long between reports. An encode reports every
 * few seconds, so a lease runs out only once its worker is gone, and the
 * video is then taken again.
 */
export const LEASE_MS = 10 * 60 * 1000;
/**
 * A player keeps a stream's link through a long lesson, so a link opens
 * for at least this long.
 */
export const STREAM_LINK_SECONDS = 4 * 60 * 60;

/**
 * When a link sealed now stops opening. Time is cut into windows of
 * `STREAM_LINK_SECONDS`, and every link sealed in one window runs to the
 * end of the next, so a video's link is the same for everyone who asks in
 * that window: a browser that comes back to a lesson finds the segments it
 * already fetched under the address it fetched them by.
 */
export const streamLinkExpiry = (nowSeconds: number) =>
  (Math.floor(nowSeconds / STREAM_LINK_SECONDS) + 2) * STREAM_LINK_SECONDS;

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
 *
 * The same grant always seals to the same link. Its nonce is not random
 * but taken from the grant itself, under a key of its own, so two grants
 * never share one and nothing but "the same video, the same window" shows
 * in two links being equal.
 */
export function sealStream(
  key: Buffer,
  grant: { prefix: string; expires: number },
): string {
  const plain = JSON.stringify([grant.prefix, grant.expires]);
  const iv = createHmac("sha256", derive(key, "media-link-nonce-v1"))
    .update(plain)
    .digest()
    .subarray(0, 12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
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
  /^\/v1\/media\/(jobs|captions|previews)\/([0-9a-f-]{36})\.([0-9a-f-]{36})\/(progress|done|failed|release)$/;

/** How a worker says a job is going, or how it ended. */
export type JobReport = "progress" | "done" | "failed" | "release";
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

type Work = "streams" | "captions" | "previews";

/** The school each kind of work was last handed out from, by cell. */
const lastServed = new Map<string, string>();

/**
 * A cell's schools in the order they are next asked for work: round the
 * ring, starting after the school served last. A school that queues a
 * hundred videos then waits its turn between every two of them, where
 * asking in one fixed order kept every school behind it waiting.
 */
export async function schoolsInTurn(
  context: RequestContext,
  work: Work,
): Promise<string[]> {
  return inTurn(
    await context.directory.tenantsOfCell(context.cellId),
    lastServed.get(`${context.cellId}:${work}`),
  );
}

/** The schools from the one after `last` round to `last` itself. */
export function inTurn(schools: string[], last: string | undefined): string[] {
  const ring = schools.toSorted();
  const next = last === undefined ? 0 : ring.findIndex((id) => id > last);
  return next <= 0 ? ring : [...ring.slice(next), ...ring.slice(0, next)];
}

/** Notes the school just handed work from, so the next one asked follows it. */
export function served(context: RequestContext, work: Work, tenantId: string) {
  lastServed.set(`${context.cellId}:${work}`, tenantId);
}

/**
 * What a worker asks for: videos to encode unless it says otherwise,
 * previews when it says it can make them (and which documents it can
 * draw), and captions when it has a speech model. A worker from before
 * previews never names them, so it is never handed one.
 */
const claimSchema = v.object({
  captions: v.optional(v.boolean(), false),
  streams: v.optional(v.boolean(), true),
  previews: v.optional(
    v.object({
      pdf: v.optional(v.boolean(), false),
      office: v.optional(v.boolean(), false),
    }),
  ),
});

/**
 * A waiting video, leased to the asking worker: the oldest in the first
 * school that has one, schools taking turns; with none, a file's previews,
 * and then a recording whose captions are to be drafted.
 */
async function claim(
  request: Request,
  context: RequestContext,
): Promise<Response> {
  const parsed = v.safeParse(
    claimSchema,
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) return problem(400, "BAD_REQUEST", context.requestId);
  const asked = parsed.output;
  const now = new Date();
  const until = new Date(now.getTime() + LEASE_MS);
  for (const tenantId of asked.streams
    ? await schoolsInTurn(context, "streams")
    : []) {
    const job = await asWorker(context, tenantId, (tx) =>
      claimStream(tx, { tenantId, now, until }),
    );
    if (job) served(context, "streams", tenantId);
    if (job)
      return Response.json({
        id: `${tenantId}.${job.fileId}`,
        kind: "streams",
        sourceKey: job.storageKey,
        outputPrefix: streamFolder(tenantId, job.fileId),
        trim: job.trim
          ? {
              startSeconds: job.trim.startMs / 1000,
              endSeconds: job.trim.endMs / 1000,
            }
          : null,
      });
  }
  const previews = asked.previews
    ? await claimPreviews(context, previewKinds(asked.previews))
    : null;
  if (previews) return previews;
  const captions =
    asked.captions && context.mediaCaptions
      ? await claimCaptions(context)
      : null;
  return captions ?? new Response(null, { status: 204 });
}

async function report(
  request: Request,
  context: RequestContext,
  tenantId: string,
  fileId: string,
  kind: JobReport,
): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  if (kind === "release") {
    const freed = await asWorker(context, tenantId, (tx) =>
      streamReleased(tx, { tenantId, fileId }),
    );
    return freed
      ? new Response(null, { status: 204 })
      : problem(409, "media.not_encoding", context.requestId);
  }
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
  const input = v.safeParse(
    v.object({
      manifest: manifestSchema,
      // What the upload became, when the worker cut the recording.
      source: v.optional(
        v.nullable(
          v.object({
            sizeBytes: v.pipe(v.number(), v.integer(), v.minValue(1)),
            sha256: v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/)),
          }),
        ),
      ),
      // What the folder of streams weighs in the store.
      bytes: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), 0),
    }),
    body,
  );
  if (!input.success) return problem(400, "BAD_REQUEST", context.requestId);
  const { manifest, source, bytes } = input.output;
  const folder = streamFolder(tenantId, fileId);
  const done = await asWorker(context, tenantId, (tx) =>
    streamReady(tx, {
      tenantId,
      fileId,
      width: manifest.width,
      height: manifest.height,
      durationMs: Math.round(manifest.durationSeconds * 1000),
      cut: source ?? undefined,
      // A worker that does not weigh its streams leaves them for the sweep.
      streamBytes: bytes > 0 ? bytes : null,
      derivatives: {
        hls: {
          key: folder,
          media_type: "application/vnd.apple.mpegurl",
          width: manifest.width,
          height: manifest.height,
          size: bytes,
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
    expires: streamLinkExpiry(Math.floor(Date.now() / 1000)),
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
        return refusalResponse(error, context.requestId);
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
  const kind = job[4] as JobReport;
  if (job[1] === "previews")
    return reportPreviews(request, context, job[2], job[3], kind);
  return job[1] === "captions"
    ? reportCaptions(request, context, job[2], job[3], kind)
    : report(request, context, job[2], job[3], kind);
}
