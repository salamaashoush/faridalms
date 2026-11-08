import { describe, expect, test } from "vitest";

import {
  acceptedFormats,
  chooseSize,
  pictureSrcSet,
  placeholderUrl,
  previewKindOf,
  UNPREVIEWED_PURPOSES,
} from "./previews";

const size = (name: string, width: number) => ({
  name,
  width,
  height: width,
  mediaType: name.endsWith(".avif")
    ? ("image/avif" as const)
    : ("image/webp" as const),
  bytes: width,
});
const sizes = [320, 640, 1024].flatMap((width) => [
  size(`w${width}.webp`, width),
  size(`w${width}.avif`, width),
]);

describe("previews", () => {
  test("pictures, sound, PDFs and office files get them; sealed files do not", () => {
    expect(previewKindOf("document_media", "image/jpeg")).toBe("picture");
    expect(previewKindOf("attachment", "audio/webm")).toBe("audio");
    expect(previewKindOf("attachment", "application/pdf")).toBe("pdf");
    expect(
      previewKindOf(
        "attachment",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe("office");
    expect(previewKindOf("document_media", "video/mp4")).toBeNull();
    expect(previewKindOf("evidence", "image/jpeg")).toBeNull();
    expect(previewKindOf("health_report", "application/pdf")).toBeNull();
    expect(previewKindOf("export", "application/pdf")).toBeNull();
    for (const purpose of UNPREVIEWED_PURPOSES)
      expect(previewKindOf(purpose, "image/png")).toBeNull();
  });

  test("a browser gets the smallest size wide enough in the best format it takes", () => {
    const formats = acceptedFormats("image/avif,image/webp,*/*");
    expect(formats).toEqual(["image/avif", "image/webp"]);
    expect(chooseSize(sizes, 500, formats)?.name).toBe("w640.avif");
    expect(chooseSize(sizes, 640, ["image/webp"])?.name).toBe("w640.webp");
    expect(chooseSize(sizes, 2000, formats)).toBeNull();
    expect(chooseSize(sizes, 300, acceptedFormats("image/png,*/*"))).toBeNull();
    expect(chooseSize(sizes, 300, formats, "page1-")).toBeNull();
  });

  test("a placeholder is drawn from its hash, and a broken one is none", () => {
    // ThumbHash's own example picture.
    expect(placeholderUrl("1QcSHQRnh493V4dIh4eXh1h4kJUI")).toMatch(
      /^data:image\/png;base64,/,
    );
    expect(placeholderUrl("")).toBeNull();
    expect(placeholderUrl("%%%")).toBeNull();
  });

  test("a srcset names every width through one address", () => {
    expect(pictureSrcSet("/files/a", [320, 640])).toBe(
      "/files/a?w=320 320w, /files/a?w=640 640w",
    );
    expect(pictureSrcSet("/files/a?x=1", [320])).toBe(
      "/files/a?x=1&w=320 320w",
    );
  });
});
