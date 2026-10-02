import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { ContentDocument } from "./content";

import {
  contentDocumentSchema,
  sameContent,
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
