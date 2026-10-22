import { afterEach, describe, expect, it } from "vitest";

import {
  arabicDigits,
  digitsOfCookie,
  numberLocale,
  overwriteDigitsSource,
} from "./digits";

describe("a school's digits", () => {
  afterEach(() => overwriteDigitsSource(() => "latn"));

  it("leave Arabic text as written where the school writes Western digits", () => {
    overwriteDigitsSource(() => "latn");
    expect(arabicDigits("الدرس 5 من 12")).toBe("الدرس 5 من 12");
    expect(numberLocale("ar")).toBe("ar-u-nu-latn");
    expect(new Intl.NumberFormat(numberLocale("ar")).format(12)).toBe("12");
  });

  it("write Arabic numbers in Arabic-Indic digits, with the Arabic decimal and percent signs", () => {
    overwriteDigitsSource(() => "arab");
    expect(arabicDigits("الدرس 5 من 12")).toBe("الدرس ٥ من ١٢");
    expect(arabicDigits("الدرجة 13% و 2.5 و 1,234")).toBe(
      "الدرجة ١٣٪ و ٢٫٥ و ١٬٢٣٤",
    );
    expect(new Intl.NumberFormat(numberLocale("ar")).format(12)).toBe("١٢");
    expect(numberLocale("en")).toBe("en");
  });

  it("keep codes and addresses as written", () => {
    overwriteDigitsSource(() => "arab");
    expect(arabicDigits("الفصل 9-A-ARAB")).toBe("الفصل 9-A-ARAB");
    expect(arabicDigits("راسل a1@example.com")).toBe("راسل a1@example.com");
    expect(arabicDigits("https://example.com/2")).toBe("https://example.com/2");
  });

  it("travel with the page in a cookie", () => {
    expect(digitsOfCookie("language-tag=ar; digits=arab")).toBe("arab");
    expect(digitsOfCookie("digits=latn")).toBe("latn");
    expect(digitsOfCookie("")).toBe("latn");
  });
});
