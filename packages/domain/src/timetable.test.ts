import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  changeLessonSchema,
  isoWeekday,
  schoolDays,
  staffAbsenceSchema,
  weekDates,
} from "./timetable";

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

describe("one day's lesson changes", () => {
  const lesson = {
    classId: "01a0e2ff-cf61-7440-862a-a2f67c1c0d11",
    periodId: "01a0e2ff-cf61-7440-862a-a2f67c1c0d12",
    on: "2026-10-05",
  };
  const cover = "01a0e2ff-cf61-7440-862a-a2f67c1c0d13";

  it("takes a cover, a room, or a cancellation alone", () => {
    expect(v.is(changeLessonSchema, { ...lesson, coverId: cover })).toBe(true);
    expect(v.is(changeLessonSchema, { ...lesson, roomId: cover })).toBe(true);
    expect(v.is(changeLessonSchema, { ...lesson, cancelled: true })).toBe(true);
  });

  it("refuses a change that changes nothing, or a cancelled lesson with cover", () => {
    expect(v.is(changeLessonSchema, lesson)).toBe(false);
    expect(
      v.is(changeLessonSchema, { ...lesson, cancelled: true, coverId: cover }),
    ).toBe(false);
  });

  it("refuses an absence that ends before it starts", () => {
    const absence = { userId: cover, reason: "illness" };
    expect(
      v.is(staffAbsenceSchema, {
        ...absence,
        from: "2026-10-05",
        to: "2026-10-05",
      }),
    ).toBe(true);
    expect(
      v.is(staffAbsenceSchema, {
        ...absence,
        from: "2026-10-06",
        to: "2026-10-05",
      }),
    ).toBe(false);
  });
});
