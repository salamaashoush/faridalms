import { describe, expect, it } from "vitest";

import type { CycleCalendar } from "./cycle";
import type { Cycle } from "./timetable";

import {
  copiedDays,
  cycleDays,
  cycleDaysOn,
  timetableOn,
  weekdayOfCycleDay,
} from "./cycle";
import { addDays } from "./school";
import { cycleFits, isoWeekday, WEEKLY } from "./timetable";

/** A Sunday-to-Thursday school with Friday and Saturday off, and its marked closures. */
function calendar(closed: readonly string[] = []): CycleCalendar {
  return {
    meaningOf: (day) =>
      [5, 6].includes(isoWeekday(day))
        ? "weekend"
        : closed.includes(day)
          ? "public_holiday"
          : "instructional_day",
    weekStart: 7,
    weekendDays: [5, 6],
  };
}

const span = (from: string, count: number) =>
  Array.from({ length: count }, (_, index) => addDays(from, index));

const cycle = (patch: Partial<Cycle>) => ({
  ...WEEKLY,
  startsOn: "2026-09-06",
  ...patch,
});

describe("the days a planner places lessons on", () => {
  it("numbers an ordinary week by its weekdays", () => {
    expect(cycleDays(WEEKLY, [7, 1, 2, 3, 4])).toEqual([7, 1, 2, 3, 4]);
  });

  it("numbers A/B weeks week by week", () => {
    expect(cycleDays({ kind: "weeks", length: 2 }, [7, 1, 2, 3, 4])).toEqual([
      7, 1, 2, 3, 4, 14, 8, 9, 10, 11,
    ]);
    expect(weekdayOfCycleDay({ kind: "weeks" }, 9)).toBe(2);
  });

  it("numbers a cycle of days from one", () => {
    expect(cycleDays({ kind: "days", length: 6 }, [7, 1, 2, 3, 4])).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(weekdayOfCycleDay({ kind: "days" }, 3)).toBeNull();
  });

  it("keeps a cycle's length and start inside its kind", () => {
    expect(cycleFits({ kind: "weeks", length: 2, firstDay: 2 })).toBe(true);
    expect(cycleFits({ kind: "weeks", length: 5, firstDay: 1 })).toBe(false);
    expect(cycleFits({ kind: "days", length: 1, firstDay: 1 })).toBe(false);
    expect(cycleFits({ kind: "days", length: 6, firstDay: 7 })).toBe(false);
  });
});

describe("the day of the cycle a date falls on", () => {
  it("is the weekday in an ordinary week", () => {
    const days = span("2026-09-06", 7);
    const found = cycleDaysOn(cycle({}), days, calendar());
    expect([...found.values()]).toEqual([7, 1, 2, 3, 4, null, null]);
  });

  it("alternates A and B weeks", () => {
    const found = cycleDaysOn(
      cycle({ length: 2 }),
      ["2026-09-07", "2026-09-14", "2026-09-21"],
      calendar(),
    );
    expect([...found.values()]).toEqual([1, 8, 1]);
  });

  it("starts on the week the timetable names", () => {
    const found = cycleDaysOn(
      cycle({ length: 2, firstDay: 2 }),
      ["2026-09-07", "2026-09-14"],
      calendar(),
    );
    expect([...found.values()]).toEqual([8, 1]);
  });

  it("counts a closed week unless closures move the cycle", () => {
    const holiday = span("2026-09-13", 5);
    const days = ["2026-09-07", "2026-09-21"];
    const kept = cycleDaysOn(cycle({ length: 2 }), days, calendar(holiday));
    expect(kept.get("2026-09-21")).toBe(1);
    const moved = cycleDaysOn(
      cycle({ length: 2, closuresMove: true }),
      days,
      calendar(holiday),
    );
    expect(moved.get("2026-09-21")).toBe(8);
  });

  it("runs a cycle of days over school days only", () => {
    const days = span("2026-09-06", 14);
    const found = cycleDaysOn(
      cycle({ kind: "days", length: 6 }),
      days,
      calendar(),
    );
    expect(
      days.map((day) => found.get(day) ?? null).filter((day) => day !== null),
    ).toEqual([1, 2, 3, 4, 5, 6, 1, 2, 3, 4]);
  });

  it("loses a closed day's place unless closures move the cycle", () => {
    const days = ["2026-09-06", "2026-09-07", "2026-09-08"];
    const closed = calendar(["2026-09-07"]);
    const kept = cycleDaysOn(cycle({ kind: "days", length: 6 }), days, closed);
    expect([...kept.values()]).toEqual([1, null, 3]);
    const moved = cycleDaysOn(
      cycle({ kind: "days", length: 6, closuresMove: true }),
      days,
      closed,
    );
    expect([...moved.values()]).toEqual([1, null, 2]);
  });

  it("runs a date as another weekday, leaving the days around it", () => {
    const runs = {
      ...calendar(),
      runsAsOf: (day: string) => (day === "2026-09-08" ? 7 : null),
    };
    const found = cycleDaysOn(
      cycle({ kind: "weeks", length: 2 }),
      span("2026-09-06", 4),
      runs,
    );
    expect([...found.values()]).toEqual([7, 1, 7, 3]);
    const later = cycleDaysOn(
      cycle({ kind: "weeks", length: 2 }),
      ["2026-09-15"],
      runs,
    );
    expect(later.get("2026-09-15")).toBe(9);
  });

  it("carries a cycle of days on from a day run as another only when closures move it", () => {
    const days = span("2026-09-06", 5);
    const runs = {
      ...calendar(),
      runsAsOf: (day: string) => (day === "2026-09-07" ? 5 : null),
    };
    const kept = cycleDaysOn(cycle({ kind: "days", length: 6 }), days, runs);
    expect([...kept.values()]).toEqual([1, 5, 3, 4, 5]);
    const moved = cycleDaysOn(
      cycle({ kind: "days", length: 6, closuresMove: true }),
      days,
      runs,
    );
    expect([...moved.values()]).toEqual([1, 5, 6, 1, 2]);
    const far = cycleDaysOn(
      cycle({ kind: "days", length: 6, closuresMove: true }),
      ["2026-09-10"],
      runs,
    );
    expect(far.get("2026-09-10")).toBe(2);
  });

  it("ignores a run-as day the cycle does not have, or a closed date", () => {
    const days = ["2026-09-06", "2026-09-07"];
    const runs = {
      ...calendar(["2026-09-07"]),
      runsAsOf: () => 9,
    };
    const found = cycleDaysOn(cycle({ kind: "days", length: 6 }), days, runs);
    expect([...found.values()]).toEqual([1, null]);
  });

  it("reads a date far into the year the same as walking to it", () => {
    const later = cycleDaysOn(
      cycle({ kind: "days", length: 6 }),
      ["2026-10-04"],
      calendar(),
    );
    const walked = cycleDaysOn(
      cycle({ kind: "days", length: 6 }),
      span("2026-09-06", 29),
      calendar(),
    );
    expect(later.get("2026-10-04")).toBe(walked.get("2026-10-04"));
  });
});

describe("which timetable a day follows", () => {
  const rows = [
    { id: "spring", startsOn: "2027-01-10" },
    { id: "autumn", startsOn: "2026-09-06" },
  ];

  it("is the last to start on or before it", () => {
    expect(timetableOn(rows, "2026-12-31")?.id).toBe("autumn");
    expect(timetableOn(rows, "2027-01-10")?.id).toBe("spring");
  });

  it("is the first for a day before every start", () => {
    expect(timetableOn(rows, "2026-09-01")?.id).toBe("autumn");
    expect(timetableOn([], "2026-09-01")).toBeNull();
  });
});

describe("copying lessons into another cycle", () => {
  it("repeats an ordinary week into every week of A/B", () => {
    const days = copiedDays(WEEKLY, { kind: "weeks", length: 2 });
    expect(days?.(3)).toEqual([3, 10]);
  });

  it("repeats A/B weeks into four", () => {
    const days = copiedDays(
      { kind: "weeks", length: 2 },
      { kind: "weeks", length: 4 },
    );
    expect(days?.(9)).toEqual([9, 23]);
  });

  it("refuses cycles that do not line up", () => {
    expect(copiedDays({ kind: "weeks", length: 2 }, WEEKLY)).toBeNull();
    expect(copiedDays(WEEKLY, { kind: "days", length: 6 })).toBeNull();
    expect(
      copiedDays({ kind: "days", length: 6 }, { kind: "days", length: 5 }),
    ).toBeNull();
    expect(
      copiedDays({ kind: "days", length: 6 }, { kind: "days", length: 6 })?.(4),
    ).toEqual([4]);
  });
});
