import { describe, expect, it } from "vitest";

import { sameMath } from "./math-answers";
import { inMathForm } from "./math-forms";

describe("an answer factorised completely", () => {
  it.each([
    "(x+2)(x+3)",
    "(x-2)^2",
    "(2-x)(3-x)",
    "3(2x+3)",
    "x(x-1)(x+1)",
    "(x+1)(x^2+1)",
    "(x-y)(x+y)",
    "(x+3)(y+2)",
    "2(x+2y)",
    "x^2+1",
    "x+1",
    "7",
  ])("takes %s, whose factors split no further", (latex) => {
    expect(inMathForm(latex, "factorised")).toBe(true);
  });

  it.each([
    "x^2+5x+6",
    "(2x+4)(x+1)",
    "6x+9",
    "x^2-9",
    "x^3-x",
    "x(x^2-1)",
    "x^4+3x^2+2",
    "x^2-y^2",
    "a^2+2ab+b^2",
    "xy+2x+3y+6",
    "x(x-4+\\frac{4}{x})",
  ])("refuses %s, not factorised or only partly", (latex) => {
    expect(inMathForm(latex, "factorised")).toBe(false);
  });
});

describe("an answer expanded and simplified", () => {
  it.each(["2x+2", "x^2+5x+6", "6x^2-x-2", "a^2-b^2", "-x+3", "5"])(
    "takes %s, its brackets gone and like terms gathered",
    (latex) => {
      expect(inMathForm(latex, "expanded")).toBe(true);
    },
  );

  it.each([
    "2(x+1)",
    "(x+2)(x+3)",
    "(x+1)^2",
    "2x+3x",
    "x\\cdot x",
    "2-(x-1)",
    "x^2+2x+3x+6",
  ])("refuses %s, with brackets left or like terms apart", (latex) => {
    expect(inMathForm(latex, "expanded")).toBe(false);
  });
});

describe("a fraction in its simplest form", () => {
  it.each([
    "\\frac{3}{4}",
    "-\\frac{2}{3}",
    "\\frac{7}{3}",
    "5",
    "2\\frac{1}{3}",
  ])("takes %s, in lowest terms", (latex) => {
    expect(inMathForm(latex, "fraction")).toBe(true);
  });

  it.each([
    "\\frac{6}{8}",
    "\\frac{8}{2}",
    "0.75",
    "\\frac{3}{1}",
    "2\\frac{4}{3}",
    "2\\frac{2}{4}",
  ])("refuses %s, which cancels, is a decimal or is improper", (latex) => {
    expect(inMathForm(latex, "fraction")).toBe(false);
  });

  it("reads a mixed number as school does: two and a third", () => {
    expect(sameMath("2\\frac{1}{3}", "\\frac{7}{3}")).toBe(true);
    expect(sameMath("-2\\frac{1}{3}", "-\\frac{7}{3}")).toBe(true);
  });
});

describe("a number in standard form", () => {
  it.each([
    "3.2\\times10^{4}",
    "4.5\\times 10^{-3}",
    "10^{6}",
    "-7.1\\times10^{2}",
  ])("takes %s, a times ten to a whole power", (latex) => {
    expect(inMathForm(latex, "standard")).toBe(true);
  });

  it.each([
    "32000",
    "32\\times10^{3}",
    "0.32\\times10^{5}",
    "3.2\\times10^{1.5}",
  ])("refuses %s, an ordinary number or a out of range", (latex) => {
    expect(inMathForm(latex, "standard")).toBe(false);
  });
});

it("says nothing of an answer it cannot read", () => {
  expect(inMathForm("\\int x\\,dx", "expanded")).toBeNull();
});
