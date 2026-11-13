import { describe, expect, it } from "vitest";

import { ageReached, decidesForThemself } from "./acting";

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

describe("whether a learner decides for themself", () => {
  it("follows the age at a school that has not said its learners are adults", () => {
    const at = { adults: false, on: "2026-11-12", from: 18 };
    expect(decidesForThemself({ ...at, birthDate: "2008-11-12" })).toBe(true);
    expect(decidesForThemself({ ...at, birthDate: "2008-11-13" })).toBe(false);
    expect(decidesForThemself({ ...at, birthDate: null })).toBe(false);
  });

  it("holds for every learner of a school of adults, with or without a birth date", () => {
    const at = { adults: true, on: "2026-11-12", from: 18 };
    expect(decidesForThemself({ ...at, birthDate: null })).toBe(true);
    expect(decidesForThemself({ ...at, birthDate: "2015-01-01" })).toBe(true);
    expect(decidesForThemself({ ...at, birthDate: "1990-01-01" })).toBe(true);
  });
});
