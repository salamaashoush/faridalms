import { describe, expect, it } from "vitest";

import { sameContent } from "./content";
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
