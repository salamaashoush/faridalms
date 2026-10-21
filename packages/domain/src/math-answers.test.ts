import { describe, expect, it } from "vitest";

import { sameMath } from "./math-answers";

describe("mathematics marked by what it means", () => {
  it("takes the same expression written another way", () => {
    for (const [answer, key] of [
      ["2x+2", "2(x+1)"],
      ["2\\left(x+1\\right)", "2x+2"],
      ["\\frac{1}{2}", "0.5"],
      ["x^2-1", "(x-1)(x+1)"],
      ["\\frac{x^{2}-1}{x-1}", "x+1"],
      ["\\sqrt{4x^2}", "2|x|"],
      ["\\sqrt[3]{-8}", "-2"],
      ["\\sin^2x+\\cos^2x", "1"],
      ["2\\pi r", "\\pi\\cdot r\\cdot2"],
      ["\\frac{a}{b}\\div\\frac{c}{d}", "\\frac{ad}{bc}"],
      ["x_1+x_{2}", "x_{2}+x_1"],
      ["e^{\\ln3}", "3"],
      ["\\log_{2}8", "3"],
      ["٢س", "2س"],
    ])
      expect(sameMath(answer ?? "", key ?? ""), `${answer} = ${key}`).toBe(
        true,
      );
  });

  it("refuses an expression that only looks alike", () => {
    for (const [answer, key] of [
      ["2x+1", "2(x+1)"],
      ["x", "\\sqrt{x^2}"],
      ["x^23", "x^{23}"],
      ["\\frac{1}{3}", "0.33"],
      ["x+y", "x"],
    ])
      expect(sameMath(answer ?? "", key ?? ""), `${answer} ≠ ${key}`).toBe(
        false,
      );
  });

  it("takes an equation with the same solutions", () => {
    expect(sameMath("x=2", "x=2")).toBe(true);
    expect(sameMath("2x+2=6", "x+1=3")).toBe(true);
    expect(sameMath("y=2x+1", "y-1=2x")).toBe(true);
    expect(sameMath("x=3", "x=2")).toBe(false);
    expect(sameMath("2", "x=2")).toBe(false);
  });

  it("lets a number be as close as the teacher allows", () => {
    expect(sameMath("3.14", "\\pi")).toBe(false);
    expect(sameMath("3.14", "\\pi", 0.01)).toBe(true);
    expect(sameMath("3.1", "\\pi", 0.01)).toBe(false);
  });

  it("reads Arabic digits and a decimal comma", () => {
    expect(sameMath("٣٫٥", "3.5")).toBe(true);
    expect(sameMath("3{,}5", "\\frac{7}{2}")).toBe(true);
  });

  it("gives no answer for what it cannot read", () => {
    expect(sameMath("x\\le2", "x\\le2")).toBeNull();
    expect(sameMath("x=2, x=3", "x=2,x=3")).toBeNull();
    expect(sameMath("", "1")).toBeNull();
  });
});
