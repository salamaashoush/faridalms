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
import { isoWeekday, SCHOOL_DAY_MEANINGS } from "./school-days";
import { cycleFits, WEEKLY } from "./timetable";

/** A Sunday-to-Thursday school with Friday and Saturday off, and its marked closures. */
function calendar(closed: readonly string[] = []): CycleCalendar {
  return {
    marks: new Map(
      closed
        .filter((day) => ![5, 6].includes(isoWeekday(day)))
        .map((day) => [day, "public_holiday"]),
    ),
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
      runsAs: new Map([["2026-09-08", 7]]),
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
      runsAs: new Map([["2026-09-07", 5]]),
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
      runsAs: new Map([
        ["2026-09-06", 9],
        ["2026-09-07", 9],
      ]),
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

/**
 * The day of the cycle found by walking every day from the timetable's
 * start, as the planner once did, for checking the counted answer against.
 */
const mod = (value: number, by: number) => ((value % by) + by) % by;

function walk(
  timetable: Cycle & { startsOn: string },
  day: string,
  school: CycleCalendar,
): number | null {
  const meaning = (one: string) => school.marks.get(one) ?? null;
  const open = (one: string) => {
    const known = meaning(one);
    return known === null
      ? !school.weekendDays.includes(isoWeekday(one))
      : SCHOOL_DAY_MEANINGS.includes(known);
  };
  const rest = (one: string) =>
    meaning(one) === null && school.weekendDays.includes(isoWeekday(one));
  const weekStart = (one: string) =>
    addDays(one, -mod(isoWeekday(one) - school.weekStart, 7));
  const unit = (one: string) =>
    timetable.kind === "weeks" ? weekStart(one) : one;
  const step = timetable.kind === "weeks" ? 7 : 1;
  const counts = (one: string) =>
    timetable.kind === "weeks"
      ? !timetable.closuresMove || span(one, 7).some((each) => open(each))
      : timetable.closuresMove
        ? open(one)
        : !rest(one);
  const runs = (one: string) => {
    const value = school.runsAs?.get(one) ?? null;
    const last =
      timetable.kind === "days" ? timetable.length : timetable.length * 7;
    return value !== null && open(one) && value >= 1 && value <= last
      ? value
      : null;
  };
  if (!open(day)) return null;
  const own = runs(day);
  if (own !== null) return own;
  const anchor = unit(timetable.startsOn);
  const target = unit(day);
  let seen = 0;
  if (target < anchor) {
    for (let at = target; at < anchor; at = addDays(at, step))
      if (counts(at)) seen -= 1;
  } else
    for (let at = anchor; at < target; at = addDays(at, step)) {
      const restart =
        timetable.kind === "days" && timetable.closuresMove ? runs(at) : null;
      if (restart !== null)
        seen += mod(
          restart - 1 - (timetable.firstDay - 1 + seen),
          timetable.length,
        );
      if (counts(at)) seen += 1;
    }
  if (timetable.kind === "days" && timetable.closuresMove && target >= anchor) {
    const restart = runs(target);
    if (restart !== null)
      seen += mod(
        restart - 1 - (timetable.firstDay - 1 + seen),
        timetable.length,
      );
  }
  const place = mod(timetable.firstDay - 1 + seen, timetable.length);
  return timetable.kind === "weeks" ? place * 7 + isoWeekday(day) : place + 1;
}

describe("counting the cycle without walking the days", () => {
  const closures = [
    ...span("2025-12-21", 12),
    "2026-03-19",
    ...span("2026-09-13", 5),
    "2026-09-24",
    "2027-01-05",
  ];
  const marks = new Map<string, string>([
    ...closures.map((day) => [day, "school_holiday"] as const),
    ["2026-09-25", "make_up_day"],
  ]);
  const runsAs = new Map([
    ["2026-09-08", 3],
    ["2026-10-01", 5],
  ]);
  const school: CycleCalendar = {
    marks,
    runsAs,
    weekStart: 7,
    weekendDays: [5, 6],
  };
  const dates = [
    ...span("2025-08-31", 21),
    ...span("2026-09-01", 60),
    ...span("2027-01-01", 14),
  ];
  const cycles: (Cycle & { startsOn: string })[] = [
    {
      kind: "weeks",
      length: 2,
      firstDay: 2,
      closuresMove: false,
      startsOn: "2026-09-08",
    },
    {
      kind: "weeks",
      length: 3,
      firstDay: 1,
      closuresMove: true,
      startsOn: "2026-09-08",
    },
    {
      kind: "days",
      length: 6,
      firstDay: 4,
      closuresMove: false,
      startsOn: "2026-09-06",
    },
    {
      kind: "days",
      length: 10,
      firstDay: 1,
      closuresMove: true,
      startsOn: "2026-09-06",
    },
  ];

  it("agrees with a walk on every day before, inside and long after the start", () => {
    for (const each of cycles) {
      const found = cycleDaysOn(each, dates, school);
      for (const day of dates)
        expect([each.kind, each.length, day, found.get(day)]).toEqual([
          each.kind,
          each.length,
          day,
          walk(each, day, school),
        ]);
    }
  });

  it("reads a day years after a timetable started from its marks alone", () => {
    const distant = cycleDaysOn(
      { ...WEEKLY, kind: "days", length: 6, startsOn: "2020-01-05" },
      ["2026-09-07"],
      { marks: new Map(), weekStart: 7, weekendDays: [5, 6] },
    );
    expect(distant.get("2026-09-07")).toBe(
      walk(
        { ...WEEKLY, kind: "days", length: 6, startsOn: "2020-01-05" },
        "2026-09-07",
        { marks: new Map(), weekStart: 7, weekendDays: [5, 6] },
      ),
    );
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
