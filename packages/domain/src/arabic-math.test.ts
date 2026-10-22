import { describe, expect, it } from "vitest";

import { arabicMathML, latinMath } from "./arabic-math";
import { sameMath } from "./math-answers";

const ANNOTATION =
  '<annotation encoding="application/x-tex">f(x)=3.5x</annotation>';

describe("a formula drawn in Arabic notation", () => {
  it("draws the letters, functions and digits of Arabic school books, and leaves its LaTeX as written", () => {
    const markup = `<math><semantics><mrow><mi>f</mi><mo fence="true">(</mo><mi>x</mi><mo fence="true">)</mo><mo>=</mo><mn>3.5</mn><mi>x</mi></mrow>${ANNOTATION}</semantics></math>`;
    expect(arabicMathML(markup, "arab")).toBe(
      `<math><semantics><mrow><mi>د</mi><mo fence="true">(</mo><mi>س</mi><mo fence="true">)</mo><mo>=</mo><mn>٣٫٥</mn><mi>س</mi></mrow>${ANNOTATION}</semantics></math>`,
    );
  });

  it("keeps the school's Western digits where it writes those", () => {
    expect(arabicMathML("<mn>3.5</mn><mi>y</mi>", "latn")).toBe(
      "<mn>3.5</mn><mi>ص</mi>",
    );
  });

  it("names functions as the books do, points arrows the way it reads, and writes Arabic commas", () => {
    expect(
      arabicMathML(
        '<msub><mi>lim</mi><mrow><mi>x</mi><mo>→</mo><mn>0</mn></mrow></msub><mi>sin</mi><mi>θ</mi><mo separator="true">,</mo><mi>π</mi>',
        "arab",
      ),
    ).toBe(
      '<msub><mi>نهــا</mi><mrow><mi>س</mi><mo>←</mo><mn>٠</mn></mrow></msub><mi>جا</mi><mi>θ</mi><mo separator="true">،</mo><mi>ط</mi>',
    );
  });

  it("draws a point's capital as its letter, and leaves letters the books do not agree on", () => {
    expect(
      arabicMathML("<mi>A</mi><mi>B</mi><mi>t</mi><mi>Π</mi>", "arab"),
    ).toBe("<mi>أ</mi><mi>ب</mi><mi>t</mi><mi>Π</mi>");
  });
});

describe("an answer written in Arabic notation", () => {
  it("reads its letters and functions as the Latin ones of the key", () => {
    expect(latinMath("جتا س")).toContain("\\cos");
    expect(sameMath("٢س+١", "2x+1")).toBe(true);
    expect(sameMath("3\\cdotس", "3x")).toBe(true);
    expect(sameMath("جا^2 س + جتا^2 س", "1")).toBe(true);
    expect(sameMath("هـ^س", "e^x")).toBe(true);
    expect(sameMath("ط ر^2", "\\pi r^2")).toBe(true);
    expect(sameMath("أ+ب+ج", "a+b+c")).toBe(true);
  });

  it("still tells one letter from another", () => {
    expect(sameMath("2ص+1", "2x+1")).toBe(false);
  });
});
