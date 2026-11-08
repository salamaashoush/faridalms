import { thumbHashToDataURL } from "thumbhash";
import * as v from "valibot";

import { fileGate } from "./file";

/**
 * A picture's placeholder as a tiny image to draw while the picture loads,
 * or none when the hash cannot be read.
 */
export function placeholderUrl(hash: string | undefined | null): string | null {
  if (!hash) return null;
  try {
    return thumbHashToDataURL(
      Uint8Array.from(atob(hash), (character) => character.charCodeAt(0)),
    );
  } catch {
    return null;
  }
}

/** What the media service makes previews of. */
export type PreviewKind = "picture" | "audio" | "pdf" | "office";

/** One picture made from a file: a size of it, or of its first page. */
export interface PreviewSize {
  name: string;
  width: number;
  height: number;
  mediaType: "image/webp" | "image/avif";
  bytes: number;
}

/**
 * The widths a picture is made in once, on upload, each only where the
 * picture is wider. A reader asks for the one its layout needs, and the
 * original stands for every width beyond the largest made.
 */
export const PICTURE_WIDTHS = [320, 640, 1024, 1600, 2400] as const;
/** The widths a document's first page is drawn in. */
export const PAGE_WIDTHS = [320, 640, 1024] as const;

const PICTURES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const OFFICE = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.presentation",
  "application/vnd.oasis.opendocument.spreadsheet",
]);
/** Purposes whose files are only ever handed on whole, never shown. */
const UNSHOWN = new Set(["export", "import_source"]);

/**
 * What previews a file gets, or none. Files sealed under a school's key
 * get none, since anything made from them would sit in the store unsealed;
 * a video gets streams instead.
 */
export function previewKindOf(
  purpose: string,
  mediaType: string,
): PreviewKind | null {
  if (fileGate(purpose) || UNSHOWN.has(purpose)) return null;
  const type = mediaType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (PICTURES.has(type)) return "picture";
  if (type.startsWith("audio/")) return "audio";
  if (type === "application/pdf") return "pdf";
  if (OFFICE.has(type)) return "office";
  return null;
}

/** The media types that get previews, as SQL `like` patterns, for the backfill. */
export const PREVIEWED_TYPE_PATTERNS = [
  ...PICTURES,
  "audio/%",
  "application/pdf",
  ...OFFICE,
];

/** Purposes whose files never get previews, the sealed ones among them. */
export const UNPREVIEWED_PURPOSES = [
  ...UNSHOWN,
  "health_report",
  "evidence",
  "legal_document",
];

/** Whether a picture's bytes may carry location and camera data to remove. */
export const isCleanablePicture = (mediaType: string) =>
  PICTURES.has(mediaType.toLowerCase().split(";")[0]?.trim() ?? "");

/**
 * The formats a browser takes, best first, read from its `Accept` header:
 * a browser asking for a picture names the modern formats it can draw.
 */
export function acceptedFormats(
  accept: string | null,
): PreviewSize["mediaType"][] {
  const named = (accept ?? "").toLowerCase();
  return (["image/avif", "image/webp"] as const).filter((type) =>
    named.includes(type),
  );
}

/**
 * The made picture to send for a width: the smallest at least that wide
 * in the best format the browser takes. None, and the original is sent,
 * when nothing made is wide enough or the browser takes neither format.
 */
export function chooseSize(
  sizes: readonly PreviewSize[],
  width: number,
  formats: readonly PreviewSize["mediaType"][],
  prefix = "w",
): PreviewSize | null {
  for (const format of formats) {
    const fitting = sizes
      .filter(
        (size) =>
          size.mediaType === format &&
          size.name.startsWith(prefix) &&
          size.width >= width,
      )
      .toSorted((a, b) => a.width - b.width);
    if (fitting[0]) return fitting[0];
  }
  return null;
}

/**
 * A picture as the website publishes it: its size and placeholder, where
 * its subject sits, and the sizes published beside it, each named in the
 * same public folder as the picture.
 */
export interface PublishedPicture {
  width: number;
  height: number;
  placeholder?: string;
  focus?: { x: number; y: number };
  sizes: { name: string; width: number; mediaType: PreviewSize["mediaType"] }[];
}

const publishedPictureSchema = v.object({
  width: v.pipe(v.number(), v.integer(), v.minValue(1)),
  height: v.pipe(v.number(), v.integer(), v.minValue(1)),
  placeholder: v.optional(v.string()),
  focus: v.optional(
    v.object({
      x: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
      y: v.pipe(v.number(), v.minValue(0), v.maxValue(100)),
    }),
  ),
  sizes: v.array(
    v.object({
      name: v.pipe(v.string(), v.regex(/^w\d{1,5}\.(?:webp|avif)$/)),
      width: v.pipe(v.number(), v.integer(), v.minValue(1)),
      mediaType: v.picklist(["image/webp", "image/avif"]),
    }),
  ),
});

/**
 * The pictures a published copy keeps, read as they were written; a copy
 * published before pictures were kept, or one that will not read, has none.
 */
export function publishedPictures(
  kept: unknown,
): Record<string, PublishedPicture> {
  const read = v.safeParse(
    v.record(v.pipe(v.string(), v.uuid()), publishedPictureSchema),
    kept ?? {},
  );
  return read.success ? read.output : {};
}

/** One picture a published copy keeps, or none when it will not read. */
export function publishedPicture(kept: unknown): PublishedPicture | null {
  const read = v.safeParse(publishedPictureSchema, kept);
  return read.success ? read.output : null;
}

/** A published picture's sizes as `<source>`s, best format first, from its public address. */
export function publishedSources(
  url: string,
  picture: PublishedPicture | undefined,
): { type: PreviewSize["mediaType"]; srcSet: string }[] {
  if (!picture || picture.sizes.length === 0) return [];
  const folder = url.slice(0, url.lastIndexOf("/") + 1);
  return (["image/avif", "image/webp"] as const).flatMap((type) => {
    const sizes = picture.sizes
      .filter((size) => size.mediaType === type)
      .toSorted((a, b) => a.width - b.width);
    if (sizes.length === 0) return [];
    // The original stands for every width beyond the largest size made.
    const srcSet = [
      ...sizes.map((size) => `${folder}${size.name} ${size.width}w`),
      `${url} ${picture.width}w`,
    ].join(", ");
    return [{ type, srcSet }];
  });
}

/** The widths a browser may ask a file's picture in. */
export const pictureWidthSchema = v.pipe(
  v.number(),
  v.integer(),
  v.minValue(1),
  v.maxValue(10_000),
);

/**
 * The `srcset` of a picture whose sizes are reached through one address,
 * the width named in `?w=`; the server sends the nearest size it made.
 */
export function pictureSrcSet(
  url: string,
  widths: readonly number[] = PICTURE_WIDTHS,
): string {
  const join = url.includes("?") ? "&" : "?";
  return widths.map((width) => `${url}${join}w=${width} ${width}w`).join(", ");
}

/** Where a picture's subject sits, from a library item's metadata, if it says. */
export function focusOf(
  metadata: unknown,
): { x: number; y: number } | undefined {
  if (typeof metadata !== "object" || metadata === null) return undefined;
  const focus = (metadata as { focus?: unknown }).focus;
  if (typeof focus !== "object" || focus === null) return undefined;
  const { x, y } = focus as { x?: unknown; y?: unknown };
  return typeof x === "number" && typeof y === "number" ? { x, y } : undefined;
}
