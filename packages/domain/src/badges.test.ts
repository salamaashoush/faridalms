import { describe, expect, it } from "vitest";

import { badgeYearEnd } from "./badges";

const years = [
  { startsOn: "2027-09-01", endsBefore: "2028-07-01" },
  { startsOn: "2026-09-01", endsBefore: "2027-07-01" },
];
const otherwise = new Date("2030-01-01T00:00:00Z");

describe("badgeYearEnd", () => {
  it("ends a badge with the year it is printed in", () => {
    expect(badgeYearEnd(years, "2026-10-02", otherwise).toISOString()).toBe(
      "2027-07-01T00:00:00.000Z",
    );
  });

  it("gives a badge printed in the summer the year about to start", () => {
    expect(badgeYearEnd(years, "2027-08-15", otherwise).toISOString()).toBe(
      "2028-07-01T00:00:00.000Z",
    );
  });

  it("keeps the sliding term when the school has no year ahead", () => {
    expect(badgeYearEnd(years, "2028-08-01", otherwise)).toBe(otherwise);
  });
});
