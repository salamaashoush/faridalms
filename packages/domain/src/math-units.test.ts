import { describe, expect, it } from "vitest";

import { compareQuantity, readQuantity } from "./math-units";

const compare = (answer: string, key: string, strict = false, tolerance = 0) =>
  compareQuantity(answer, key, tolerance, strict);

describe("a quantity with units", () => {
  it("reads the number and units MathLive writes", () => {
    for (const latex of [
      "9.8\\frac{m}{s^2}",
      "9.8\\,\\mathrm{m}/\\mathrm{s}^{2}",
      "9.8\\mathrm{m\\cdot s^{-2}}",
      "9.8 m s^{-2}",
    ])
      expect(readQuantity(latex)?.value).toBe(9.8);
    expect(readQuantity("3.2\\times10^{4}\\,\\mathrm{km}")?.value).toBe(32000);
    expect(readQuantity("٢٫٥ kg")?.value).toBe(2.5);
    expect(readQuantity("2x")).toBeNull();
  });

  it("takes the same quantity in other units, unless the teacher asked for the key's", () => {
    expect(compare("9.8\\frac{m}{s^2}", "9.8\\,\\mathrm{m\\,s^{-2}}")).toBe(
      "right",
    );
    expect(compare("980\\frac{cm}{s^2}", "9.8\\frac{m}{s^2}")).toBe("right");
    expect(compare("2.5 kg", "2500 g")).toBe("right");
    expect(compare("2.5 kg", "2500 g", true)).toBe("units");
    expect(compare("90 \\frac{km}{h}", "25 \\frac{m}{s}")).toBe("right");
    expect(compare("1 L", "1000 cm^3")).toBe("right");
    expect(compare("12 in", "1 ft")).toBe("right");
  });

  it("converts temperatures by their scales' zeros", () => {
    expect(compare("298.15 K", "25^{\\circ}\\mathrm{C}")).toBe("right");
    expect(compare("77 °F", "25 °C")).toBe("right");
  });

  it("refuses the wrong number, the wrong kind of units, and a bare number", () => {
    expect(compare("9.7\\frac{m}{s^2}", "9.8\\frac{m}{s^2}")).toBe("wrong");
    expect(compare("9.8\\frac{m}{s}", "9.8\\frac{m}{s^2}")).toBe("wrong");
    expect(compare("9.8", "9.8\\frac{m}{s^2}")).toBe("unitless");
    expect(compare("9.75\\frac{m}{s^2}", "9.8\\frac{m}{s^2}", false, 0.1)).toBe(
      "right",
    );
    expect(compare("975\\frac{cm}{s^2}", "9.8\\frac{m}{s^2}", false, 0.1)).toBe(
      "right",
    );
  });

  it("has nothing to compare where the key has no units", () => {
    expect(compare("5", "5")).toBeNull();
  });
});
