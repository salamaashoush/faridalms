import { describe, expect, it } from "vitest";

import { nationalNumber } from "./phone";

describe("nationalNumber", () => {
  it("reads a national and an international number as the same one", () => {
    expect(nationalNumber("0100 000 0003")).toBe("1000000003");
    expect(nationalNumber("+20 100 000 0003")).toBe("1000000003");
    expect(nationalNumber("+201000000003")).toBe("1000000003");
    expect(nationalNumber("0020 100 000 0003")).toBe("1000000003");
    expect(nationalNumber("+20 (0)100 000 0003")).toBe("1000000003");
  });

  it("takes each calling code at its own length", () => {
    expect(nationalNumber("+1 415 555 0100")).toBe("4155550100");
    expect(nationalNumber("+44 7700 900123")).toBe("7700900123");
    expect(nationalNumber("+971 50 123 4567")).toBe("501234567");
    expect(nationalNumber("+966 50 123 4567")).toBe("501234567");
  });

  it("leaves a number without a prefix as typed, less the trunk zero", () => {
    expect(nationalNumber("201000000003")).toBe("201000000003");
    expect(nationalNumber("050 123 4567")).toBe("501234567");
    expect(nationalNumber("")).toBe("");
  });
});
