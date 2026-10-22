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

describe("a formula laid out in rows", () => {
  it("reads a matrix by its size and then row by row, as ClearSpeak does", () => {
    expect(english("A=\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}")).toBe(
      "A equals the 2 by 2 matrix; row 1: 1, 2; row 2: 3, 4, end matrix",
    );
    expect(english("\\begin{bmatrix}1\\\\2\\end{bmatrix}")).toBe(
      "the 2 by 1 column matrix; 1, 2, end matrix",
    );
    expect(
      english("\\left(\\begin{array}{c|c}1&0\\\\0&1\\end{array}\\right)"),
    ).toBe("the 2 by 2 matrix; row 1: 1, 0; row 2: 0, 1, end matrix");
    expect(arabic("\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}")).toBe(
      "مَصْفُوفَةٌ مِنَ النَّظْم 2 فِي 2؛ الصَّفّ 1: 1، 2؛ الصَّفّ 2: 3، 4، نِهَايَةُ الْمَصْفُوفَة",
    );
  });

  it("reads a determinant by its order, as Arabic books name it", () => {
    expect(english("\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}")).toBe(
      "the determinant of the 2 by 2 matrix; row 1: a, b; row 2: c, d, end determinant",
    );
    expect(arabic("\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}")).toBe(
      "مُحَدِّدٌ مِنَ الرُّتْبَة 2؛ الصَّفّ 1: a، b؛ الصَّفّ 2: c، d، نِهَايَةُ الْمُحَدِّد",
    );
  });

  it("reads each case with its condition, and keeps a condition the teacher worded", () => {
    expect(
      english(
        "\\begin{cases}x & x\\ge 0\\\\-x & \\text{otherwise}\\end{cases}",
      ),
    ).toBe(
      "case 1: x if x is greater than or equal to 0; case 2: negative x otherwise",
    );
    expect(arabic("\\begin{cases}1 & x>0\\\\0 & x\\le 0\\end{cases}")).toBe(
      "الْحَالَة 1: 1 عِنْدَمَا x أَكْبَرُ مِنْ 0؛ الْحَالَة 2: 0 عِنْدَمَا x أَصْغَرُ مِنْ أَوْ يُسَاوِي 0",
    );
  });

  it("reads the lines of a working one by one, and a binomial coefficient", () => {
    expect(english("\\begin{aligned}2x&=4\\\\x&=2\\end{aligned}")).toBe(
      "line 1: 2 x equals 4; line 2: x equals 2",
    );
    expect(english("\\binom{5}{2}")).toBe("5 choose 2");
    expect(arabic("\\binom{5}{2}")).toBe("تَوَافِيقُ 5 مَأْخُوذَةً 2 فِي كُلِّ مَرَّة");
  });

  it("vowels its words", () => {
    expect(
      voiceCanRead(
        arabic(
          "\\begin{vmatrix}1&2\\\\3&4\\end{vmatrix}+\\begin{pmatrix}1&2\\end{pmatrix}+\\binom{n}{2}",
        ),
      ),
    ).toBe(true);
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

  it("says a formula in Arabic notation with the letters it is drawn in", () => {
    expect(
      spokenMathText("مساحة الدائرة \u2067\\(\\pi r^2\\)\u2069", "ar"),
    ).toBe("مساحة الدائرة ط ر تَرْبِيع");
    expect(spokenMathText("\\(f(x)\\)", "ar")).toBe(
      "f اِفْتَحِ الْقَوْس x أَغْلِقِ الْقَوْس",
    );
  });
});
