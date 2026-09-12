import { describe, expect, it } from "vitest";

import {
  addDays,
  ageOn,
  datesInRange,
  daysBetween,
  monthGrid,
  shiftMonth,
  weekdayOf,
} from "./school";

describe("ageOn", () => {
  it("returns null when no birthdate is recorded", () => {
    // The legacy portal rendered "years, months" with the numbers missing.
    // Returning null is what lets the UI say "not recorded" instead.
    expect(ageOn(null, "2026-09-14")).toBeNull();
  });

  it("counts whole years and the months since the last birthday", () => {
    expect(ageOn("2019-11-02", "2026-09-14")).toEqual({ years: 6, months: 10 });
    expect(ageOn("2023-04-18", "2026-09-14")).toEqual({ years: 3, months: 4 });
  });

  it("does not credit a birthday that has not arrived this month", () => {
    expect(ageOn("2020-03-20", "2026-03-19")).toEqual({ years: 5, months: 11 });
    expect(ageOn("2020-03-20", "2026-03-20")).toEqual({ years: 6, months: 0 });
  });

  it("is exactly zero on the day itself", () => {
    expect(ageOn("2026-09-14", "2026-09-14")).toEqual({ years: 0, months: 0 });
  });

  it("returns null for a future birthdate rather than a negative age", () => {
    expect(ageOn("2027-01-01", "2026-09-14")).toBeNull();
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-09-28", 5)).toBe("2026-10-03");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("daysBetween", () => {
  it("counts inclusively, so one day is one", () => {
    expect(daysBetween("2026-09-14", "2026-09-14")).toBe(1);
    expect(daysBetween("2027-03-20", "2027-03-23")).toBe(4);
  });
});

describe("datesInRange", () => {
  it("lists every day a multi-day event spans", () => {
    // Eid al-Fitr runs 20 to 23 March in the seeded calendar, and the month
    // grid has to paint a chip on all four days.
    expect(datesInRange("2027-03-20", "2027-03-23")).toEqual([
      "2027-03-20",
      "2027-03-21",
      "2027-03-22",
      "2027-03-23",
    ]);
  });

  it("returns the single day for a one-day range", () => {
    expect(datesInRange("2026-09-10", "2026-09-10")).toEqual(["2026-09-10"]);
  });

  it("returns nothing when the range is inverted", () => {
    expect(datesInRange("2026-09-10", "2026-09-01")).toEqual([]);
  });
});

describe("monthGrid", () => {
  it("pads to whole weeks starting Sunday", () => {
    const weeks = monthGrid("2026-09");
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    // 1 September 2026 is a Tuesday, so two leading blanks.
    expect(weeks[0]?.slice(0, 3)).toEqual([null, null, "2026-09-01"]);
  });

  it("covers every day of the month exactly once", () => {
    const days = monthGrid("2026-09").flat().filter(Boolean);
    expect(days).toHaveLength(30);
    expect(new Set(days).size).toBe(30);
    expect(days.at(-1)).toBe("2026-09-30");
  });

  it("uses null for padding rather than a neighbouring month's date", () => {
    // Attaching an event to a padding cell would file it under the wrong month.
    const trailing =
      monthGrid("2026-09")
        .at(-1)
        ?.filter((cell) => cell !== null) ?? [];
    expect(trailing.every((cell) => cell.startsWith("2026-09"))).toBe(true);
  });

  it("handles February in a leap year", () => {
    expect(monthGrid("2028-02").flat().filter(Boolean)).toHaveLength(29);
  });
});

describe("shiftMonth", () => {
  it("wraps the year in both directions", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-09", 0)).toBe("2026-09");
  });
});

describe("weekdayOf", () => {
  it("treats Sunday as zero, matching the school week", () => {
    expect(weekdayOf("2026-09-13")).toBe(0);
    expect(weekdayOf("2026-09-17")).toBe(4);
    expect(weekdayOf("2026-09-18")).toBe(5);
  });
});
