import {
  captionDraftFailed,
  captionDraftProgress,
  captionDraftReady,
  captionDraftReleased,
  claimCaptionDraft,
} from "@faridalms/database/stores/files";
import * as v from "valibot";

import type { RequestContext } from "../core/context";
import type { JobReport } from "./streams";

import { asWorker, LEASE_MS, problem, schoolsInTurn, served } from "./streams";

/** The longest draft kept: more than a ten-minute recording's captions take. */
const MAX_VTT = 524_288;

/**
 * The oldest recording waiting for its captions to be drafted, in the first
 * school of the cell that has one; schools are asked one after another,
 * taking turns, so only one draft is leased.
 */
export async function claimCaptions(
  context: RequestContext,
  tenants?: string[],
): Promise<Response | null> {
  const [tenantId, ...rest] =
    tenants ?? (await schoolsInTurn(context, "captions"));
  if (!tenantId) return null;
  const now = new Date();
  const job = await asWorker(context, tenantId, (tx) =>
    claimCaptionDraft(tx, {
      tenantId,
      now,
      until: new Date(now.getTime() + LEASE_MS),
    }),
  );
  if (job) served(context, "captions", tenantId);
  return job
    ? Response.json({
        id: `${tenantId}.${job.fileId}`,
        kind: "captions",
        sourceKey: job.storageKey,
        outputPrefix: "",
        language: job.language,
      })
    : claimCaptions(context, rest);
}

/** How far a draft has got, its captions once made, or why it failed. */
export async function reportCaptions(
  request: Request,
  context: RequestContext,
  tenantId: string,
  fileId: string,
  kind: JobReport,
): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  const settled = (kept: boolean) =>
    kept
      ? new Response(null, { status: 204 })
      : problem(409, "media.not_drafting", context.requestId);
  if (kind === "release")
    return settled(
      await asWorker(context, tenantId, (tx) =>
        captionDraftReleased(tx, { tenantId, fileId }),
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
        captionDraftProgress(tx, {
          tenantId,
          fileId,
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
        captionDraftFailed(tx, { tenantId, fileId, error: input.output.error }),
      ),
    );
  }
  const input = v.safeParse(
    v.object({
      vtt: v.pipe(
        v.string(),
        v.maxLength(MAX_VTT),
        v.check((text) => text.startsWith("WEBVTT"), "media.not_vtt"),
      ),
    }),
    body,
  );
  if (!input.success) return problem(400, "BAD_REQUEST", context.requestId);
  return settled(
    await asWorker(context, tenantId, (tx) =>
      captionDraftReady(tx, { tenantId, fileId, vtt: input.output.vtt }),
    ),
  );
}
