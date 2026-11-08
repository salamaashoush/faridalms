/**
 * Location, camera and editing records removed from a picture's bytes
 * without decoding it, so nothing is lost but what was said about it.
 * Cameras and phones write where a photo was taken, on what, and often a
 * thumbnail of it as first shot; a school's pictures of children must keep
 * none of that. A JPEG's or PNG's orientation is the one record kept, in a
 * minimal EXIF of its own, so the picture still stands as it was taken
 * until the media service turns its pixels upright.
 */

/** The cleaned bytes, or null when there was nothing to remove. */
export function stripPictureMetadata(
  bytes: Uint8Array,
  mediaType: string,
): Uint8Array<ArrayBuffer> | null {
  const type = mediaType.toLowerCase().split(";")[0]?.trim();
  const cleaned =
    type === "image/jpeg"
      ? stripJpeg(bytes)
      : type === "image/png"
        ? stripPng(bytes)
        : type === "image/webp"
          ? stripWebp(bytes)
          : type === "image/gif"
            ? stripGif(bytes)
            : null;
  return cleaned && !sameBytes(cleaned, bytes) ? cleaned : null;
}

function sameBytes(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1)
    if (a[index] !== b[index]) return false;
  return true;
}

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const ascii = (text: string) => Uint8Array.from(text, (c) => c.charCodeAt(0));

function startsWith(bytes: Uint8Array, at: number, prefix: Uint8Array) {
  if (at + prefix.length > bytes.length) return false;
  for (let index = 0; index < prefix.length; index += 1)
    if (bytes[at + index] !== prefix[index]) return false;
  return true;
}

const EXIF_HEADER = ascii("Exif\0\0");

/**
 * The orientation an EXIF block (a TIFF structure) gives its picture, 1 to
 * 8, or null where it names none.
 */
export function exifOrientation(tiff: Uint8Array): number | null {
  if (tiff.length < 8) return null;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  if (!little && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return null;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const ifd = view.getUint32(4, little);
  if (ifd + 2 > tiff.length) return null;
  const count = view.getUint16(ifd, little);
  for (let entry = 0; entry < count; entry += 1) {
    const at = ifd + 2 + entry * 12;
    if (at + 12 > tiff.length) return null;
    if (view.getUint16(at, little) !== 0x0112) continue;
    if (view.getUint16(at + 2, little) !== 3) return null;
    const value = view.getUint16(at + 8, little);
    return value >= 1 && value <= 8 ? value : null;
  }
  return null;
}

/** A TIFF structure holding nothing but an orientation. */
export function orientationTiff(orientation: number): Uint8Array {
  return Uint8Array.from([
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08,
    0x00,
    0x01,
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    orientation,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);
}

const isStandalone = (marker: number) =>
  marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7);

/** Application segments a decoder needs to draw the colours right. */
function keepsJpegSegment(marker: number, body: Uint8Array): boolean {
  if (marker === 0xe0) return startsWith(body, 0, ascii("JFIF\0"));
  if (marker === 0xe2) return startsWith(body, 0, ascii("ICC_PROFILE\0"));
  if (marker === 0xee) return startsWith(body, 0, ascii("Adobe"));
  if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) return false;
  return true;
}

function jpegSegment(marker: number, body: Uint8Array): Uint8Array {
  const length = body.length + 2;
  return concat([
    Uint8Array.from([0xff, marker, length >> 8, length & 0xff]),
    body,
  ]);
}

function stripJpeg(bytes: Uint8Array): Uint8Array<ArrayBuffer> | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let at = 2;
  while (at + 1 < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1] ?? 0;
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    if (marker === 0xd9) {
      // Whatever follows the picture's end, a second picture or a
      // maker's trailer, is not the picture.
      parts.push(bytes.subarray(at, at + 2));
      return concat(parts);
    }
    if (isStandalone(marker)) {
      parts.push(bytes.subarray(at, at + 2));
      at += 2;
      continue;
    }
    if (at + 4 > bytes.length) return null;
    const length = ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0);
    if (length < 2 || at + 2 + length > bytes.length) return null;
    const body = bytes.subarray(at + 4, at + 2 + length);
    if (marker === 0xda) {
      // The scan's coded data runs to the next marker that is neither a
      // stuffed byte nor a restart.
      let end = at + 2 + length;
      while (end + 1 < bytes.length) {
        const next = bytes[end + 1] ?? 0;
        if (
          bytes[end] === 0xff &&
          next !== 0x00 &&
          next !== 0xff &&
          !(next >= 0xd0 && next <= 0xd7)
        )
          break;
        end += 1;
      }
      if (end + 1 >= bytes.length) return null;
      parts.push(bytes.subarray(at, end));
      at = end;
      continue;
    }
    if (marker === 0xe1 && startsWith(body, 0, EXIF_HEADER)) {
      const orientation = exifOrientation(body.subarray(EXIF_HEADER.length));
      if (orientation !== null && orientation !== 1)
        parts.push(
          jpegSegment(
            0xe1,
            concat([EXIF_HEADER, orientationTiff(orientation)]),
          ),
        );
    } else if (keepsJpegSegment(marker, body)) {
      parts.push(bytes.subarray(at, at + 2 + length));
    }
    at += 2 + length;
  }
  return null;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes)
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function uint32(value: number): Uint8Array {
  return Uint8Array.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

/** Chunks a PNG keeps: the picture itself and how to draw it, frames included. */
const PNG_KEPT = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  "tRNS",
  "cHRM",
  "gAMA",
  "iCCP",
  "sBIT",
  "sRGB",
  "cICP",
  "mDCV",
  "cLLI",
  "bKGD",
  "hIST",
  "pHYs",
  "sPLT",
  "acTL",
  "fcTL",
  "fdAT",
]);
const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const named = concat([ascii(type), data]);
  return concat([uint32(data.length), named, uint32(crc32(named))]);
}

function stripPng(bytes: Uint8Array): Uint8Array<ArrayBuffer> | null {
  if (!startsWith(bytes, 0, PNG_SIGNATURE)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [PNG_SIGNATURE];
  let at = 8;
  while (at + 12 <= bytes.length) {
    const length = view.getUint32(at);
    const end = at + 12 + length;
    if (end > bytes.length) return null;
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (type === "eXIf") {
      const orientation = exifOrientation(
        bytes.subarray(at + 8, at + 8 + length),
      );
      if (orientation !== null && orientation !== 1)
        parts.push(pngChunk("eXIf", orientationTiff(orientation)));
    } else if (PNG_KEPT.has(type)) {
      parts.push(bytes.subarray(at, end));
    }
    at = end;
    if (type === "IEND") return concat(parts);
  }
  return null;
}

/** Chunks a WebP keeps; EXIF goes too, since browsers draw WebP unturned. */
const WEBP_KEPT = new Set([
  "VP8 ",
  "VP8L",
  "VP8X",
  "ALPH",
  "ANIM",
  "ANMF",
  "ICCP",
]);

function stripWebp(bytes: Uint8Array): Uint8Array<ArrayBuffer> | null {
  if (
    !startsWith(bytes, 0, ascii("RIFF")) ||
    !startsWith(bytes, 8, ascii("WEBP"))
  )
    return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [];
  let at = 12;
  while (at + 8 <= bytes.length) {
    const type = String.fromCharCode(...bytes.subarray(at, at + 4));
    const length = view.getUint32(at + 4, true);
    const end = at + 8 + length + (length % 2);
    if (at + 8 + length > bytes.length) return null;
    if (WEBP_KEPT.has(type)) {
      const chunk = bytes.slice(at, Math.min(end, bytes.length));
      // The extended header says which chunks follow; EXIF and XMP no longer do.
      if (type === "VP8X" && chunk.length > 8)
        chunk[8] = (chunk[8] ?? 0) & ~0x0c;
      parts.push(chunk);
    }
    at = end;
  }
  const body = concat(parts);
  return concat([
    ascii("RIFF"),
    littleUint32(body.length + 4),
    ascii("WEBP"),
    body,
  ]);
}

function littleUint32(value: number): Uint8Array {
  return Uint8Array.from([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

/** Application extensions a GIF keeps: how it loops, and its colours. */
const GIF_APPLICATIONS = ["NETSCAPE2.0", "ANIMEXTS1.0", "ICCRGBG1012"].map(
  ascii,
);

/** The end of a run of GIF sub-blocks starting at `at`, past its terminator. */
function subBlocksEnd(bytes: Uint8Array, at: number): number | null {
  let next = at;
  while (next < bytes.length) {
    const size = bytes[next] ?? 0;
    next += 1 + size;
    if (size === 0) return next;
  }
  return null;
}

function stripGif(bytes: Uint8Array): Uint8Array<ArrayBuffer> | null {
  if (!startsWith(bytes, 0, ascii("GIF8")) || bytes.length < 13) return null;
  const packed = bytes[10] ?? 0;
  let at = 13 + (packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0);
  const parts: Uint8Array[] = [bytes.subarray(0, at)];
  while (at < bytes.length) {
    const block = bytes[at];
    if (block === 0x3b) {
      parts.push(bytes.subarray(at, at + 1));
      return concat(parts);
    }
    if (block === 0x2c) {
      const flags = bytes[at + 9] ?? 0;
      const table = flags & 0x80 ? 3 * 2 ** ((flags & 0x07) + 1) : 0;
      const end = subBlocksEnd(bytes, at + 10 + table + 1);
      if (end === null) return null;
      parts.push(bytes.subarray(at, end));
      at = end;
      continue;
    }
    if (block !== 0x21) return null;
    const label = bytes[at + 1];
    const end = subBlocksEnd(bytes, at + 2);
    if (end === null) return null;
    const kept =
      label === 0xf9 ||
      label === 0x01 ||
      (label === 0xff &&
        GIF_APPLICATIONS.some((name) => startsWith(bytes, at + 3, name)));
    if (kept) parts.push(bytes.subarray(at, end));
    at = end;
  }
  return null;
}
