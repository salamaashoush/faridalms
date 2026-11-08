import * as v from "valibot";
import { describe, expect, test } from "vitest";

import {
  croppedName,
  cropRect,
  describeItemSchema,
  initialView,
  largestFrame,
  importLinkSchema,
  libraryQuerySchema,
  ratioValue,
} from "./media-library";

const landscape = { width: 4000, height: 3000 };

describe("cropping a picture", () => {
  test("a fixed ratio takes the largest frame of its shape", () => {
    expect(largestFrame(landscape, 16 / 9)).toEqual({
      width: 4000,
      height: 2250,
    });
    expect(largestFrame(landscape, 1)).toEqual({ width: 3000, height: 3000 });
  });

  test("the original ratio is the picture's own, and a free frame has none", () => {
    expect(ratioValue("original", landscape)).toBeCloseTo(4 / 3);
    expect(ratioValue("free", landscape)).toBeNull();
    expect(ratioValue("3:2", landscape)).toBe(1.5);
  });

  test("a square crop centres on the subject and stays inside the picture", () => {
    expect(cropRect(landscape, "1:1", initialView({ x: 50, y: 50 }))).toEqual({
      x: 500,
      y: 0,
      width: 3000,
      height: 3000,
    });
    // A subject at the far edge pushes the frame against it, not past it.
    expect(cropRect(landscape, "1:1", initialView({ x: 100, y: 0 }))).toEqual({
      x: 1000,
      y: 0,
      width: 3000,
      height: 3000,
    });
  });

  test("a scaled frame keeps its ratio", () => {
    const rect = cropRect(landscape, "16:9", {
      centerX: 0.25,
      centerY: 0.25,
      scale: 0.5,
    });
    expect(rect.width / rect.height).toBeCloseTo(16 / 9, 2);
    expect(rect).toEqual({ x: 0, y: 188, width: 2000, height: 1125 });
  });

  test("a free frame scales its height on its own, and never below a tenth", () => {
    expect(
      cropRect(landscape, "free", {
        centerX: 0.5,
        centerY: 0.5,
        scale: 0.5,
        scaleY: 0.01,
      }),
    ).toEqual({ x: 1000, y: 1350, width: 2000, height: 300 });
  });

  test("a cropped copy is named after its original and its shape", () => {
    expect(croppedName("assembly.jpg", "16:9")).toBe("assembly (16x9).jpg");
    expect(croppedName("assembly.jpg", "free")).toBe("assembly (crop).jpg");
    expect(croppedName("noextension", "1:1")).toBe("noextension (1x1)");
    expect(croppedName(`${"a".repeat(260)}.png`, "4:3")).toHaveLength(255);
  });
});

describe("library requests", () => {
  test("a page of the library starts at the top folder, newest first", () => {
    expect(v.parse(libraryQuerySchema, {})).toEqual({
      folderId: null,
      trashed: false,
      q: "",
      kinds: [],
      months: [],
      uploaders: [],
      tags: [],
      sort: "added",
      order: "desc",
      page: 1,
    });
  });

  test("a month filter names a real month", () => {
    expect(
      v.safeParse(libraryQuerySchema, { months: ["2026-11"] }).success,
    ).toBe(true);
    for (const month of ["2026-13", "2026-1", "November"])
      expect(v.safeParse(libraryQuerySchema, { months: [month] }).success).toBe(
        false,
      );
  });

  test("a link to bring in is a web address", () => {
    expect(
      v.safeParse(importLinkSchema, { url: "https://example.com/a.png" })
        .success,
    ).toBe(true);
    for (const url of [
      "ftp://example.com/a.png",
      "file:///etc/passwd",
      "a.png",
    ])
      expect(v.safeParse(importLinkSchema, { url }).success).toBe(false);
  });

  test("a description longer than a picture's words may be is refused", () => {
    const item = {
      id: "0199a5a0-0000-7000-8000-000000000001",
      name: "Assembly",
      credit: null,
    };
    expect(
      v.safeParse(describeItemSchema, { ...item, description: "x".repeat(300) })
        .success,
    ).toBe(true);
    expect(
      v.safeParse(describeItemSchema, { ...item, description: "x".repeat(301) })
        .success,
    ).toBe(false);
  });
});
