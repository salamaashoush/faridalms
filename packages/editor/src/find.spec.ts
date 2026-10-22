import { describe, expect, it } from "vitest";

import type { FindOptions } from "./find";

import { findIn } from "./find";

const words = (text: string, query: string, options?: FindOptions) =>
  findIn(text, query, options).map(({ start, end }) => text.slice(start, end));

describe("finding in a text", () => {
  it("finds every match, whatever its case unless asked", () => {
    expect(words("The Nile and the nile", "nile")).toEqual(["Nile", "nile"]);
    expect(words("The Nile and the nile", "nile", { matchCase: true })).toEqual(
      ["nile"],
    );
    expect(findIn("aaaa", "aa")).toHaveLength(2);
    expect(findIn("text", "")).toEqual([]);
  });

  it("finds Arabic with or without its vowel marks and forms of alef", () => {
    expect(words("قال مُحَمَّد: أحمد هنا", "محمد")).toEqual(["مُحَمَّد"]);
    expect(words("قال احمد", "أحمد")).toEqual(["احمد"]);
    expect(words("على الطاولة", "علي")).toEqual(["على"]);
  });

  it("keeps the text's own offsets past letters outside the basic plane", () => {
    const text = "𝑥 equals x";
    expect(words(text, "x")).toEqual(["x"]);
    expect(findIn(text, "equals")[0]?.start).toBe(3);
  });

  it("finds whole words only when asked, in any script", () => {
    const whole = { wholeWords: true };
    expect(words("cat, catalogue and bobcat", "cat", whole)).toEqual(["cat"]);
    expect(words("cat_food and cat", "cat", whole)).toEqual(["cat"]);
    // An attached و or ال makes another word, as Word reads it.
    expect(words("كتاب والكتاب كتابي كِتَاب", "كتاب", whole)).toEqual([
      "كتاب",
      "كِتَاب",
    ]);
    // A search ending in a space or a mark asks no word to end there.
    expect(words("the cat sat", "the ", whole)).toEqual(["the "]);
    expect(words("x2 and 2", "2", whole)).toEqual(["2"]);
    expect(words("𝑥a and 𝑥", "𝑥", whole)).toEqual(["𝑥"]);
    // A rejected match does not hide one that overlaps it.
    expect(words("aa a", "a", whole)).toEqual(["a"]);
  });
});
