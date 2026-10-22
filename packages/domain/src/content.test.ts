import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { ContentDocument } from "./content";

import {
  contentDocumentSchema,
  contentFileIds,
  contentPlainText,
  sameContent,
  spokenWords,
  starterOf,
  withBlockIds,
  withoutStarter,
  wordsAt,
} from "./content";
import { plainContent } from "./content-conversion";

describe("block ids for comments", () => {
  it("gives each block without one an id from its place, the same every time", () => {
    const work = plainContent("First line.\nSecond line.");
    const placed = withBlockIds(work);
    const ids = (placed.root.children ?? []).map((node) => node.$?.id);
    expect(ids).toEqual(["p0zzzzzz", "p1zzzzzz"]);
    expect(withBlockIds(work)).toEqual(placed);
    expect(v.safeParse(contentDocumentSchema, placed).success).toBe(true);
    expect(placed.root.children?.[0]?.children?.[0]?.$).toBeUndefined();
  });

  it("keeps the ids the editor gave", () => {
    const work = plainContent("Kept.");
    const [first] = work.root.children ?? [];
    if (first) first.$ = { id: "editor01" };
    expect(withBlockIds(work).root.children?.[0]?.$?.id).toBe("editor01");
  });
});

describe("the words a comment points at", () => {
  it("reads across blocks by their own text, as the reader draws it", () => {
    const work = withBlockIds(
      plainContent("Dear Salama,\nI hope you are well."),
    );
    const [first, second] = work.root.children ?? [];
    const start = { block: first?.$?.id ?? "", offset: 5 };
    expect(
      wordsAt(work, { start, end: { block: start.block, offset: 11 } }),
    ).toBe("Salama");
    expect(
      wordsAt(work, { start, end: { block: second?.$?.id ?? "", offset: 6 } }),
    ).toBe("Salama,I hope");
    expect(
      wordsAt(work, { start: { block: "missing1", offset: 0 }, end: start }),
    ).toBe("");
  });
});

const timed = (words: number[]) => {
  const work = plainContent("The cat  sat.");
  const [first] = work.root.children ?? [];
  if (first)
    first.$ = {
      narration: "01a0e2ff-ce2c-7469-87b6-4df4196afd4f",
      words,
    };
  return v.safeParse(contentDocumentSchema, work);
};

describe("words timed against a recording", () => {
  it("finds each word and where it starts, whatever the spaces between", () => {
    expect(spokenWords(" The cat  sat.")).toEqual([
      { word: "The", at: 1 },
      { word: "cat", at: 5 },
      { word: "sat.", at: 10 },
    ]);
  });

  it("keeps times that never go back, within three minutes", () => {
    const parsed = timed([120, 480, 480]);
    expect(parsed.success).toBe(true);
    expect(
      parsed.success && parsed.output.root.children?.[0]?.$?.words,
    ).toEqual([120, 480, 480]);
    expect(timed([480, 120]).success).toBe(false);
    expect(timed([180_001]).success).toBe(false);
    expect(timed([1.5]).success).toBe(false);
  });
});

const code = (run: unknown) => {
  const work = plainContent("print(1)");
  const [first] = work.root.children ?? [];
  if (first) {
    first.type = "code";
    first.language = "py";
    first.$ = { run } as NonNullable<typeof first.$>;
  }
  return work;
};

describe("code students run", () => {
  it("keeps whether students run a block or predict first, and counts it as a change", () => {
    const parsed = v.safeParse(contentDocumentSchema, code("predict"));
    expect(parsed.success && parsed.output.root.children?.[0]?.$?.run).toBe(
      "predict",
    );
    expect(v.safeParse(contentDocumentSchema, code("always")).success).toBe(
      false,
    );
    expect(sameContent(code("run"), code("predict"))).toBe(false);
  });
});

describe("same content", () => {
  it("ignores key order and the direction the editor works out", () => {
    const stored = plainContent("Read the poem.");
    const opened = JSON.parse(
      JSON.stringify(stored, (key, value: unknown) =>
        key === "direction" ? "ltr" : value,
      ),
    ) as typeof stored;
    const reordered = {
      root: Object.fromEntries(Object.entries(stored.root).toReversed()),
    } as typeof stored;
    expect(sameContent(stored, opened)).toBe(true);
    expect(sameContent(stored, reordered)).toBe(true);
  });

  it("sees a changed word or format", () => {
    expect(
      sameContent(plainContent("Read the poem."), plainContent("Read it.")),
    ).toBe(false);
    const bold = plainContent("Read the poem.");
    const text = bold.root.children?.[0]?.children?.[0];
    if (text) text.format = 1;
    expect(sameContent(plainContent("Read the poem."), bold)).toBe(false);
  });
});

describe("each student's copy", () => {
  it("sets part of a brief aside for each student and out of the brief they read", () => {
    const brief = plainContent("Write a letter.");
    const worksheet = plainContent("Dear ...");
    const document: ContentDocument = {
      root: {
        ...brief.root,
        children: [
          ...(brief.root.children ?? []),
          {
            type: "starter",
            version: 1,
            format: "",
            indent: 0,
            direction: null,
            children: worksheet.root.children ?? [],
          },
        ],
      },
    };
    expect(v.safeParse(contentDocumentSchema, document).success).toBe(true);
    expect(starterOf(document)?.root.children).toEqual(worksheet.root.children);
    expect(sameContent(withoutStarter(document), brief)).toBe(true);
    expect(starterOf(brief)).toBeNull();
  });
});

const file = (n: number) => `0190a1b2-0000-7000-8000-00000000002${n}`;
const alone = (node: ContentDocument["root"]): ContentDocument => ({
  root: { type: "root", version: 1, children: [node] },
});

const valid = (node: ContentDocument["root"]) =>
  v.safeParse(contentDocumentSchema, alone(node)).success;

describe("pictures with places, galleries and before and after", () => {
  it("keeps a picture's places, each with its own id and a share of the picture", () => {
    const wall = {
      id: "abcd1234ef",
      x: 0.2,
      y: 0.4,
      title: "Wall",
      text: "Keeps its shape.",
    };
    const labelled = {
      type: "image" as const,
      version: 1 as const,
      fileId: file(1),
      alt: "A plant cell",
      labels: [wall],
    };
    expect(valid(labelled)).toBe(true);
    expect(valid({ ...labelled, labels: [{ ...wall, x: 1.2 }] })).toBe(false);
    expect(contentPlainText(alone(labelled))).toBe(
      "A plant cell\nWall: Keeps its shape.",
    );
  });

  it("holds two pictures at most in a before and after, any number up to the limit in a gallery", () => {
    const pictures = [1, 2, 3].map((n) => ({
      fileId: file(n),
      alt: `Picture ${n}`,
    }));
    expect(valid({ type: "gallery", version: 1, pictures })).toBe(true);
    expect(valid({ type: "compare", version: 1, pictures })).toBe(false);
    expect(
      valid({ type: "compare", version: 1, pictures: pictures.slice(0, 2) }),
    ).toBe(true);
    expect(
      contentFileIds(
        alone({ type: "gallery", version: 1, pictures }),
      ).toSorted(),
    ).toEqual([file(1), file(2), file(3)]);
  });
});
