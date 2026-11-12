import { describe, expect, it } from "vitest";

import { ageReached } from "./acting";

describe("the age a learner decides for themself from", () => {
  it("is reached on the birthday itself, not the day before", () => {
    expect(ageReached("2008-11-12", "2026-11-12", 18)).toBe(true);
    expect(ageReached("2008-11-12", "2026-11-11", 18)).toBe(false);
  });

  it("is reached on 1 March by one born on 29 February, in a year without one", () => {
    expect(ageReached("2008-02-29", "2026-02-28", 18)).toBe(false);
    expect(ageReached("2008-02-29", "2026-03-01", 18)).toBe(true);
    expect(ageReached("2004-02-29", "2020-02-29", 16)).toBe(true);
  });

  it("is never reached without a birth date", () => {
    expect(ageReached(null, "2099-01-01", 1)).toBe(false);
  });
});
