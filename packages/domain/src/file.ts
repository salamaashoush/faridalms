import * as v from "valibot";

export const FILE_PURPOSES = [
  "assignment_resource",
  "submission_attachment",
  "message_attachment",
] as const;
export const MESSAGE_ATTACHMENT_LIMIT = 5;
export const MESSAGE_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export type FilePurpose = (typeof FILE_PURPOSES)[number];
export const FILE_STATES = ["initiated", "ready", "rejected"] as const;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

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
  zip: ["application/zip", "application/x-zip-compressed"],
};

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
export function contentDisposition(name: string): string {
  const safe = safeFilename(name);
  const ascii = safe.replaceAll(/[^\u0020-\u007e]/g, "_").replaceAll('"', "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

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

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
