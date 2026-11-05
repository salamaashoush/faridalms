import { describe, expect, it } from "vitest";

import {
  agingBucket,
  clockDays,
  dunningStep,
  showsOverdue,
  standingAt,
  weekendNow,
} from "./dunning";

const invoice = {
  dueOn: "2026-10-01",
  totalMinor: 100_000,
  owedMinor: 100_000,
};

const on = (today: string) => dunningStep(invoice, [], today);

describe("the clock of an unpaid invoice", () => {
  it("steps from a week before it is due to the contract's end", () => {
    expect(on("2026-09-23")).toBeNull();
    expect(on("2026-09-24")).toBe("upcoming");
    expect(on("2026-10-01")).toBe("due");
    expect(on("2026-10-08")).toBe("overdue_7");
    expect(on("2026-10-15")).toBe("overdue_14");
    expect(on("2026-10-22")).toBe("restrict_notice");
    expect(on("2026-10-30")).toBe("restrict_notice");
    expect(on("2026-10-31")).toBe("restricted");
    expect(on("2026-11-15")).toBe("read_only_notice");
    expect(on("2026-11-30")).toBe("read_only");
    expect(on("2026-12-15")).toBe("suspend_notice");
    expect(on("2026-12-30")).toBe("suspended");
    expect(on("2027-01-29")).toBe("ended");
  });

  it("stops while the customer's clock is paused, and counts each day once", () => {
    const pauses = [
      { startsOn: "2026-10-10", endsOn: "2026-10-19" },
      { startsOn: "2026-10-15", endsOn: "2026-10-24" },
      // Before it fell due, a pause takes nothing off.
      { startsOn: "2026-09-01", endsOn: "2026-09-30" },
    ];
    expect(clockDays(invoice, pauses, "2026-10-31")).toBe(30 - 15);
    expect(dunningStep(invoice, pauses, "2026-10-31")).toBe("overdue_14");
    expect(dunningStep(invoice, pauses, "2026-11-15")).toBe("restricted");
    // A pause still running counts only the days up to today.
    expect(
      clockDays(
        invoice,
        [{ startsOn: "2026-10-20", endsOn: "2026-12-31" }],
        "2026-10-25",
      ),
    ).toBe(24 - 6);
  });

  it("moves back one step once half is paid, and stops when all is", () => {
    const half = { ...invoice, owedMinor: 50_000 };
    expect(dunningStep(half, [], "2026-10-31")).toBe("restrict_notice");
    expect(dunningStep(half, [], "2026-10-08")).toBe("due");
    expect(dunningStep(half, [], "2026-10-15")).toBe("overdue_7");
    expect(
      dunningStep({ ...invoice, owedMinor: 50_001 }, [], "2026-10-31"),
    ).toBe("restricted");
    expect(
      dunningStep({ ...invoice, owedMinor: 0 }, [], "2026-12-30"),
    ).toBeNull();
  });

  it("leaves a school as it was until the change, then as the change left it", () => {
    expect(standingAt(null)).toBe("full");
    expect(standingAt("restrict_notice")).toBe("full");
    expect(standingAt("restricted")).toBe("restricted");
    expect(standingAt("read_only_notice")).toBe("restricted");
    expect(standingAt("read_only")).toBe("read_only");
    expect(standingAt("suspended")).toBe("suspended");
    expect(standingAt("ended")).toBe("suspended");
    expect(showsOverdue("overdue_7")).toBe(false);
    expect(showsOverdue("overdue_14")).toBe(true);
  });
});

describe("a tenant's weekend", () => {
  const cairo = { timeZone: "Africa/Cairo", weekendDays: [5, 6] };
  const dubai = { timeZone: "Asia/Dubai", weekendDays: [6, 7] };
  // Friday 6 November 2026, 22:30 UTC: already Saturday in Dubai.
  const fridayNight = new Date("2026-11-06T22:30:00Z");

  it("is when every school is between school days, each in its own time zone", () => {
    expect(weekendNow([cairo], new Date("2026-11-06T08:00:00Z"))).toBe(true);
    expect(weekendNow([cairo], new Date("2026-11-05T08:00:00Z"))).toBe(false);
    expect(weekendNow([cairo, dubai], new Date("2026-11-06T08:00:00Z"))).toBe(
      false,
    );
    expect(weekendNow([cairo, dubai], fridayNight)).toBe(true);
    expect(weekendNow([], fridayNight)).toBe(true);
  });

  it("is any school's own weekend when the schools share no weekday", () => {
    const sundayOff = { timeZone: "Africa/Cairo", weekendDays: [7, 1] };
    expect(
      weekendNow([cairo, sundayOff], new Date("2026-11-06T08:00:00Z")),
    ).toBe(true);
    expect(
      weekendNow([cairo, sundayOff], new Date("2026-11-04T08:00:00Z")),
    ).toBe(false);
  });
});

describe("aging", () => {
  it("puts an amount in the band of how long it has been overdue", () => {
    expect(agingBucket(-3)).toBe("current");
    expect(agingBucket(0)).toBe("current");
    expect(agingBucket(1)).toBe("days_1_30");
    expect(agingBucket(30)).toBe("days_1_30");
    expect(agingBucket(31)).toBe("days_31_60");
    expect(agingBucket(90)).toBe("days_61_90");
    expect(agingBucket(91)).toBe("over_90");
  });
});
