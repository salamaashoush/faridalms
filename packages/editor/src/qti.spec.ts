import type { LessonBlock } from "@faridalms/domain/learning";

import { qtiItem, qtiManifest, qtiTest } from "@faridalms/domain/qti";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { packagePath, readQtiFile } from "./plugins/qti";

const PNG = new Uint8Array(24);
PNG.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
PNG.set([0, 0, 0x03, 0x20, 0, 0, 0x01, 0x90], 16);
const STORED = "11111111-1111-4111-8111-111111111111";

const common = { points: 1, hints: [], explanation: "", tries: null };
const blocks: LessonBlock[] = [
  {
    ...common,
    id: crypto.randomUUID(),
    type: "written",
    prompt: "Second in the test.",
    wordLimit: null,
  },
  {
    ...common,
    id: crypto.randomUUID(),
    type: "hotspot",
    prompt: "First in the test: find the delta.",
    picture: { fileId: STORED, alt: "Egypt" },
    places: [{ box: [0.5, 0.5, 0.25, 0.25], name: "Delta", correct: true }],
  },
];

describe("questions brought in from a QTI package", () => {
  it("resolves paths inside a package", () => {
    expect(packagePath("items/q1.xml", "../media/a%20b.png")).toBe(
      "media/a b.png",
    );
    expect(packagePath("imsmanifest.xml", "./items/q1.xml")).toBe(
      "items/q1.xml",
    );
  });

  it("reads items in their test's order, storing each picture once", async () => {
    const items = blocks.map((block, index) =>
      qtiItem(block, {
        identifier: `Q${index + 1}`,
        title: `Q${index + 1}`,
        picture: () => ({
          href: "../media/egypt.png",
          width: 800,
          height: 400,
        }),
      }),
    );
    const zip = zipSync({
      "pack/imsmanifest.xml": strToU8(
        qtiManifest({
          identifier: "M",
          items: [
            { identifier: "Q1", href: "items/q1.xml", media: [] },
            {
              identifier: "Q2",
              href: "items/q2.xml",
              media: ["media/egypt.png"],
            },
          ],
          tests: [
            { identifier: "T1", href: "tests/t1.xml", items: ["Q2", "Q1"] },
          ],
          media: ["media/egypt.png"],
        }),
      ),
      "pack/tests/t1.xml": strToU8(
        qtiTest({
          identifier: "T1",
          title: "Floods",
          items: [
            { identifier: "Q2", href: "../items/q2.xml" },
            { identifier: "Q1", href: "../items/q1.xml" },
          ],
        }),
      ),
      "pack/items/q1.xml": strToU8(items[0] ?? ""),
      "pack/items/q2.xml": strToU8(items[1] ?? ""),
      "pack/media/egypt.png": PNG,
    });
    const uploads: string[] = [];
    const reading = await readQtiFile(
      new File([zip], "floods.zip", { type: "application/zip" }),
      {
        accept: { image: ["image/png"], file: [], media: [], captions: [] },
        upload: async (file) => {
          uploads.push(file.name);
          return {
            fileId: STORED,
            name: file.name,
            mime: file.type,
            bytes: file.size,
          };
        },
      },
    );
    expect(uploads).toEqual(["egypt.png"]);
    expect(reading.unread).toBe(0);
    expect(reading.questions.map(({ block }) => block.type)).toEqual([
      "hotspot",
      "written",
    ]);
    expect(reading.questions[0]?.block).toMatchObject({
      picture: { fileId: STORED, alt: "Egypt" },
      places: [{ box: [0.5, 0.5, 0.25, 0.25], name: "Delta", correct: true }],
    });
  });
});
