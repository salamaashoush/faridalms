import { describe, expect, it } from "vitest";

import {
  editDistance,
  foldAnswer,
  matchAnswer,
  parseNumber,
  westernDigits,
} from "./answers";

describe("folding typed answers", () => {
  it("drops marks and tatweel and joins the forms of alef and yeh", () => {
    expect(foldAnswer("إِسْلَام")).toBe(foldAnswer("اسلام"));
    expect(foldAnswer("مصطفـــى")).toBe(foldAnswer("مصطفي"));
    expect(foldAnswer("آمن")).toBe(foldAnswer("امن"));
  });

  it("treats teh marbuta as heh only when the question says so", () => {
    expect(foldAnswer("مدرسة")).not.toBe(foldAnswer("مدرسه"));
    expect(foldAnswer("مدرسة", { tehMarbuta: true })).toBe(
      foldAnswer("مدرسه", { tehMarbuta: true }),
    );
  });

  it("reads digits in every script and ignores case and stray punctuation", () => {
    expect(westernDigits("١٢٣ ۴۵")).toBe("123 45");
    expect(foldAnswer("  Photosynthesis. ")).toBe("photosynthesis");
    expect(foldAnswer("Cairo", { caseSensitive: true })).not.toBe("cairo");
  });
});

describe("matching typed answers", () => {
  it("accepts any of the teacher's answers once folded", () => {
    expect(
      matchAnswer("القاهرة", ["cairo", "القاهره"], { tehMarbuta: true }),
    ).toBe("القاهره");
    expect(matchAnswer("", ["x"])).toBeNull();
  });

  it("forgives one slip up to nine letters and two above when close enough is on", () => {
    expect(matchAnswer("nitrogn", ["nitrogen"])).toBeNull();
    expect(matchAnswer("nitrogn", ["nitrogen"], { closeEnough: true })).toBe(
      "nitrogen",
    );
    expect(
      matchAnswer("photosintesis", ["photosynthesis"], { closeEnough: true }),
    ).toBe("photosynthesis");
    expect(matchAnswer("ox", ["on"], { closeEnough: true })).toBeNull();
    expect(editDistance("kitten", "sitting")).toBe(3);
  });
});

describe("reading numbers", () => {
  it("reads Arabic-Indic digits and separators as well as western ones", () => {
    expect(parseNumber("٣٫٥")).toBe(3.5);
    expect(parseNumber("١٬٢٠٠")).toBe(1200);
    expect(parseNumber("-0.25")).toBe(-0.25);
    expect(parseNumber("−4")).toBe(-4);
    expect(parseNumber("12a")).toBeNull();
  });
});
