import type { RequestContext } from "../core/context";

import { PUBLIC_KEY } from "./store";

const PATH = /^\/public-media\/(p\/[a-z0-9]{26}\/[A-Za-z0-9._-]{1,120})$/;

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  mp4: "video/mp4",
  mp3: "audio/mpeg",
  vtt: "text/vtt",
  txt: "text/plain",
};

/**
 * The public-media bucket: copies of published files under unguessable keys,
 * served to anyone and cached for long, with no database read. A withdrawn
 * publication has already deleted its object, so it answers not found.
 */
export async function handlePublicFileRequest(
  request: Request,
  url: URL,
  context: RequestContext,
): Promise<Response | null> {
  const key = PATH.exec(url.pathname)?.[1];
  if (!key) return null;
  if (request.method !== "GET" && request.method !== "HEAD")
    return Response.json(
      { code: "METHOD_NOT_ALLOWED", requestId: context.requestId },
      { status: 405 },
    );
  const body = PUBLIC_KEY.test(key)
    ? await context.publicMedia.open(key)
    : null;
  if (!body)
    return Response.json(
      { code: "NOT_FOUND", requestId: context.requestId },
      { status: 404 },
    );
  const extension = key.split(".").pop()?.toLowerCase() ?? "";
  return new Response(request.method === "HEAD" ? null : body, {
    headers: {
      "content-type": TYPES[extension] ?? "application/octet-stream",
      "content-disposition": "inline",
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
