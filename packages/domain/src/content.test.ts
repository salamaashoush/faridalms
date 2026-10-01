import * as v from "valibot";
import { describe, expect, it } from "vitest";

import type { ContentDocument } from "./content";

import {
  contentDocumentSchema,
  sameContent,
  starterOf,
  withoutStarter,
} from "./content";
import { plainContent } from "./content-conversion";

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
