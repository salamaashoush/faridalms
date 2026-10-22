import { describe, expect, it } from "vitest";

import { findIn } from "./find";

const words = (text: string, query: string, matchCase?: boolean) =>
  findIn(text, query, matchCase).map(({ start, end }) =>
    text.slice(start, end),
  );

describe("finding in a text", () => {
  it("finds every match, whatever its case unless asked", () => {
    expect(words("The Nile and the nile", "nile")).toEqual(["Nile", "nile"]);
    expect(words("The Nile and the nile", "nile", true)).toEqual(["nile"]);
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
});
