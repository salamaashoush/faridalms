import { describe, expect, it } from "vitest";

import type { MathKey } from "./math-marking";

import { keyIssue, markMath } from "./math-marking";

const key = (answers: string[], extra: Partial<MathKey> = {}): MathKey => ({
  answers,
  tolerance: 0,
  ...extra,
});

describe("an answer asked to a precision", () => {
  const figures = key(["\\pi"], { form: "figures", places: 3 });

  it("takes the key rounded so and written so", () => {
    expect(markMath(figures, "3.14")).toEqual({ correct: true });
    expect(
      markMath(key(["\\frac{2}{3}"], { form: "places", places: 2 }), "0.67"),
    ).toEqual({ correct: true });
    expect(
      markMath(key(["1234.5"], { form: "figures", places: 3 }), "1230"),
    ).toEqual({ correct: true });
    expect(
      markMath(key(["0.031"], { form: "figures", places: 3 }), "0.0310"),
    ).toEqual({ correct: true });
  });

  it("says when the value is right but written to another precision", () => {
    expect(markMath(figures, "3.1416")).toEqual({
      correct: false,
      note: "figures",
    });
    expect(markMath(figures, "3.1")).toEqual({
      correct: false,
      note: "figures",
    });
    expect(markMath(figures, "\\pi")).toEqual({
      correct: false,
      note: "figures",
    });
    expect(
      markMath(key(["\\frac{2}{3}"], { form: "places", places: 2 }), "0.7"),
    ).toEqual({ correct: false, note: "places" });
  });

  it("refuses a wrong value however it is written", () => {
    expect(markMath(figures, "3.15")).toEqual({ correct: false });
  });

  it("works a quantity out in the units it is written in", () => {
    const fall = key(["9.81\\frac{m}{s^2}"], {
      form: "figures",
      places: 2,
      units: "convert",
    });
    expect(markMath(fall, "9.8\\frac{m}{s^2}")).toEqual({ correct: true });
    expect(markMath(fall, "980\\frac{cm}{s^2}")).toEqual({ correct: true });
    expect(markMath(fall, "9.81\\frac{m}{s^2}")).toEqual({
      correct: false,
      note: "figures",
    });
    expect(markMath({ ...fall, units: "same" }, "980\\frac{cm}{s^2}")).toEqual({
      correct: false,
      note: "units",
    });
  });
});

describe("a key checked as its question is published", () => {
  it("asks for units where the question asks students for them", () => {
    expect(keyIssue(key(["9.8"], { units: "convert" }))).toBe("units");
    expect(keyIssue(key(["9.8\\,\\mathrm{N}"], { units: "convert" }))).toBe(
      null,
    );
  });

  it("asks the key to be written in the form students are asked for", () => {
    expect(keyIssue(key(["x^2+5x+6"], { form: "factorised" }))).toBe("form");
    expect(keyIssue(key(["(x+2)(x+3)"], { form: "factorised" }))).toBe(null);
    expect(keyIssue(key(["x"], { form: "figures", places: 3 }))).toBe("form");
    expect(keyIssue(key(["\\sqrt{2}"], { form: "figures", places: 3 }))).toBe(
      null,
    );
  });
});
