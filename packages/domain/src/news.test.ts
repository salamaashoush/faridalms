import { describe, expect, it } from "vitest";

import { contentPlainText } from "./content";
import {
  emptyContent,
  headedContent,
  plainContent,
} from "./content-conversion";
import { documentWritten, translationState } from "./news";

describe("translation state", () => {
  const written = plainContent("مرحبًا بعودتكم.");

  it("asks for a translation that has nothing in it", () => {
    for (const translation of [null, emptyContent(), plainContent("  ")])
      expect(
        translationState({ translation, reviewed: true, current: true }),
      ).toBe("missing");
  });

  it("tells a checked translation from one the original has moved past", () => {
    expect(
      translationState({
        translation: written,
        reviewed: false,
        current: true,
      }),
    ).toBe("unreviewed");
    expect(
      translationState({
        translation: written,
        reviewed: true,
        current: false,
      }),
    ).toBe("stale");
    expect(
      translationState({ translation: written, reviewed: true, current: true }),
    ).toBe("reviewed");
  });
});

describe("headed content", () => {
  it("turns each part into a level-two heading and its text", () => {
    const document = headedContent([
      { heading: "From the principal", body: plainContent("Welcome back.") },
      { heading: " ", body: plainContent("No heading here.") },
    ]);
    expect(document.root.children?.map((node) => node.type)).toEqual([
      "heading",
      "paragraph",
      "paragraph",
    ]);
    expect(document.root.children?.[0]?.tag).toBe("h2");
    expect(contentPlainText(document)).toContain("From the principal");
    expect(documentWritten(document)).toBe(true);
    expect(documentWritten(headedContent([]))).toBe(false);
  });
});
