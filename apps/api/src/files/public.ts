import { schema } from "@faridalms/database";
import { publicAssetIds } from "@faridalms/database/repositories/site";
import { contentDisposition } from "@faridalms/domain/file";
import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";

import type { ApiContext } from "../context";

import { withPublicSchool } from "../public-school";

const PATH =
  /^\/v1\/sites\/([a-z0-9]+(?:-[a-z0-9]+)*)\/files\/([0-9a-f-]{36})\/content$/;

function refuse(status: number, code: string, requestId: string) {
  return Response.json({ code, requestId }, { status });
}

/**
 * Site media is the one file class the public may read, and only while the
 * page, post or logo that points at it is published. The school comes from
 * the path, so a file from one tenant never answers under another's slug.
 */
export async function handlePublicFileRequest(
  request: Request,
  url: URL,
  context: ApiContext,
): Promise<Response | null> {
  const match = PATH.exec(url.pathname);
  if (!match?.[1] || !match[2]) return null;
  if (request.method !== "GET" && request.method !== "HEAD")
    return refuse(405, "METHOD_NOT_ALLOWED", context.requestId);
  const [, slug, fileId] = match;
  try {
    return await withPublicSchool(context, slug, async (db) => {
      const [file] = await db
        .select()
        .from(schema.privateFiles)
        .where(
          and(
            eq(schema.privateFiles.id, fileId),
            eq(schema.privateFiles.purpose, "site_media"),
            eq(schema.privateFiles.state, "ready"),
          ),
        );
      if (!file) return refuse(404, "NOT_FOUND", context.requestId);
      const allowed = await publicAssetIds(db, new Date());
      if (!allowed.has(file.id))
        return refuse(404, "NOT_FOUND", context.requestId);
      const body = await context.files.open(file.storageKey);
      if (!body) return refuse(404, "NOT_FOUND", context.requestId);
      return new Response(request.method === "HEAD" ? null : body, {
        headers: {
          "content-type": file.mediaType,
          "content-length": String(file.sizeBytes),
          "content-disposition": contentDisposition(file.name, "inline"),
          "cache-control": "public, max-age=300",
          "x-content-type-options": "nosniff",
        },
      });
    });
  } catch (error) {
    if (error instanceof ORPCError)
      return refuse(error.status, error.code, context.requestId);
    throw error;
  }
}
