import { describe, expect, it } from "vitest";

import { addDays, teachingWeeks, weekdayOf } from "./school";

describe("teachingWeeks", () => {
  it("covers a year with Sunday-to-Saturday weeks and no gaps", () => {
    const weeks = teachingWeeks("2026-09-01", "2027-06-30");
    expect(weeks[0]).toEqual({
      number: 1,
      startsOn: "2026-09-01",
      endsOn: "2026-09-05",
    });
    expect(weeks[1]).toEqual({
      number: 2,
      startsOn: "2026-09-06",
      endsOn: "2026-09-12",
    });
    expect(weeks.at(-1)?.endsOn).toBe("2027-06-30");
    expect(
      weeks.slice(1).filter((week) => weekdayOf(week.startsOn) !== 0),
    ).toEqual([]);
    expect(
      weeks
        .slice(1)
        .filter(
          (week, index) =>
            week.startsOn !== addDays(weeks[index]?.endsOn ?? "", 1),
        ),
    ).toEqual([]);
  });

  it("gives a single day one week and continues numbering when extending", () => {
    expect(teachingWeeks("2026-09-18", "2026-09-18")).toEqual([
      { number: 1, startsOn: "2026-09-18", endsOn: "2026-09-18" },
    ]);
    expect(teachingWeeks("2027-07-01", "2027-07-10", 44)).toEqual([
      { number: 44, startsOn: "2027-07-01", endsOn: "2027-07-03" },
      { number: 45, startsOn: "2027-07-04", endsOn: "2027-07-10" },
    ]);
  });
});
