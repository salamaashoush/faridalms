import { describe, expect, it } from "vitest";

import { egyptianIdFacts, normaliseIdentifier } from "./identifiers";

describe("identity document numbers", () => {
  it("read the same however they were typed", () => {
    expect(normaliseIdentifier(" a12-345 678/9 ")).toBe("A123456789");
  });

  it("read an Egyptian national ID's birth date and sex", () => {
    expect(egyptianIdFacts("3 0109 1501 01234")).toEqual({
      birthDate: "2001-09-15",
      sex: "male",
    });
    expect(egyptianIdFacts("29912310101224")?.sex).toBe("female");
  });

  it("refuse a number that is not one", () => {
    expect(egyptianIdFacts("40109150101234")).toBeNull();
    expect(egyptianIdFacts("30102300101234")).toBeNull();
    expect(egyptianIdFacts("3010915010123")).toBeNull();
  });
});
