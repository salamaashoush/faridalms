import { unzipSync } from "fflate";

import type { LinkGrant } from "./links";
import type { FileKeys } from "./sealed";
import type { FileStore } from "./store";

import { openSealedObject } from "./sealed";

/** The media type a package grant names; a file's own link never names it inline. */
export const PACKAGE_TYPE = "application/zip";

/** How long a launched package's pages may be read, as long as its session. */
export const PACKAGE_SECONDS = 4 * 60 * 60;

/** The packages opened lately, kept unpacked a while so each page is not unpacked again. */
const MOST_KEPT = 4;
const unpacked = new Map<string, Map<string, Uint8Array>>();

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json",
  xml: "application/xml",
  txt: "text/plain; charset=utf-8",
  vtt: "text/vtt",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  webm: "video/webm",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  pdf: "application/pdf",
};

/**
 * A package's pages run here, on the files host, which reads and sets no
 * cookies, so a publisher's scripts reach nothing of the school's. They may
 * call out over https, which is how an AU reports to the record store the
 * school named for it.
 */
const POLICY = [
  "default-src 'self' data: blob:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https:",
  "frame-ancestors 'self'",
  "form-action 'self' https:",
].join("; ");

async function bytesOf(
  files: FileStore,
  keys: FileKeys | undefined,
  grant: LinkGrant,
): Promise<Uint8Array | null> {
  const stream =
    grant.sealed && keys
      ? await openSealedObject(files, keys, {
          ...grant.sealed,
          storageKey: grant.storageKey,
          sizeBytes: grant.sizeBytes,
        })
      : grant.sealed
        ? null
        : await files.open(grant.storageKey);
  return stream
    ? new Uint8Array(await new Response(stream).arrayBuffer())
    : null;
}

async function entriesOf(
  files: FileStore,
  keys: FileKeys | undefined,
  grant: LinkGrant,
) {
  const kept = unpacked.get(grant.storageKey);
  if (kept) return kept;
  const bytes = await bytesOf(files, keys, grant);
  if (!bytes) return null;
  let entries: Map<string, Uint8Array>;
  try {
    entries = new Map(
      Object.entries(
        unzipSync(bytes, { filter: (file) => !file.name.endsWith("/") }),
      ),
    );
  } catch {
    return null;
  }
  unpacked.set(grant.storageKey, entries);
  for (const key of unpacked.keys()) {
    if (unpacked.size <= MOST_KEPT) break;
    unpacked.delete(key);
  }
  return entries;
}

/** A page's path inside its package, refused when it climbs out. */
function pathIn(rest: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rest);
  } catch {
    return null;
  }
  const parts = decoded.split("/");
  if (parts.some((part) => part === ".." || part === ".")) return null;
  return parts.filter(Boolean).join("/") || null;
}

/**
 * A page or file of a launched course package, by the grant its launch
 * made: `/pkg/<grant>/<path>`, so the package's own relative addresses
 * resolve inside it. Only a grant made for a package opens one.
 */
export async function packageResponse(
  url: URL,
  dependencies: {
    files: FileStore;
    keys?: FileKeys;
    open: (token: string) => LinkGrant | null;
    headers: Record<string, string>;
  },
): Promise<Response | null> {
  const match = /^\/pkg\/([A-Za-z0-9_-]{40,4096})\/(.*)$/.exec(url.pathname);
  if (!match) return null;
  const refused = () =>
    new Response(null, { status: 404, headers: dependencies.headers });
  const grant = dependencies.open(match[1] ?? "");
  if (
    !grant ||
    grant.mediaType !== PACKAGE_TYPE ||
    grant.disposition !== "inline"
  )
    return refused();
  const path = pathIn(match[2] ?? "");
  if (!path) return refused();
  const entries = await entriesOf(dependencies.files, dependencies.keys, grant);
  const bytes = entries?.get(path);
  if (!bytes) return refused();
  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
  return new Response(new Uint8Array(bytes), {
    headers: {
      ...dependencies.headers,
      "content-type": TYPES[extension] ?? "application/octet-stream",
      "content-length": String(bytes.byteLength),
      "cache-control": "private, no-store",
      "content-security-policy": POLICY,
    },
  });
}
