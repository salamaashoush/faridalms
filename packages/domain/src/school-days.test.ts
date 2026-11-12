import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  dayOpen,
  dayRests,
  isoWeekday,
  paintDaysSchema,
  paintReaches,
  schoolDayCount,
  schoolDays,
  weekDates,
} from "./school-days";

const school = { weekStart: 7, weekendDays: [5, 6] };

describe("school days", () => {
  it("runs from the first day of the week and skips the weekend", () => {
    expect(schoolDays(7, [5, 6])).toEqual([7, 1, 2, 3, 4]);
    expect(schoolDays(1, [6, 7])).toEqual([1, 2, 3, 4, 5]);
  });

  it("reads Sunday as the seventh ISO day", () => {
    expect(isoWeekday("2026-09-27")).toBe(7);
    expect(isoWeekday("2026-09-28")).toBe(1);
  });
});

describe("week dates", () => {
  it("dates a Sunday to Thursday week from any day in it", () => {
    const days = schoolDays(7, [5, 6]);
    const week = [
      { day: 7, date: "2026-10-04" },
      { day: 1, date: "2026-10-05" },
      { day: 2, date: "2026-10-06" },
      { day: 3, date: "2026-10-07" },
      { day: 4, date: "2026-10-08" },
    ];
    expect(weekDates("2026-10-04", 7, days)).toEqual(week);
    expect(weekDates("2026-10-07", 7, days)).toEqual(week);
    expect(weekDates("2026-10-10", 7, days)).toEqual(week);
  });

  it("dates a Monday to Friday week", () => {
    expect(weekDates("2026-10-04", 1, schoolDays(1, [6, 7]))).toEqual([
      { day: 1, date: "2026-09-28" },
      { day: 2, date: "2026-09-29" },
      { day: 3, date: "2026-09-30" },
      { day: 4, date: "2026-10-01" },
      { day: 5, date: "2026-10-02" },
    ]);
  });
});

describe("whether a day holds lessons", () => {
  it("follows the week where the school marked nothing", () => {
    expect(dayOpen(school, "2026-10-04", null)).toBe(true);
    expect(dayOpen(school, "2026-10-09", null)).toBe(false);
    expect(dayRests(school, "2026-10-09", null)).toBe(true);
  });

  it("follows the mark where there is one, on a weekday or a weekend", () => {
    expect(dayOpen(school, "2026-10-05", "public_holiday")).toBe(false);
    expect(dayOpen(school, "2026-10-05", "exam_day")).toBe(true);
    expect(dayOpen(school, "2026-10-09", "make_up_day")).toBe(true);
    expect(dayRests(school, "2026-10-09", "make_up_day")).toBe(false);
  });

  it("counts the school days of a span from the week and the marks", () => {
    const marks = new Map([
      ["2026-10-05", "public_holiday"],
      ["2026-10-09", "make_up_day"],
    ]);
    expect(
      schoolDayCount(
        school,
        { from: "2026-10-04", endsBefore: "2026-10-18" },
        (day) => marks.get(day) ?? null,
      ),
    ).toBe(10);
  });
});

describe("marking a range of days", () => {
  it("leaves an unmarked weekend alone unless it becomes a make-up day", () => {
    expect(paintReaches(school, "public_holiday", "2026-10-09", null)).toBe(
      false,
    );
    expect(paintReaches(school, "make_up_day", "2026-10-09", null)).toBe(true);
    expect(
      paintReaches(school, "public_holiday", "2026-10-09", "make_up_day"),
    ).toBe(true);
    expect(paintReaches(school, "school_holiday", "2026-10-05", null)).toBe(
      true,
    );
  });

  it("puts back only the days that were marked", () => {
    expect(paintReaches(school, "normal", "2026-10-05", null)).toBe(false);
    expect(paintReaches(school, "normal", "2026-10-05", "exam_day")).toBe(true);
  });

  it("marks up to a year of days at once, in order", () => {
    const base = {
      kind: "school_holiday",
      noteEn: "",
      noteAr: "",
      provisional: false,
    };
    expect(
      v.is(paintDaysSchema, { ...base, from: "2026-09-01", to: "2027-08-31" }),
    ).toBe(true);
    expect(
      v.is(paintDaysSchema, { ...base, from: "2026-09-01", to: "2027-09-01" }),
    ).toBe(false);
    expect(
      v.is(paintDaysSchema, { ...base, from: "2026-09-02", to: "2026-09-01" }),
    ).toBe(false);
  });
});
