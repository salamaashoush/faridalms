import type { PreviewKind } from "@faridalms/domain/previews";

import {
  claimPreview,
  previewFailed,
  previewFolder,
  previewProgress,
  previewReady,
  previewReleased,
} from "@faridalms/database/stores/previews";
import * as v from "valibot";

import type { RequestContext } from "../core/context";
import type { JobReport } from "./streams";

import { publishLateSizes } from "../core/site";
import { asWorker, LEASE_MS, problem, schoolsInTurn, served } from "./streams";

/** The kinds of previews a worker can make, from what it says it has. */
export function previewKinds(can: {
  pdf: boolean;
  office: boolean;
}): PreviewKind[] {
  return [
    "picture",
    "audio",
    ...(can.pdf ? (["pdf"] as const) : []),
    ...(can.office ? (["office"] as const) : []),
  ];
}

/**
 * The oldest previews waiting of a kind the worker can make, in the first
 * school of the cell that has some, schools taking turns.
 */
export async function claimPreviews(
  context: RequestContext,
  kinds: readonly PreviewKind[],
  tenants?: string[],
): Promise<Response | null> {
  const [tenantId, ...rest] =
    tenants ?? (await schoolsInTurn(context, "previews"));
  if (!tenantId) return null;
  const now = new Date();
  const job = await asWorker(context, tenantId, (tx) =>
    claimPreview(tx, {
      tenantId,
      now,
      until: new Date(now.getTime() + LEASE_MS),
      kinds,
    }),
  );
  if (job) served(context, "previews", tenantId);
  return job
    ? Response.json({
        id: `${tenantId}.${job.id}`,
        kind: "previews",
        sourceKey: job.storageKey,
        outputPrefix: previewFolder(tenantId, job.id),
        mediaType: job.mediaType,
        rewrite: job.rewrite,
      })
    : claimPreviews(context, kinds, rest);
}

const dimension = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(100_000),
);
const bytes = v.pipe(v.number(), v.integer(), v.minValue(0));

const madeSchema = v.object({
  width: v.optional(dimension),
  height: v.optional(dimension),
  durationMs: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(2 ** 31 - 1)),
  ),
  placeholder: v.optional(
    v.pipe(v.string(), v.regex(/^[A-Za-z0-9+/]{4,80}={0,2}$/)),
  ),
  sizes: v.optional(
    v.pipe(
      v.array(
        v.object({
          name: v.pipe(
            v.string(),
            v.regex(/^(?:w|page1-w)\d{1,5}\.(?:webp|avif)$/),
          ),
          width: dimension,
          height: dimension,
          mediaType: v.picklist(["image/webp", "image/avif"]),
          bytes: v.pipe(bytes, v.minValue(1)),
        }),
      ),
      v.maxLength(20),
    ),
    [],
  ),
  waveform: v.optional(
    v.pipe(
      v.array(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(100))),
      v.maxLength(400),
    ),
  ),
  pages: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  document: v.optional(
    v.object({
      name: v.literal("document.pdf"),
      bytes: v.pipe(bytes, v.minValue(1)),
    }),
  ),
  source: v.optional(
    v.nullable(
      v.object({
        sizeBytes: v.pipe(bytes, v.minValue(1)),
        sha256: v.pipe(v.string(), v.regex(/^[0-9a-f]{64}$/)),
      }),
    ),
  ),
  bytes: v.optional(bytes, 0),
});

/** How far previews have got, what was made, or why they failed. */
export async function reportPreviews(
  request: Request,
  context: RequestContext,
  tenantId: string,
  id: string,
  kind: JobReport,
): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  const settled = (kept: boolean) =>
    kept
      ? new Response(null, { status: 204 })
      : problem(409, "media.not_previewing", context.requestId);
  if (kind === "release")
    return settled(
      await asWorker(context, tenantId, (tx) =>
        previewReleased(tx, { tenantId, id }),
      ),
    );
  if (kind === "progress") {
    const input = v.safeParse(
      v.object({ progress: v.pipe(v.number(), v.minValue(0), v.maxValue(1)) }),
      body,
    );
    if (!input.success) return problem(400, "BAD_REQUEST", context.requestId);
    return settled(
      await asWorker(context, tenantId, (tx) =>
        previewProgress(tx, {
          tenantId,
          id,
          progress: input.output.progress,
          until: new Date(Date.now() + LEASE_MS),
        }),
      ),
    );
  }
  if (kind === "failed") {
    const input = v.safeParse(v.object({ error: v.string() }), body);
    if (!input.success) return problem(400, "BAD_REQUEST", context.requestId);
    return settled(
      await asWorker(context, tenantId, (tx) =>
        previewFailed(tx, { tenantId, id, error: input.output.error }),
      ),
    );
  }
  const input = v.safeParse(madeSchema, body);
  if (!input.success) return problem(400, "BAD_REQUEST", context.requestId);
  const { document, source, ...made } = input.output;
  return settled(
    await asWorker(context, tenantId, async (tx) => {
      const storageKey = await previewReady(tx, {
        tenantId,
        id,
        made: {
          ...made,
          documentBytes: document?.bytes,
          source: source ?? undefined,
        },
      });
      if (storageKey === null) return false;
      await publishLateSizes({ ...context, tx, tenantId }, storageKey);
      return true;
    }),
  );
}
