import * as v from "valibot";

import type { Capability } from "./capabilities";

import { pictureCreditSchema } from "./commons";
import { AREA_SORTS, FILE_KINDS } from "./file";
import { pageField } from "./paging";

/**
 * The school's media library is a file area of the school itself: its
 * files are kept by the school, not by the document that first showed
 * them, and documents show them where they are.
 */
export const LIBRARY_AREA = "media_library";

/**
 * Those who put pictures, video and files in what they write: they choose
 * from the library and add to it.
 */
export const LIBRARY_USERS = [
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
export const LIBRARY_KEEPERS = [
  "news:manage",
  "site:manage",
] as const satisfies readonly Capability[];

export const usesLibrary = (capabilities: readonly Capability[]) =>
  LIBRARY_USERS.some((capability) => capabilities.includes(capability));
export const keepsLibrary = (capabilities: readonly Capability[]) =>
  LIBRARY_KEEPERS.some((capability) => capabilities.includes(capability));

export const MAX_FOLDER_NAME = 80;
export const MAX_DESCRIPTION = 300;
/** The most items one request adds, moves or offers to choose. */
export const MAX_LIBRARY_BATCH = 50;

const id = v.pipe(v.string(), v.uuid());
const folderId = v.nullable(id);

export const folderNameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(MAX_FOLDER_NAME),
);

/**
 * A page of the library: one folder's items, or, while searching, the
 * matches in every folder, by name or description.
 */
export const libraryQuerySchema = v.object({
  folderId: v.optional(folderId, null),
  trashed: v.optional(v.boolean(), false),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
  kinds: v.optional(v.array(v.picklist(FILE_KINDS)), []),
  sort: v.optional(v.picklist(AREA_SORTS), "added"),
  order: v.optional(v.picklist(["asc", "desc"]), "desc"),
  page: pageField,
});
export type LibraryQuery = v.InferInput<typeof libraryQuerySchema>;

export const createFolderSchema = v.object({
  name: folderNameSchema,
  parentId: v.optional(folderId, null),
});

export const renameFolderSchema = v.object({
  id,
  name: folderNameSchema,
});

export const folderRefSchema = v.object({ id });

export const addToLibrarySchema = v.object({
  ids: v.pipe(v.array(id), v.minLength(1), v.maxLength(MAX_LIBRARY_BATCH)),
  folderId: v.optional(folderId, null),
});

const description = v.pipe(v.string(), v.trim(), v.maxLength(MAX_DESCRIPTION));

/** A picture shown somewhere, kept in the library with the words it was shown with. */
export const keepInLibrarySchema = v.object({
  fileId: id,
  folderId: v.optional(folderId, null),
  description: v.optional(description, ""),
  credit: v.optional(v.nullable(pictureCreditSchema), null),
});

export const describeItemSchema = v.object({
  id,
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(255)),
  description,
  credit: v.nullable(pictureCreditSchema),
});

export const moveItemsSchema = v.object({
  ids: v.pipe(v.array(id), v.minLength(1), v.maxLength(MAX_LIBRARY_BATCH)),
  folderId,
});

export const trashItemSchema = v.object({ id, trashed: v.boolean() });

export const itemRefSchema = v.object({ id });

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

/**
 * A cropped picture's upload, kept beside its original: the original never
 * changes, so every document showing it still shows it whole.
 */
export const cropItemSchema = v.object({
  sourceId: id,
  fileId: id,
  ratio: v.picklist(CROP_RATIOS),
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
