import { describe, expect, it } from "vitest";

import { voiceCanRead } from "./arabic";
import { spokenMath, spokenMathText } from "./math-speech";

const english = (latex: string) => spokenMath(latex, "en");
const arabic = (latex: string) => spokenMath(latex, "ar");

describe("a formula said in English", () => {
  it("reads operators, relations and signs", () => {
    expect(english("2x+3=7")).toBe("2 x plus 3 equals 7");
    expect(english("-3 \\le x - 1")).toBe(
      "negative 3 is less than or equal to x minus 1",
    );
    expect(english("a \\times b \\div c \\neq d")).toBe(
      "a times b divided by c is not equal to d",
    );
  });

  it("says powers, roots and fractions as a teacher would", () => {
    expect(english("x^2+y^3")).toBe("x squared plus y cubed");
    expect(english("e^{x+1}")).toBe("e to the power of x plus 1 end power");
    expect(english("\\frac{1}{2}")).toBe("1 over 2");
    expect(english("\\frac{x+1}{2}")).toBe(
      "the fraction with numerator x plus 1 and denominator 2",
    );
    expect(english("\\sqrt{9}")).toBe("the square root of 9");
    expect(english("\\sqrt[3]{x+1}")).toBe(
      "the cube root of x plus 1 end root",
    );
    expect(english("x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}")).toBe(
      "x equals the fraction with numerator negative b plus or minus the square root of b squared minus 4 a c end root and denominator 2 a",
    );
  });

  it("names functions, Greek letters, brackets and limits", () => {
    expect(english("\\sin^2\\theta+\\cos^2\\theta=1")).toBe(
      "sine squared theta plus cosine squared theta equals 1",
    );
    expect(english("\\log_2 8")).toBe("log base 2 of 8");
    expect(english("2(x+1)")).toBe("2 open bracket x plus 1 close bracket");
    expect(english("\\left|x-3\\right|")).toBe(
      "the absolute value of x minus 3 end absolute value",
    );
    expect(english("\\lim_{x\\to 0}\\frac{\\sin x}{x}")).toBe(
      "the limit as x approaches 0 of the fraction with numerator sine x and denominator x",
    );
    expect(english("\\sum_{i=1}^{n} i")).toBe(
      "the sum from i equals 1 to n of i",
    );
    expect(english("30^\\circ")).toBe("30 degrees");
    expect(english("x_1, \\pi r^2")).toBe("x sub 1 comma pi r squared");
  });

  it("says what it does not know as written, and words as words", () => {
    expect(english("5\\,\\text{cm}")).toBe("5 cm");
    expect(english("\\mathbb{R}")).toBe("the real numbers");
    expect(english("\\foo{x}")).toBe("foo x");
  });
});

describe("a formula said in Arabic", () => {
  it("reads it with the words of Arabic school mathematics", () => {
    expect(arabic("س+٣=٧")).toBe("س زَائِد ٣ يُسَاوِي ٧");
    expect(arabic("x^2-1")).toBe("x تَرْبِيع نَاقِص 1");
    expect(arabic("\\frac{3}{4}")).toBe("3 عَلَى 4");
    expect(arabic("\\frac{س+1}{2}")).toBe("كَسْرٌ بَسْطُهُ س زَائِد 1 وَمَقَامُهُ 2");
    expect(arabic("\\sqrt{س}")).toBe("الْجَذْرُ التَّرْبِيعِيّ س");
    expect(arabic("\\sin 30^\\circ")).toBe("جَيْب 30 دَرَجَة");
    expect(arabic("x_1 \\geq -2")).toBe("x 1 أَكْبَرُ مِنْ أَوْ يُسَاوِي سَالِب 2");
    expect(arabic("\\lim_{x\\to\\infty}")).toBe(
      "النِّهَايَة عِنْدَمَا x تَؤُولُ إِلَى مَا لَا نِهَايَة",
    );
  });

  it("vowels its words, so a browser voice may read them to a child", () => {
    expect(voiceCanRead(arabic("\\frac{\\sqrt{x}+1}{2} \\le \\pi"))).toBe(true);
  });
});

describe("text with formulas in it", () => {
  it("says each formula in words where it stands", () => {
    expect(spokenMathText("Solve \\(x^2=9\\) for x.", "en")).toBe(
      "Solve x squared equals 9 for x.",
    );
    expect(spokenMathText("حل \u2067\\(س+١=٣\\)\u2069 الآن", "ar")).toBe(
      "حل س زَائِد ١ يُسَاوِي ٣ الآن",
    );
  });
});
