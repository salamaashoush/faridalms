import * as v from "valibot";

import type { Capability } from "./capabilities";

import { pictureCreditSchema, pictureFocusSchema } from "./commons";
import { AREA_SORTS, FILE_KINDS } from "./file";
import { pageField } from "./paging";

/**
 * The school's media is a file area of the school itself: its
 * files are kept by the school, not by the document that first showed
 * them, and documents show them where they are.
 */
export const MEDIA_AREA = "media_library";

/**
 * Those who put pictures, video and files in what they write: they choose
 * from media and add to it.
 */
export const MEDIA_USERS = [
  "assignments:author",
  "learning:author",
  "site:manage",
  "calendar:author",
  "calendar:manage",
  "announcements:manage",
  "news:manage",
] as const satisfies readonly Capability[];

/**
 * Those who put pictures in front of others, news and the website, keep
 * it: its folders, what each item says, and its trash.
 */
export const MEDIA_KEEPERS = [
  "news:manage",
  "site:manage",
] as const satisfies readonly Capability[];

export const usesMedia = (capabilities: readonly Capability[]) =>
  MEDIA_USERS.some((capability) => capabilities.includes(capability));
export const keepsMedia = (capabilities: readonly Capability[]) =>
  MEDIA_KEEPERS.some((capability) => capabilities.includes(capability));

export const MAX_FOLDER_NAME = 80;
export const MAX_DESCRIPTION = 300;
export const MAX_TITLE = 200;
export const MAX_CAPTION = 500;
export const MAX_TAG = 40;
/** The most tags one change adds or takes off. */
export const MAX_ITEM_TAGS = 20;
/** The most items one request adds, moves or offers to choose. */
export const MAX_MEDIA_BATCH = 50;

const id = v.pipe(v.string(), v.uuid());
const folderId = v.nullable(id);

export const folderNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(MAX_FOLDER_NAME),
);

/** A month items were added in, as `2026-11`. */
export const MEDIA_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * A page of media: one folder's items, or, while searching or
 * filtering by month, uploader or tag, the matches in every folder, by
 * name, title, description or caption.
 */
export const mediaQuerySchema = v.object({
  folderId: v.optional(folderId, null),
  trashed: v.optional(v.boolean(), false),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
  kinds: v.optional(v.array(v.picklist(FILE_KINDS)), []),
  months: v.optional(
    v.pipe(v.array(v.pipe(v.string(), v.regex(MEDIA_MONTH))), v.maxLength(24)),
    [],
  ),
  uploaders: v.optional(v.pipe(v.array(id), v.maxLength(50)), []),
  tags: v.optional(v.pipe(v.array(id), v.maxLength(50)), []),
  sort: v.optional(v.picklist(AREA_SORTS), "added"),
  order: v.optional(v.picklist(["asc", "desc"]), "desc"),
  page: pageField,
});
export type MediaQuery = v.InferInput<typeof mediaQuerySchema>;

export const createFolderSchema = v.object({
  name: folderNameSchema,
  parentId: v.optional(folderId, null),
});

export const renameFolderSchema = v.object({
  id,
  name: folderNameSchema,
});

export const folderRefSchema = v.object({ id });

const description = v.pipe(v.string(), v.trim(), v.maxLength(MAX_DESCRIPTION));

export const addToMediaSchema = v.pipe(
  v.object({
    ids: v.pipe(v.array(id), v.minLength(1), v.maxLength(MAX_MEDIA_BATCH)),
    folderId: v.optional(folderId, null),
    /**
     * What a picture found in an open collection says of itself, and the
     * credit its licence asks be kept with it; for one picture at a time.
     */
    found: v.optional(
      v.nullable(v.object({ description, credit: pictureCreditSchema })),
      null,
    ),
  }),
  v.check((input) => !input.found || input.ids.length === 1),
);

/** A picture shown somewhere, kept in media with the words it was shown with. */
export const keepInMediaSchema = v.object({
  fileId: id,
  folderId: v.optional(folderId, null),
  description: v.optional(description, ""),
  credit: v.optional(v.nullable(pictureCreditSchema), null),
});

export const describeItemSchema = v.object({
  id,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(255)),
  title: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(MAX_TITLE)), ""),
  description,
  caption: v.optional(
    v.pipe(v.string(), v.trim(), v.maxLength(MAX_CAPTION)),
    "",
  ),
  credit: v.nullable(pictureCreditSchema),
});

const batch = v.pipe(v.array(id), v.minLength(1), v.maxLength(MAX_MEDIA_BATCH));

export const moveItemsSchema = v.object({ ids: batch, folderId });

export const trashItemSchema = v.object({ id, trashed: v.boolean() });

/** Several items into the trash at once, or back out of it. */
export const trashItemsSchema = v.object({ ids: batch, trashed: v.boolean() });

export const itemRefSchema = v.object({ id });

export const tagNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(MAX_TAG),
);

/**
 * Files items under tags, by name, making any the school does not have
 * yet, and takes them out from under others, by id.
 */
export const tagItemsSchema = v.object({
  ids: batch,
  add: v.optional(
    v.pipe(v.array(tagNameSchema), v.maxLength(MAX_ITEM_TAGS)),
    [],
  ),
  remove: v.optional(v.pipe(v.array(id), v.maxLength(MAX_ITEM_TAGS)), []),
});

export const renameTagSchema = v.object({ id, name: tagNameSchema });

export const tagRefSchema = v.object({ id });

/** Puts a new upload's bytes under an item, or brings back one of its versions. */
export const replaceItemSchema = v.object({ id, sourceId: id });

/** A page of the staff's uploads in documents not yet kept in media. */
export const inDocumentsQuerySchema = v.object({
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
  page: pageField,
});
export type InDocumentsQuery = v.InferInput<typeof inDocumentsQuerySchema>;

export const MAX_LINK = 2048;

/** A file on the web, fetched by the server into media. */
export const importLinkSchema = v.object({
  url: v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(MAX_LINK),
    v.url(),
    v.check((value) => /^https?:\/\//i.test(value), "media.link_scheme"),
  ),
  folderId: v.optional(folderId, null),
});

/** A month items were added in, as the date filter names it. */
export function monthLabel(month: string, locale: string): string {
  const [year = "2000", index = "01"] = month.split("-");
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(Number(year), Number(index) - 1, 1)));
}

/** The shapes a picture may be cut to; "original" keeps the picture's own. */
export const CROP_RATIOS = [
  "original",
  "free",
  "1:1",
  "4:3",
  "3:2",
  "16:9",
] as const;
export type CropRatio = (typeof CROP_RATIOS)[number];

/** A crop of a picture, in its own pixels. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelSize {
  width: number;
  height: number;
}

/** Quarter turns clockwise a picture may be given. */
export const PICTURE_TURNS = [0, 90, 180, 270] as const;
export type PictureTurn = (typeof PICTURE_TURNS)[number];

/**
 * What else is done to a picture as it is cropped: turned, mirrored, and
 * made narrower, the height following. Applied in that order, the crop
 * taken from the turned picture, then the width.
 */
export interface PictureEdits {
  turn: PictureTurn;
  flipX: boolean;
  flipY: boolean;
  /** The width the kept part is scaled down to; none keeps its own. */
  width: number | null;
}

export const NO_EDITS: PictureEdits = {
  turn: 0,
  flipX: false,
  flipY: false,
  width: null,
};

export const pictureEditsSchema = v.object({
  turn: v.picklist(PICTURE_TURNS),
  flipX: v.boolean(),
  flipY: v.boolean(),
  width: v.nullable(
    v.pipe(v.number(), v.integer(), v.minValue(16), v.maxValue(10_000)),
  ),
});

/**
 * A cropped picture's upload, kept beside its original: the original never
 * changes, so every document showing it still shows it whole.
 */
export const cropItemSchema = v.object({
  sourceId: id,
  fileId: id,
  ratio: v.picklist(CROP_RATIOS),
  /** Whether part of the picture was cut away, rather than only turned or resized. */
  cut: v.optional(v.boolean(), true),
  edits: v.optional(pictureEditsSchema),
});

/** Width over height of a ratio, or null where the frame is not fixed. */
export function ratioValue(ratio: CropRatio, size: PixelSize): number | null {
  if (ratio === "free") return null;
  if (ratio === "original") return size.width / size.height;
  const [w = 1, h = 1] = ratio.split(":").map(Number);
  return w / h;
}

/** The largest frame of a ratio that fits in a picture. */
export function largestFrame(size: PixelSize, ratio: number): PixelSize {
  const wide = size.width / size.height > ratio;
  return wide
    ? { width: size.height * ratio, height: size.height }
    : { width: size.width, height: size.width / ratio };
}

/**
 * Where the frame sits and how much of the largest frame it takes: its
 * centre as a share of the picture's width and height, and its scale from
 * 0 to 1. A free frame scales its height on its own.
 */
export interface CropView {
  centerX: number;
  centerY: number;
  scale: number;
  scaleY?: number;
}

const MIN_SCALE = 0.1;
const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/**
 * The pixels a crop keeps: a frame of the ratio, scaled, centred where it
 * was put and pushed back inside the picture where it would overhang.
 */
export function cropRect(
  size: PixelSize,
  ratio: CropRatio,
  view: CropView,
): CropRect {
  const fixed = ratioValue(ratio, size);
  const scale = clamp(view.scale, MIN_SCALE, 1);
  const frame = fixed
    ? largestFrame(size, fixed)
    : { width: size.width, height: size.height };
  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(
    1,
    Math.round(
      frame.height *
        (fixed ? scale : clamp(view.scaleY ?? scale, MIN_SCALE, 1)),
    ),
  );
  const x = clamp(
    Math.round(clamp(view.centerX, 0, 1) * size.width - width / 2),
    0,
    size.width - width,
  );
  const y = clamp(
    Math.round(clamp(view.centerY, 0, 1) * size.height - height / 2),
    0,
    size.height - height,
  );
  return { x, y, width, height };
}

/** A crop's starting frame: the largest of its ratio, about the picture's subject. */
export function initialView(focus?: { x: number; y: number }): CropView {
  return {
    centerX: (focus?.x ?? 50) / 100,
    centerY: (focus?.y ?? 50) / 100,
    scale: 1,
  };
}

/** A cropped picture's name: its original's, with the shape it was cut to. */
export function croppedName(name: string, ratio: CropRatio): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  const label =
    ratio === "original" || ratio === "free" ? "crop" : ratio.replace(":", "x");
  const suffix = ` (${label})${extension}`;
  return `${stem.slice(0, 255 - suffix.length)}${suffix}`;
}

/** Where a media picture's subject sits, or none to forget it. */
export const focusItemSchema = v.object({
  id,
  focus: v.nullable(pictureFocusSchema),
});

/** Whether edits change anything. */
export const isEdited = (edits: PictureEdits) =>
  edits.turn !== 0 || edits.flipX || edits.flipY || edits.width !== null;

/** A picture's size once turned. */
export function turnedSize(size: PixelSize, turn: PictureTurn): PixelSize {
  return turn === 90 || turn === 270
    ? { width: size.height, height: size.width }
    : size;
}

/**
 * Where a picture's subject sits once it is mirrored and then turned, as
 * the picture is drawn: each mirror first, in its own axes, then the turn.
 */
export function turnedFocus(
  focus: { x: number; y: number },
  edits: Pick<PictureEdits, "turn" | "flipX" | "flipY">,
): { x: number; y: number } {
  const x = edits.flipX ? 100 - focus.x : focus.x;
  const y = edits.flipY ? 100 - focus.y : focus.y;
  switch (edits.turn) {
    case 90:
      return { x: 100 - y, y: x };
    case 180:
      return { x: 100 - x, y: 100 - y };
    case 270:
      return { x: y, y: 100 - x };
    default:
      return { x, y };
  }
}

/** The size a kept part ends at: its own, or scaled down to the width asked. */
export function resizedTo(rect: PixelSize, width: number | null): PixelSize {
  if (width === null || width >= rect.width) return rect;
  return {
    width,
    height: Math.max(1, Math.round((rect.height * width) / rect.width)),
  };
}

/**
 * An edited picture's name: its original's with the shape it was cut to,
 * or "edited" where it was only turned, mirrored or resized.
 */
export function editedName(
  name: string,
  ratio: CropRatio,
  cut: boolean,
): string {
  if (cut || ratio !== "original") return croppedName(name, ratio);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";
  const suffix = ` (edited)${extension}`;
  return `${stem.slice(0, 255 - suffix.length)}${suffix}`;
}
