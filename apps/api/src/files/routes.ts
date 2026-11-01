import type { StoredFile } from "@faridalms/database/stores/files";

import { writeAudit } from "@faridalms/database/audit";
import { TenantUnavailableError } from "@faridalms/database/context";
import { studentOf } from "@faridalms/database/stores/coursework";
import {
  fileById,
  partKey,
  partsFolder,
  quarantineKey,
  readyKey,
  settleFile,
} from "@faridalms/database/stores/files";
import {
  contentBytesNeeded,
  contentMatchesName,
  previewable,
  UPLOAD_PART_BYTES,
  uploadParts,
} from "@faridalms/domain/file";
import { ORPCError } from "@orpc/server";

import type { RequestContext, SchoolContext } from "../core/context";

import { openUnit, schoolOf } from "../core/procedure";
import { canReadFile } from "./authorize";
import { uploadLimit } from "./limit";
import { linkSeconds, sealLink } from "./links";
import { ScanUnavailableError } from "./scan";
import { readPrefix, StoreError } from "./store";

const PATH = /^\/v1\/files\/([0-9a-f-]{36})\/content$/;
const PARTS = /^\/v1\/files\/([0-9a-f-]{36})\/parts(?:\/(\d{1,4}))?$/;

type Rejection =
  | "too_large"
  | "size_mismatch"
  | "content_mismatch"
  | "infected"
  | "scan_unavailable";

function problem(status: number, code: string, requestId: string) {
  return Response.json({ code, requestId }, { status });
}

/**
 * The verdict is written as the worker, the only runtime role that may set
 * a file's state, digest and key.
 */
async function settle(
  context: SchoolContext,
  fileId: string,
  verdict: Parameters<typeof settleFile>[1]["verdict"],
) {
  return context.cell.withWorker(
    {
      tenantId: context.school.tenantId,
      requestId: context.requestId,
      actor: { kind: "system" },
    },
    "write",
    (tx) =>
      settleFile(tx, {
        tenantId: context.school.tenantId,
        id: fileId,
        verdict,
      }),
  );
}

/** The upload this person began and has not finished, if it is theirs. */
function pendingFile(context: SchoolContext, fileId: string) {
  return openUnit(context, "read", async (unit) => {
    const found = await fileById(unit.tx, unit.tenantId, fileId);
    return found &&
      found.state === "initiated" &&
      found.uploadedByUserId === unit.actor.userId
      ? found
      : null;
  });
}

/** A part the assembled upload reached for and did not find. */
class PartMissing extends Error {
  constructor(public readonly part: number) {
    super("part_missing");
  }
}

/** An upload's parts, one after another, as the one stream they were cut from. */
function assembled(
  context: SchoolContext,
  fileId: string,
  parts: number,
): ReadableStream<Uint8Array> {
  let next = 0;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      for (;;) {
        if (!reader) {
          if (next >= parts) {
            controller.close();
            return;
          }
          const part = await context.files.open(
            partKey(context.school.tenantId, fileId, next),
          );
          if (!part) throw new PartMissing(next);
          reader = part.getReader();
          next += 1;
        }
        const { done, value } = await reader.read();
        if (!done) {
          controller.enqueue(value);
          return;
        }
        reader = null;
      }
    },
    async cancel() {
      await reader?.cancel();
    },
  });
}

/**
 * Takes an upload's bytes, whole or assembled from its parts, checks them
 * against what was declared, and settles the file ready or rejected.
 */
async function accept(
  context: SchoolContext,
  file: StoredFile,
  body: ReadableStream<Uint8Array>,
): Promise<Response> {
  const fileId = file.id;
  const tenantId = context.school.tenantId;
  const waiting = quarantineKey(tenantId, fileId);
  const refuse = async (status: number, reason: Rejection) => {
    await context.files.remove(waiting);
    await context.files.removeFolder(partsFolder(tenantId, fileId));
    await settle(context, fileId, { state: "rejected", reason });
    return problem(status, `file.${reason}`, context.requestId);
  };
  let stored;
  try {
    stored = await context.files.write(
      waiting,
      body,
      Math.min(file.sizeBytes, uploadLimit(context, file)),
    );
  } catch (error) {
    if (error instanceof StoreError) return refuse(413, "too_large");
    throw error;
  }
  if (stored.sizeBytes !== file.sizeBytes) return refuse(400, "size_mismatch");
  const head = await readPrefix(
    context.files,
    waiting,
    contentBytesNeeded(file.name, stored.sizeBytes),
  );
  if (!contentMatchesName(file.name, head))
    return refuse(422, "content_mismatch");
  if (context.scanner) {
    const scanned = await context.files.open(waiting);
    if (!scanned) return refuse(400, "size_mismatch");
    try {
      const verdict = await context.scanner.scan(scanned);
      if (!verdict.clean) {
        console.warn(
          JSON.stringify({
            requestId: context.requestId,
            file: fileId,
            signature: verdict.signature,
          }),
        );
        return refuse(422, "infected");
      }
    } catch (error) {
      if (!(error instanceof ScanUnavailableError)) throw error;
      console.error(
        JSON.stringify({
          requestId: context.requestId,
          file: fileId,
          scanner: error.message,
        }),
      );
      return refuse(503, "scan_unavailable");
    }
  }
  await context.files.move(waiting, readyKey(tenantId, fileId));
  await context.files.removeFolder(partsFolder(tenantId, fileId));
  const settled = await settle(context, fileId, {
    state: "ready",
    sha256: stored.sha256,
    scanEngine: context.scanner ? "clamd" : null,
    stream: context.mediaOrigin !== null,
  });
  if (!settled) return problem(409, "file.not_pending", context.requestId);
  return Response.json({
    id: file.id,
    name: file.name,
    mediaType: file.mediaType,
    sizeBytes: file.sizeBytes,
  });
}

async function receive(
  request: Request,
  context: SchoolContext,
  fileId: string,
): Promise<Response> {
  const file = await pendingFile(context, fileId);
  if (!file) return problem(404, "NOT_FOUND", context.requestId);
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > 0 && declared !== file.sizeBytes)
    return problem(400, "file.size_mismatch", context.requestId);
  if (!request.body) return problem(400, "file.empty", context.requestId);
  return accept(context, file, request.body);
}

/**
 * One part of a large upload, kept until the rest arrive. A part sent again
 * replaces itself, so the sender may repeat any part it is unsure of.
 */
async function receivePart(
  request: Request,
  context: SchoolContext,
  fileId: string,
  part: number,
): Promise<Response> {
  const file = await pendingFile(context, fileId);
  if (!file) return problem(404, "NOT_FOUND", context.requestId);
  const partBytes = context.uploadPartBytes ?? UPLOAD_PART_BYTES;
  if (part >= uploadParts(file.sizeBytes, partBytes))
    return problem(400, "file.size_mismatch", context.requestId);
  if (!request.body) return problem(400, "file.empty", context.requestId);
  try {
    await context.files.write(
      partKey(context.school.tenantId, fileId, part),
      request.body,
      partBytes,
    );
  } catch (error) {
    if (error instanceof StoreError)
      return problem(413, "file.too_large", context.requestId);
    throw error;
  }
  return new Response(null, { status: 204 });
}

/**
 * The last step of an upload sent in parts: they are joined in order and
 * the whole is checked as an upload sent in one piece is. A part that never
 * arrived is named, for the sender to send it and ask again.
 */
async function finishParts(
  context: SchoolContext,
  fileId: string,
): Promise<Response> {
  const file = await pendingFile(context, fileId);
  if (!file) return problem(404, "NOT_FOUND", context.requestId);
  try {
    return await accept(
      context,
      file,
      assembled(
        context,
        fileId,
        uploadParts(
          file.sizeBytes,
          context.uploadPartBytes ?? UPLOAD_PART_BYTES,
        ),
      ),
    );
  } catch (error) {
    if (!(error instanceof PartMissing)) throw error;
    return Response.json(
      {
        code: "file.part_missing",
        part: error.part,
        requestId: context.requestId,
      },
      { status: 409 },
    );
  }
}

/**
 * Files whose every opening is recorded: a student's work and attempts,
 * messages, and health and custody papers. Anything else is recorded when
 * it is downloaded rather than viewed in a page.
 */
const WATCHED_HOSTS = new Set(["submission", "submission_attempt", "message"]);
const WATCHED_PURPOSES = new Set([
  "health_report",
  "evidence",
  "legal_document",
  "admission_document",
]);

function watched(file: StoredFile): boolean {
  return (
    WATCHED_PURPOSES.has(file.purpose) ||
    (file.hostType !== null && WATCHED_HOSTS.has(file.hostType))
  );
}

async function send(
  request: Request,
  context: SchoolContext,
  fileId: string,
): Promise<Response> {
  const download = new URL(request.url).searchParams.get("download") !== null;
  const opened = await openUnit(context, "read", async (unit) => {
    const found = await fileById(unit.tx, unit.tenantId, fileId);
    if (!found || found.state !== "ready") return null;
    if (!(await canReadFile({ ...context, ...unit }, found))) return null;
    return {
      file: found,
      logged:
        found.uploadedByUserId !== unit.actor.userId &&
        (download || watched(found)),
    };
  });
  if (!opened) return problem(404, "NOT_FOUND", context.requestId);
  const { file } = opened;
  if (opened.logged && request.method !== "HEAD")
    await openUnit(context, "write", async (unit) =>
      writeAudit(unit.tx, unit.tenantId, {
        action: "file.opened",
        objectType: "file",
        objectId: file.id,
        orgId: context.school.schoolId,
        studentUserId: await studentOf(unit.tx, unit.tenantId, file),
        details: {
          hostType: file.hostType,
          hostId: file.hostId,
          purpose: file.purpose,
          download,
        },
      }),
    );
  // A viewer shows what a browser can show by itself; asking to download,
  // or any other type, saves the file under its name.
  const token = sealLink(context.linkKey, {
    storageKey: file.storageKey,
    name: file.name,
    mediaType: file.mediaType,
    sizeBytes: file.sizeBytes,
    disposition:
      previewable(file.mediaType) && !download ? "inline" : "attachment",
    expires: Math.floor(Date.now() / 1000) + linkSeconds(file.mediaType),
  });
  return new Response(null, {
    status: 302,
    headers: {
      location: `${context.filesOrigin}/b/${token}`,
      "cache-control": "private, no-store",
    },
  });
}

/**
 * File bytes travel outside the RPC serialiser: a stream in, a stream out,
 * with the same session resolution every procedure uses. No transaction is
 * held while bytes move.
 */
export async function handleFileRequest(
  request: Request,
  url: URL,
  context: RequestContext,
): Promise<Response | null> {
  const parts = PARTS.exec(url.pathname);
  const match = parts ?? PATH.exec(url.pathname);
  if (!match?.[1]) return null;
  const school = await schoolOf(context);
  if (!school) return problem(401, "UNAUTHORIZED", context.requestId);
  const scoped: SchoolContext = { ...context, school };
  try {
    if (parts) {
      if (request.method === "PUT" && parts[2] !== undefined)
        return await receivePart(request, scoped, match[1], Number(parts[2]));
      if (request.method === "POST" && parts[2] === undefined)
        return await finishParts(scoped, match[1]);
      return problem(405, "METHOD_NOT_ALLOWED", context.requestId);
    }
    if (request.method === "PUT")
      return await receive(request, scoped, match[1]);
    if (request.method === "GET" || request.method === "HEAD")
      return await send(request, scoped, match[1]);
    return problem(405, "METHOD_NOT_ALLOWED", context.requestId);
  } catch (error) {
    if (error instanceof ORPCError)
      return problem(error.status, error.code, context.requestId);
    if (error instanceof TenantUnavailableError)
      return error.reason === "unknown"
        ? problem(401, "UNAUTHORIZED", context.requestId)
        : problem(503, "tenant.read_only", context.requestId);
    throw error;
  }
}
