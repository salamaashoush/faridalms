import * as v from "valibot";

/**
 * What a person may upload a file for; the purposes the cell's files table
 * pins. Health reports, evidence and imports have flows of their own.
 */
export const FILE_PURPOSES = [
  "attachment",
  "submission",
  "document_media",
  "site_media",
] as const;
export const MESSAGE_ATTACHMENT_LIMIT = 5;
export const MESSAGE_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export type FilePurpose = (typeof FILE_PURPOSES)[number];

export interface FileSummary {
  id: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
}
export const FILE_STATES = ["initiated", "ready", "rejected"] as const;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const FILE_REJECTIONS = [
  "too_large",
  "size_mismatch",
  "content_mismatch",
  "infected",
  "scan_unavailable",
  "abandoned",
] as const;
export type FileRejection = (typeof FILE_REJECTIONS)[number];

const HOUR = 60 * 60 * 1000;
/** How long an upload may stay initiated before it counts as abandoned. */
export const ABANDONED_UPLOAD_MS = 24 * HOUR;
/** How long a verified file may stay attached to nothing before it is removed. */
export const UNLINKED_FILE_MS = 7 * 24 * HOUR;
/**
 * How long a picture or file taken out of every document stays restorable,
 * by undo or a version restore, before it is retired: the trash window.
 */
export const TRASHED_MEDIA_MS = 30 * 24 * HOUR;
/** How long a rejected upload's record is kept for diagnosis. */
export const REJECTED_FILE_MS = 30 * 24 * HOUR;

/**
 * Extensions a school may exchange, each with the media types a browser may
 * legitimately report for it. Anything executable or scriptable stays out;
 * an SVG can carry script, so it is a picture only once rasterised.
 */
const ACCEPTED_TYPES: Record<string, readonly string[]> = {
  pdf: ["application/pdf"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  gif: ["image/gif"],
  webp: ["image/webp"],
  txt: ["text/plain"],
  md: ["text/markdown", "text/plain"],
  csv: ["text/csv", "text/plain", "application/vnd.ms-excel"],
  doc: ["application/msword"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ppt: ["application/vnd.ms-powerpoint"],
  pptx: [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  odt: ["application/vnd.oasis.opendocument.text"],
  odp: ["application/vnd.oasis.opendocument.presentation"],
  ods: ["application/vnd.oasis.opendocument.spreadsheet"],
  mp3: ["audio/mpeg"],
  m4a: ["audio/mp4", "audio/x-m4a"],
  wav: ["audio/wav", "audio/x-wav"],
  mp4: ["video/mp4"],
  webm: ["video/webm"],
  vtt: ["text/vtt"],
  excalidraw: ["application/json"],
  zip: ["application/zip", "application/x-zip-compressed"],
};

const bytesOf = (text: string) => Array.from(new TextEncoder().encode(text));

/**
 * Leading bytes each binary format must start with, so a renamed executable or
 * script cannot pass as a document. Offsets are relative to the file start.
 */
const SIGNATURES: Record<string, readonly (readonly [number, number[]])[][]> = {
  pdf: [[[0, bytesOf("%PDF-")]]],
  png: [[[0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]]]],
  jpg: [[[0, [0xff, 0xd8, 0xff]]]],
  jpeg: [[[0, [0xff, 0xd8, 0xff]]]],
  gif: [[[0, bytesOf("GIF87a")]], [[0, bytesOf("GIF89a")]]],
  webp: [
    [
      [0, bytesOf("RIFF")],
      [8, bytesOf("WEBP")],
    ],
  ],
  doc: [[[0, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]]]],
  xls: [[[0, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]]]],
  ppt: [[[0, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]]]],
  docx: [[[0, [0x50, 0x4b, 0x03, 0x04]]]],
  pptx: [[[0, [0x50, 0x4b, 0x03, 0x04]]]],
  xlsx: [[[0, [0x50, 0x4b, 0x03, 0x04]]]],
  odt: [[[0, [0x50, 0x4b, 0x03, 0x04]]]],
  odp: [[[0, [0x50, 0x4b, 0x03, 0x04]]]],
  ods: [[[0, [0x50, 0x4b, 0x03, 0x04]]]],
  zip: [[[0, [0x50, 0x4b, 0x03, 0x04]]], [[0, [0x50, 0x4b, 0x05, 0x06]]]],
  mp3: [
    [[0, bytesOf("ID3")]],
    [[0, [0xff, 0xfb]]],
    [[0, [0xff, 0xf3]]],
    [[0, [0xff, 0xf2]]],
    [[0, [0xff, 0xfa]]],
    [[0, [0xff, 0xe3]]],
  ],
  m4a: [[[4, bytesOf("ftyp")]]],
  mp4: [[[4, bytesOf("ftyp")]]],
  wav: [
    [
      [0, bytesOf("RIFF")],
      [8, bytesOf("WAVE")],
    ],
  ],
  webm: [[[0, [0x1a, 0x45, 0xdf, 0xa3]]]],
};

const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "vtt", "excalidraw"]);

/** A drawing's editable scene, as the editor's drawing board saves it. */
function isExcalidrawScene(text: string): boolean {
  try {
    const scene: unknown = JSON.parse(text);
    return (
      typeof scene === "object" &&
      scene !== null &&
      "type" in scene &&
      scene.type === "excalidraw"
    );
  } catch {
    return false;
  }
}

/** Extensions whose content can be checked, for the guard that every accepted one can. */
export const CONTENT_CHECKED_EXTENSIONS = [
  ...TEXT_EXTENSIONS,
  ...Object.keys(SIGNATURES),
];

/** Bytes to read before judging a file: the whole of a text file, a prefix otherwise. */
export function contentBytesNeeded(name: string, sizeBytes: number): number {
  return TEXT_EXTENSIONS.has(fileExtension(name)) ? sizeBytes : 64;
}

/**
 * Whether stored bytes are what the name claims. Text must be UTF-8 without
 * NUL bytes (WebVTT must also carry its header, a drawing must be a scene);
 * other formats must open with their signature.
 */
export function contentMatchesName(name: string, bytes: Uint8Array): boolean {
  const extension = fileExtension(name);
  if (TEXT_EXTENSIONS.has(extension)) {
    if (bytes.includes(0)) return false;
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return false;
    }
    if (extension === "excalidraw") return isExcalidrawScene(text);
    return extension !== "vtt" || /^\uFEFF?WEBVTT(?:[ \t\r\n]|$)/.test(text);
  }
  const alternatives = SIGNATURES[extension];
  if (!alternatives) return false;
  return alternatives.some((parts) =>
    parts.every(([offset, expected]) =>
      expected.every((byte, index) => bytes[offset + index] === byte),
    ),
  );
}

export function fileExtension(name: string): string {
  const match = /\.([a-z0-9]{1,10})$/i.exec(name);
  return match?.[1]?.toLowerCase() ?? "";
}

export function acceptedMediaType(name: string, mediaType: string): boolean {
  const allowed = ACCEPTED_TYPES[fileExtension(name)];
  return Boolean(
    allowed?.includes(mediaType.toLowerCase().split(";")[0]?.trim() ?? ""),
  );
}

export const ACCEPTED_EXTENSIONS = Object.keys(ACCEPTED_TYPES);

/** Files a person may put in a document; captions and drawings have blocks of their own. */
export const ATTACHABLE_EXTENSIONS = ACCEPTED_EXTENSIONS.filter(
  (extension) => extension !== "vtt" && extension !== "excalidraw",
);

export function attachable(name: string): boolean {
  return ATTACHABLE_EXTENSIONS.includes(fileExtension(name));
}

export type FileFamily =
  | "pdf"
  | "document"
  | "sheet"
  | "slides"
  | "text"
  | "image"
  | "audio"
  | "video"
  | "archive"
  | "other";

const FAMILY: Record<string, FileFamily> = {
  pdf: "pdf",
  doc: "document",
  docx: "document",
  odt: "document",
  xls: "sheet",
  xlsx: "sheet",
  ods: "sheet",
  csv: "sheet",
  ppt: "slides",
  pptx: "slides",
  odp: "slides",
  txt: "text",
  md: "text",
  zip: "archive",
};

/** What kind of thing a file is, for its icon and how it opens. */
export function fileFamily(name: string, mediaType: string): FileFamily {
  const known = FAMILY[fileExtension(name)];
  if (known) return known;
  const type = mediaType.toLowerCase();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("video/")) return "video";
  return "other";
}

/** The short type people read beside a file's size: "PDF", "DOCX". */
export function fileTypeLabel(name: string): string {
  return fileExtension(name).toUpperCase();
}

/** The media type to declare when a browser reports none for a known extension. */
export function mediaTypeFor(name: string): string | undefined {
  return ACCEPTED_TYPES[fileExtension(name)]?.[0];
}

/**
 * A name safe to store and to echo back in a header: no path separators, no
 * control characters, bounded length, extension preserved.
 */
export function safeFilename(name: string): string {
  const extension = fileExtension(name);
  const source = extension ? name.slice(0, -extension.length - 1) : name;
  let cleaned = "";
  for (const character of source) {
    const code = character.charCodeAt(0);
    cleaned +=
      code < 32 || code === 127 || '\\/:*?"<>|'.includes(character)
        ? " "
        : character;
  }
  const stem = cleaned
    .replaceAll(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .trim()
    .slice(0, 100);
  const base = stem || "file";
  return extension ? `${base}.${extension}` : base;
}

/** RFC 6266 disposition with an ASCII fallback and a UTF-8 form for Arabic names. */
/**
 * Types a browser shows on its own without running anything: pictures, PDFs,
 * sound, video and plain text. Everything else downloads.
 */
export function previewable(mediaType: string): boolean {
  const type = mediaType.toLowerCase().split(";")[0]?.trim() ?? "";
  return (
    type === "application/pdf" ||
    type === "text/plain" ||
    /^(image|audio|video)\//.test(type)
  );
}

/**
 * The bytes a `Range` header asks for, inclusive, or "unsatisfiable"; null
 * when there is no single byte range to honour and the whole file is sent.
 */
export function byteRange(
  header: string | null,
  size: number,
): { start: number; end: number } | "unsatisfiable" | null {
  const match = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
  if (!match) return null;
  const [, from = "", to = ""] = match;
  if (from === "" && to === "") return null;
  if (from === "") {
    const suffix = Number(to);
    if (suffix === 0) return "unsatisfiable";
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(from);
  const end = to === "" ? size - 1 : Math.min(Number(to), size - 1);
  if (start >= size || end < start) return "unsatisfiable";
  return { start, end };
}

export function contentDisposition(
  name: string,
  kind: "attachment" | "inline" = "attachment",
): string {
  const safe = safeFilename(name);
  const ascii = safe.replaceAll(/[^\u0020-\u007e]/g, "_").replaceAll('"', "'");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

/** A class's or module's file area: what its teachers keep for its documents. */
export const FILE_AREAS = ["class", "module"] as const;
export type FileArea = (typeof FILE_AREAS)[number];
export const fileAreaSchema = v.object({
  type: v.picklist(FILE_AREAS),
  id: v.pipe(v.string(), v.uuid()),
});

export const initiateUploadSchema = v.pipe(
  v.object({
    purpose: v.picklist(FILE_PURPOSES),
    name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(255)),
    mediaType: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(128)),
    sizeBytes: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(1),
      v.maxValue(MAX_FILE_BYTES),
    ),
    /**
     * Where the file is going, so the right storage cap is checked: a class's
     * or module's area, or a student's work on an assignment.
     */
    destination: v.optional(
      v.object({
        type: v.picklist(["class", "module", "work"]),
        id: v.pipe(v.string(), v.uuid()),
      }),
    ),
  }),
  v.forward(
    v.check(
      (value) => acceptedMediaType(value.name, value.mediaType),
      "validation.file_type",
    ),
    ["name"],
  ),
);
export type InitiateUploadInput = v.InferOutput<typeof initiateUploadSchema>;
export type UploadDestination = NonNullable<InitiateUploadInput["destination"]>;

/** Which storage an upload counts against and is refused by when full. */
export const STORAGE_SCOPES = ["school", "class", "module", "person"] as const;
export type StorageScope = (typeof STORAGE_SCOPES)[number];

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
