import { byteRange, contentDisposition } from "@faridalms/domain/file";
import { createCipheriv, createDecipheriv, createHmac } from "node:crypto";

import type { FileStore } from "./store";

import { playResponse } from "./play";

/** What a signed link lets its holder read, and until when. */
export interface LinkGrant {
  storageKey: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
  disposition: "inline" | "attachment";
  /** Seconds since the epoch. */
  expires: number;
}

export const LINK_SECONDS = 5 * 60;
/** A player asks for each part of a recording as it plays and seeks, so its link must outlast the lesson. */
export const MEDIA_LINK_SECONDS = 60 * 60;

export const linkSeconds = (mediaType: string) =>
  /^(audio|video)\//i.test(mediaType) ? MEDIA_LINK_SECONDS : LINK_SECONDS;

/** The key links are sealed with, derived so no other use of the cell secret can open one. */
export function linkKey(cellSecret: Uint8Array): Buffer {
  return createHmac("sha256", cellSecret).update("files-link-v1").digest();
}

const encode = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

/**
 * Seals a grant: encrypted as well as signed, because a link travels in
 * logs and history and a file's name can say more than its holder should.
 */
export function sealLink(key: Buffer, grant: LinkGrant): string {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([
    cipher.update(
      JSON.stringify([
        grant.storageKey,
        grant.name,
        grant.mediaType,
        grant.sizeBytes,
        grant.disposition,
        grant.expires,
      ]),
    ),
    cipher.final(),
  ]);
  return encode(Buffer.concat([iv, body, cipher.getAuthTag()]));
}

export function openLink(
  key: Buffer,
  token: string,
  now: number,
): LinkGrant | null {
  const sealed = Buffer.from(token, "base64url");
  if (sealed.length < 12 + 16 + 2) return null;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      sealed.subarray(0, 12),
    );
    decipher.setAuthTag(sealed.subarray(-16));
    const plain = Buffer.concat([
      decipher.update(sealed.subarray(12, -16)),
      decipher.final(),
    ]).toString();
    const [storageKey, name, mediaType, sizeBytes, disposition, expires] =
      JSON.parse(plain) as [
        string,
        string,
        string,
        number,
        LinkGrant["disposition"],
        number,
      ];
    if (expires < now) return null;
    return { storageKey, name, mediaType, sizeBytes, disposition, expires };
  } catch {
    return null;
  }
}

const LINK_PATH = /^\/b\/([A-Za-z0-9_-]{40,4096})$/;

const shared = {
  "access-control-allow-origin": "*",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cross-origin-resource-policy": "cross-origin",
};

/**
 * The files host: sealed links and the page students' web pages play in,
 * no cookies read or set. It answers on its own port and hostname, so what
 * it serves can never run as the application, and a link is checked by its
 * seal alone.
 */
export function createFilesHost(dependencies: {
  files: FileStore;
  key: Buffer;
  now?: () => number;
}) {
  const now = dependencies.now ?? (() => Math.floor(Date.now() / 1000));
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (request.method === "OPTIONS")
      return new Response(null, {
        status: 204,
        headers: {
          ...shared,
          "access-control-allow-methods": "GET, HEAD",
          "access-control-allow-headers": "range",
          "access-control-max-age": "600",
        },
      });
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response(null, { status: 405, headers: shared });
    const play = playResponse(url.pathname);
    if (play) return play;
    const token = LINK_PATH.exec(url.pathname)?.[1];
    const grant = token ? openLink(dependencies.key, token, now()) : null;
    if (!grant) return new Response(null, { status: 404, headers: shared });
    const range = byteRange(request.headers.get("range"), grant.sizeBytes);
    if (range === "unsatisfiable")
      return new Response(null, {
        status: 416,
        headers: { ...shared, "content-range": `bytes */${grant.sizeBytes}` },
      });
    const body =
      request.method === "HEAD"
        ? null
        : await dependencies.files.open(grant.storageKey, range ?? undefined);
    if (request.method === "GET" && !body)
      return new Response(null, { status: 404, headers: shared });
    const pdf = grant.mediaType.toLowerCase().startsWith("application/pdf");
    return new Response(body, {
      status: range ? 206 : 200,
      headers: {
        ...shared,
        "content-type": grant.mediaType,
        "content-length": String(
          range ? range.end - range.start + 1 : grant.sizeBytes,
        ),
        ...(range
          ? {
              "content-range": `bytes ${range.start}-${range.end}/${grant.sizeBytes}`,
            }
          : {}),
        "accept-ranges": "bytes",
        "content-disposition": contentDisposition(
          grant.name,
          grant.disposition,
        ),
        "cache-control": `private, max-age=${Math.max(0, grant.expires - now())}`,
        // A PDF is drawn by the browser's own viewer, which in Firefox is a
        // script in the document that a sandbox policy would stop; everything
        // else is shown sandboxed.
        ...(pdf
          ? {}
          : {
              "content-security-policy":
                "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'",
            }),
      },
    });
  };
}
