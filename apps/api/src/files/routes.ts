import {
  completeFile,
  fileWithLinks,
  pendingFile,
  rejectFile,
} from "@faridalms/database/repositories/files";
import { contentDisposition } from "@faridalms/domain/file";
import { ORPCError } from "@orpc/server";

import type { ApiContext } from "../context";

import { authenticate } from "../session";
import { canReadFile } from "./authorize";
import { StoreError } from "./store";

const PATH = /^\/v1\/files\/([0-9a-f-]{36})\/content$/;

function problem(status: number, code: string, requestId: string) {
  return Response.json({ code, requestId }, { status });
}

/**
 * File bytes travel outside the RPC serialiser: a stream in, a stream out,
 * with the same session resolution every procedure uses.
 */
export async function handleFileRequest(
  request: Request,
  url: URL,
  context: ApiContext,
): Promise<Response | null> {
  const match = PATH.exec(url.pathname);
  if (!match?.[1]) return null;
  const fileId = match[1];
  let session;
  try {
    session = await authenticate(context);
  } catch (error) {
    if (error instanceof ORPCError)
      return problem(error.status, error.code, context.requestId);
    throw error;
  }
  const school = { ...context, ...session };
  try {
    if (request.method === "PUT") {
      const file = await pendingFile(session.db, fileId, session.user.id);
      if (!file) return problem(404, "NOT_FOUND", context.requestId);
      const declared = Number(request.headers.get("content-length"));
      if (
        Number.isFinite(declared) &&
        declared > 0 &&
        declared !== file.sizeBytes
      )
        return problem(400, "file.size_mismatch", context.requestId);
      if (!request.body) return problem(400, "file.empty", context.requestId);
      let stored;
      try {
        stored = await context.files.write(
          file.storageKey,
          request.body,
          Math.min(file.sizeBytes, context.maxUploadBytes),
        );
      } catch (error) {
        if (error instanceof StoreError) {
          await rejectFile(session.db, fileId, session.user.id);
          return problem(413, "file.too_large", context.requestId);
        }
        throw error;
      }
      if (stored.sizeBytes !== file.sizeBytes) {
        await context.files.remove(file.storageKey);
        await rejectFile(session.db, fileId, session.user.id);
        return problem(400, "file.size_mismatch", context.requestId);
      }
      const completed = await completeFile(
        session.db,
        fileId,
        session.user.id,
        stored,
      );
      if (!completed)
        return problem(409, "file.not_pending", context.requestId);
      return Response.json({
        id: completed.id,
        name: completed.name,
        mediaType: completed.mediaType,
        sizeBytes: completed.sizeBytes,
        sha256: completed.sha256,
      });
    }
    if (request.method === "GET" || request.method === "HEAD") {
      const file = await fileWithLinks(session.db, fileId);
      if (!file || file.state !== "ready")
        return problem(404, "NOT_FOUND", context.requestId);
      if (!(await canReadFile(school, file)))
        return problem(404, "NOT_FOUND", context.requestId);
      const body = await context.files.open(file.storageKey);
      if (!body) return problem(404, "NOT_FOUND", context.requestId);
      return new Response(request.method === "HEAD" ? null : body, {
        headers: {
          "content-type": file.mediaType,
          "content-length": String(file.sizeBytes),
          "content-disposition": contentDisposition(file.name),
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
        },
      });
    }
    return problem(405, "METHOD_NOT_ALLOWED", context.requestId);
  } finally {
    session.release();
  }
}
