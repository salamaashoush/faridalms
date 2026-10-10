import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  acceptedMediaType,
  contentDisposition,
  initiateUploadSchema,
  safeFilename,
} from "./file";

describe("safeFilename", () => {
  it("strips paths and control characters but keeps the extension", () => {
    expect(safeFilename("../../etc/passwd")).toBe("etc passwd");
    expect(safeFilename("report\u0000.pdf")).toBe("report.pdf");
    expect(safeFilename("C:\\Users\\salama\\essay.docx")).toBe(
      "C Users salama essay.docx",
    );
  });

  it("keeps Arabic names and bounds the length", () => {
    expect(safeFilename("واجب الرياضيات.pdf")).toBe("واجب الرياضيات.pdf");
    expect(safeFilename(`${"a".repeat(200)}.png`)).toHaveLength(104);
    expect(safeFilename("   ")).toBe("file");
  });
});

describe("contentDisposition", () => {
  it("offers an ASCII fallback and a UTF-8 form", () => {
    expect(contentDisposition('my "essay".pdf')).toBe(
      "attachment; filename=\"my essay.pdf\"; filename*=UTF-8''my%20essay.pdf",
    );
    expect(contentDisposition("واجب.pdf")).toBe(
      "attachment; filename=\"____.pdf\"; filename*=UTF-8''%D9%88%D8%A7%D8%AC%D8%A8.pdf",
    );
  });
});

describe("acceptedMediaType", () => {
  it("matches the extension against the media types a browser reports", () => {
    expect(acceptedMediaType("essay.pdf", "application/pdf")).toBe(true);
    expect(acceptedMediaType("essay.pdf", "text/html")).toBe(false);
    expect(acceptedMediaType("run.exe", "application/octet-stream")).toBe(
      false,
    );
    expect(acceptedMediaType("logo.svg", "image/svg+xml")).toBe(false);
    expect(acceptedMediaType("notes.CSV", "text/csv; charset=utf-8")).toBe(
      true,
    );
  });

  it("rejects an initiation for a disallowed type or size", () => {
    expect(
      v.safeParse(initiateUploadSchema, {
        purpose: "attachment",
        name: "script.js",
        mediaType: "text/javascript",
        sizeBytes: 10,
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(initiateUploadSchema, {
        purpose: "attachment",
        name: "video.mp4",
        mediaType: "video/mp4",
        sizeBytes: 26 * 1024 * 1024,
      }).success,
    ).toBe(false);
  });

  it("lets a video in a document weigh more than other files, up to its own limit", () => {
    const video = {
      purpose: "document_media",
      name: "lesson.mp4",
      mediaType: "video/mp4",
    };
    expect(
      v.safeParse(initiateUploadSchema, {
        ...video,
        sizeBytes: 150 * 1024 * 1024,
      }).success,
    ).toBe(true);
    expect(
      v.safeParse(initiateUploadSchema, {
        ...video,
        sizeBytes: 201 * 1024 * 1024,
      }).success,
    ).toBe(false);
    // A picture in the same document keeps to the limit of every file.
    expect(
      v.safeParse(initiateUploadSchema, {
        purpose: "document_media",
        name: "map.png",
        mediaType: "image/png",
        sizeBytes: 26 * 1024 * 1024,
      }).success,
    ).toBe(false);
  });
});
