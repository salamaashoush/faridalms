import { describe, expect, test } from "vitest";

import {
  exifOrientation,
  orientationTiff,
  stripPictureMetadata,
} from "./picture-metadata";

const ascii = (text: string) => Array.from(text, (c) => c.charCodeAt(0));
const has = (bytes: Uint8Array, text: string) =>
  Buffer.from(bytes).includes(Buffer.from(text, "latin1"));

const segment = (marker: number, body: number[]) => [
  0xff,
  marker,
  (body.length + 2) >> 8,
  (body.length + 2) & 0xff,
  ...body,
];

/** An EXIF block naming an orientation, a camera and where it was. */
function cameraExif(orientation: number) {
  const make = ascii("PhoneCam\0");
  // IFD0: Orientation, Make (offset), GPS IFD pointer; then the GPS IFD.
  const ifd0 = [
    0x00,
    0x03,
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
    0x01,
    0x0f,
    0x00,
    0x02,
    0x00,
    0x00,
    0x00,
    make.length,
    0x00,
    0x00,
    0x00,
    50,
    0x88,
    0x25,
    0x00,
    0x04,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    60,
    0x00,
    0x00,
    0x00,
    0x00,
  ];
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, ...ifd0];
  while (tiff.length < 50) tiff.push(0);
  tiff.push(...make);
  while (tiff.length < 60) tiff.push(0);
  tiff.push(0x00, 0x01, 0x00, 0x02, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02);
  tiff.push(...ascii("N\0"), 0, 0, 0, 0);
  tiff.push(...ascii("GPSLatitude 30.04N"));
  return [...ascii("Exif\0\0"), ...tiff];
}

function cameraJpeg(orientation: number) {
  return Uint8Array.from([
    0xff,
    0xd8,
    ...segment(0xe0, [...ascii("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
    ...segment(0xe1, cameraExif(orientation)),
    ...segment(0xe1, ascii("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>")),
    ...segment(0xed, ascii("Photoshop 3.0\0IPTC")),
    ...segment(0xe2, ascii("ICC_PROFILE\0\x01\x01colours")),
    ...segment(0xfe, ascii("taken at home")),
    ...segment(0xdb, [0, ...Array.from({ length: 64 }, () => 1)]),
    ...segment(0xc0, [8, 0, 16, 0, 16, 1, 1, 0x11, 0]),
    ...segment(0xc4, [0, ...Array.from({ length: 16 }, () => 0)]),
    ...segment(0xda, [1, 1, 0, 0, 63, 0]),
    // Coded data with a stuffed byte and a restart marker in it.
    0x12,
    0xff,
    0x00,
    0x34,
    0xff,
    0xd0,
    0x56,
    0xff,
    0xd9,
    // A second picture a phone appends after the first.
    0xff,
    0xd8,
    ...segment(0xe1, cameraExif(1)),
    0xff,
    0xd9,
  ]);
}

describe("stripping a JPEG", () => {
  test("keeps the picture and its orientation, and drops the rest", () => {
    const cleaned = stripPictureMetadata(cameraJpeg(6), "image/jpeg");
    expect(cleaned).not.toBeNull();
    if (!cleaned) throw new Error("nothing was removed");
    for (const said of [
      "GPSLatitude",
      "PhoneCam",
      "xmpmeta",
      "IPTC",
      "taken at home",
    ])
      expect(has(cleaned, said)).toBe(false);
    expect(has(cleaned, "JFIF")).toBe(true);
    expect(has(cleaned, "ICC_PROFILE")).toBe(true);
    expect(Array.from(cleaned.subarray(-9))).toEqual([
      0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56, 0xff, 0xd9,
    ]);
    const exif = Buffer.from(cleaned).indexOf(
      Buffer.from("Exif\0\0", "latin1"),
    );
    expect(exifOrientation(cleaned.subarray(exif + 6, exif + 6 + 26))).toBe(6);
  });

  test("an upright photo keeps no EXIF at all", () => {
    const cleaned = stripPictureMetadata(cameraJpeg(1), "image/jpeg");
    expect(cleaned && has(cleaned, "Exif")).toBe(false);
  });

  test("a picture with nothing to remove is left alone", () => {
    const once = stripPictureMetadata(cameraJpeg(1), "image/jpeg");
    if (!once) throw new Error("nothing was removed");
    expect(stripPictureMetadata(once, "image/jpeg")).toBeNull();
  });

  test("bytes that are not a JPEG are not touched", () => {
    expect(
      stripPictureMetadata(Uint8Array.from([1, 2, 3]), "image/jpeg"),
    ).toBeNull();
    expect(
      stripPictureMetadata(cameraJpeg(6).subarray(0, 40), "image/jpeg"),
    ).toBeNull();
  });
});

function pngChunk(type: string, data: number[]) {
  const length = data.length;
  return [
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...ascii(type),
    ...data,
    0,
    0,
    0,
    0,
  ];
}

describe("stripping a PNG", () => {
  test("drops its words and camera data, keeping how to draw it", () => {
    const png = Uint8Array.from([
      137,
      80,
      78,
      71,
      13,
      10,
      26,
      10,
      ...pngChunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]),
      ...pngChunk("tEXt", ascii("Comment\0GPSLatitude 30.04N")),
      ...pngChunk("eXIf", cameraExif(8).slice(6)),
      ...pngChunk("iTXt", ascii("XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta/>")),
      ...pngChunk("sRGB", [0]),
      ...pngChunk("IDAT", [1, 2, 3]),
      ...pngChunk("IEND", []),
    ]);
    const cleaned = stripPictureMetadata(png, "image/png");
    expect(cleaned).not.toBeNull();
    if (!cleaned) throw new Error("nothing was removed");
    for (const said of ["GPSLatitude", "PhoneCam", "xmpmeta", "tEXt"])
      expect(has(cleaned, said)).toBe(false);
    for (const kept of ["IHDR", "sRGB", "IDAT", "IEND", "eXIf"])
      expect(has(cleaned, kept)).toBe(true);
    const at = Buffer.from(cleaned).indexOf(Buffer.from("eXIf", "latin1"));
    expect(exifOrientation(cleaned.subarray(at + 4, at + 4 + 26))).toBe(8);
  });
});

describe("stripping a WebP and a GIF", () => {
  test("a WebP loses its EXIF and XMP and says so in its header", () => {
    const body = [
      ...ascii("VP8X"),
      10,
      0,
      0,
      0,
      0x0c,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      ...ascii("VP8 "),
      4,
      0,
      0,
      0,
      1,
      2,
      3,
      4,
      ...ascii("EXIF"),
      7,
      0,
      0,
      0,
      ...ascii("GPSData"),
      0,
      ...ascii("XMP "),
      4,
      0,
      0,
      0,
      ...ascii("<x/>"),
    ];
    const size = body.length + 4;
    const webp = Uint8Array.from([
      ...ascii("RIFF"),
      size & 0xff,
      size >> 8,
      0,
      0,
      ...ascii("WEBP"),
      ...body,
    ]);
    const cleaned = stripPictureMetadata(webp, "image/webp");
    expect(cleaned).not.toBeNull();
    if (!cleaned) throw new Error("nothing was removed");
    expect(has(cleaned, "GPSData")).toBe(false);
    expect(has(cleaned, "<x/>")).toBe(false);
    expect(cleaned[20]).toBe(0);
    expect(new DataView(cleaned.buffer).getUint32(4, true)).toBe(
      cleaned.length - 8,
    );
  });

  test("a GIF loses its comments and keeps looping", () => {
    const gif = Uint8Array.from([
      ...ascii("GIF89a"),
      1,
      0,
      1,
      0,
      0x80,
      0,
      0,
      0,
      0,
      0,
      255,
      255,
      255,
      0x21,
      0xff,
      11,
      ...ascii("NETSCAPE2.0"),
      3,
      1,
      0,
      0,
      0,
      0x21,
      0xfe,
      9,
      ...ascii("GPS 30.04"),
      0,
      0x21,
      0xff,
      11,
      ...ascii("XMP DataXMP"),
      4,
      ...ascii("<x/>"),
      0,
      0x2c,
      0,
      0,
      0,
      0,
      1,
      0,
      1,
      0,
      0,
      2,
      2,
      0x4c,
      0x01,
      0,
      0x3b,
    ]);
    const cleaned = stripPictureMetadata(gif, "image/gif");
    expect(cleaned).not.toBeNull();
    if (!cleaned) throw new Error("nothing was removed");
    expect(has(cleaned, "GPS 30.04")).toBe(false);
    expect(has(cleaned, "<x/>")).toBe(false);
    expect(has(cleaned, "NETSCAPE2.0")).toBe(true);
    expect(cleaned.at(-1)).toBe(0x3b);
  });
});

test("an orientation-only EXIF reads back as written", () => {
  for (let orientation = 1; orientation <= 8; orientation += 1)
    expect(exifOrientation(orientationTiff(orientation))).toBe(orientation);
});
