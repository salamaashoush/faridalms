import { describe, expect, it } from "vitest";

import {
  ACCEPTED_EXTENSIONS,
  acceptedMediaType,
  attachable,
  byteRange,
  CONTENT_CHECKED_EXTENSIONS,
  contentBytesNeeded,
  contentMatchesName,
  previewable,
} from "./file";

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((value) =>
      typeof value === "string"
        ? [...new TextEncoder().encode(value)]
        : [value],
    ),
  );

describe("contentMatchesName", () => {
  it("accepts a document that opens with its signature", () => {
    expect(contentMatchesName("worksheet.pdf", bytes("%PDF-1.7\n"))).toBe(true);
    expect(
      contentMatchesName(
        "photo.png",
        bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0),
      ),
    ).toBe(true);
    expect(
      contentMatchesName("clip.webp", bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 ")),
    ).toBe(true);
    expect(
      contentMatchesName("lesson.mp4", bytes(0, 0, 0, 0x20, "ftypisom")),
    ).toBe(true);
  });

  it("refuses a renamed executable or a script posing as a picture", () => {
    expect(contentMatchesName("worksheet.pdf", bytes("MZ", 0x90, 0))).toBe(
      false,
    );
    expect(contentMatchesName("photo.png", bytes("<svg onload=x>"))).toBe(
      false,
    );
    expect(
      contentMatchesName("clip.webp", bytes("RIFF", 0, 0, 0, 0, "WAVE")),
    ).toBe(false);
  });

  it("wants text to be UTF-8 without NUL bytes", () => {
    expect(contentMatchesName("notes.txt", bytes("قراءة الفصل الثاني"))).toBe(
      true,
    );
    expect(contentMatchesName("notes.txt", bytes("a", 0, "b"))).toBe(false);
    expect(contentMatchesName("notes.csv", bytes(0xc3, 0x28))).toBe(false);
  });

  it("wants captions to carry the WebVTT header", () => {
    expect(
      contentMatchesName(
        "captions.vtt",
        bytes("WEBVTT\n\n00:00.000 --> 00:01.000\nHi"),
      ),
    ).toBe(true);
    expect(
      contentMatchesName("captions.vtt", bytes(0xef, 0xbb, 0xbf, "WEBVTT")),
    ).toBe(true);
    expect(
      contentMatchesName(
        "captions.vtt",
        bytes("1\n00:00:00,000 --> 00:00:01,000"),
      ),
    ).toBe(false);
  });

  it("accepts a drawing only when it is an Excalidraw scene", () => {
    expect(
      contentMatchesName(
        "drawing.excalidraw",
        bytes('{"type":"excalidraw","version":2,"elements":[]}'),
      ),
    ).toBe(true);
    expect(
      contentMatchesName("drawing.excalidraw", bytes('{"type":"other"}')),
    ).toBe(false);
    expect(
      contentMatchesName("drawing.excalidraw", bytes("<script>x</script>")),
    ).toBe(false);
  });

  it("accepts a coding project only when it is a zip, as the studio saves it", () => {
    expect(
      contentMatchesName("project.sb3", bytes(0x50, 0x4b, 0x03, 0x04, 0x14)),
    ).toBe(true);
    expect(contentMatchesName("project.sb3", bytes("<script>x</script>"))).toBe(
      false,
    );
    expect(acceptedMediaType("project.sb3", "application/x.scratch.sb3")).toBe(
      true,
    );
    expect(attachable("project.sb3")).toBe(false);
  });

  it("never passes bytes that carry no signature", () => {
    expect(
      ACCEPTED_EXTENSIONS.filter((extension) =>
        contentMatchesName(`probe.${extension}`, new Uint8Array(64)),
      ),
    ).toEqual([]);
  });

  it("has a content rule for every accepted extension", () => {
    expect(
      ACCEPTED_EXTENSIONS.filter(
        (extension) => !CONTENT_CHECKED_EXTENSIONS.includes(extension),
      ),
    ).toEqual([]);
  });
});

describe("contentBytesNeeded", () => {
  it("reads a whole text file and only a prefix of anything else", () => {
    expect(contentBytesNeeded("notes.txt", 5000)).toBe(5000);
    expect(contentBytesNeeded("worksheet.pdf", 5000)).toBe(64);
  });
});

describe("byteRange", () => {
  it("reads the ranges a player asks for while seeking", () => {
    expect(byteRange("bytes=0-", 1000)).toEqual({ start: 0, end: 999 });
    expect(byteRange("bytes=100-199", 1000)).toEqual({ start: 100, end: 199 });
    expect(byteRange("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 });
    expect(byteRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
  });

  it("sends the whole file for no range or several, and refuses one past the end", () => {
    expect(byteRange(null, 1000)).toBeNull();
    expect(byteRange("bytes=0-1,5-9", 1000)).toBeNull();
    expect(byteRange("bytes=1000-", 1000)).toBe("unsatisfiable");
    expect(byteRange("bytes=-0", 1000)).toBe("unsatisfiable");
  });
});

describe("previewable", () => {
  it("shows pictures, PDFs, sound, video and text, and downloads the rest", () => {
    expect(previewable("application/pdf")).toBe(true);
    expect(previewable("image/png")).toBe(true);
    expect(previewable("video/mp4")).toBe(true);
    expect(previewable("text/plain; charset=utf-8")).toBe(true);
    expect(
      previewable(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(false);
    expect(previewable("text/csv")).toBe(false);
  });
});
