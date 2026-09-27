import * as v from "valibot";
import { describe, expect, it } from "vitest";

import {
  calendarIcs,
  eventIcs,
  materialChange,
  monthWeeks,
  saveEventSchema,
} from "./calendar";
import { plainContent } from "./content-conversion";

describe("month weeks", () => {
  it("starts each week on the school's first day and covers the month", () => {
    const weeks = monthWeeks("2026-10", 7);
    expect(weeks[0]?.[0]).toBe("2026-09-27");
    expect(weeks.at(-1)?.at(-1)).toBe("2026-10-31");
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  it("follows a Monday start", () => {
    expect(monthWeeks("2026-10", 1)[0]?.[0]).toBe("2026-09-28");
  });
});

const event = {
  id: "0192f0a4-7a1c-7b5a-9a2e-2e6f1f2a3b41",
  title: "Parents' evening; hall, main",
  startsOn: "2026-10-29",
  endsOn: "2026-10-29",
  startTime: "17:00",
  endTime: "19:30",
  location: null,
  description: "",
  cancelled: false,
  version: 2,
};

describe("iCalendar", () => {
  it("writes a timed event in UTC from the school's wall clock", () => {
    const file = eventIcs(event, {
      timeZone: "Africa/Cairo",
      stamp: new Date("2026-09-27T08:00:00Z"),
    });
    expect(file).toContain("DTSTART:20261029T140000Z");
    expect(file).toContain("DTEND:20261029T163000Z");
    expect(file).toContain("SUMMARY:Parents' evening\\; hall\\, main");
    expect(file.endsWith("\r\n")).toBe(true);
  });

  it("writes an all-day event as dates, ending the day after", () => {
    const file = eventIcs(
      { ...event, startTime: null, endTime: null, cancelled: true },
      { timeZone: "Africa/Cairo", stamp: new Date() },
    );
    expect(file).toContain("DTSTART;VALUE=DATE:20261029");
    expect(file).toContain("DTEND;VALUE=DATE:20261030");
    expect(file).toContain("STATUS:CANCELLED");
  });

  it("folds long lines at 75 octets", () => {
    const file = eventIcs(
      { ...event, description: "رحلة ".repeat(40) },
      { timeZone: "UTC", stamp: new Date() },
    );
    for (const line of file.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});

describe("a subscribed calendar", () => {
  it("names itself, flags cancelled events in the title and adds closed days as free time", () => {
    const file = calendarIcs({
      name: "Northwind calendar",
      events: [
        event,
        { ...event, id: "e2", cancelled: true, title: "Concert" },
      ],
      days: [{ day: "2026-10-06", title: "Public holiday: Armed Forces Day" }],
      timeZone: "Africa/Cairo",
      stamp: new Date("2026-09-27T08:00:00Z"),
      cancelledLabel: "Cancelled",
      urlOf: (id) => `https://school.example.com/calendar/${id}`,
    });
    expect(file).toContain("X-WR-CALNAME:Northwind calendar");
    expect(file).toContain("SUMMARY:Cancelled: Concert");
    expect(file).toContain("UID:day-2026-10-06@farida-lms");
    expect(file).toContain("TRANSP:TRANSPARENT");
    expect(file.match(/BEGIN:VEVENT/g)).toHaveLength(3);
  });
});

describe("saving an event", () => {
  const input = {
    id: "",
    expectedVersion: 0,
    titleEn: "Match",
    titleAr: "",
    category: "sport",
    startsOn: "2026-10-22",
    endsOn: "2026-10-22",
    allDay: false,
    startTime: "10:00",
    endTime: "09:00",
    location: "",
    provisional: false,
    audiences: [{ scope: "school", classId: "", gradeId: "" }],
    description: plainContent(""),
  };

  it("refuses a timed event that ends before it starts on one day", () => {
    expect(v.safeParse(saveEventSchema, input).success).toBe(false);
  });

  it("needs a title in at least one language", () => {
    const timed = { ...input, endTime: "11:00" };
    expect(v.safeParse(saveEventSchema, timed).success).toBe(true);
    expect(
      v.safeParse(saveEventSchema, { ...timed, titleEn: "", titleAr: "مباراة" })
        .success,
    ).toBe(true);
    expect(
      v.safeParse(saveEventSchema, { ...timed, titleEn: " ", titleAr: "" })
        .success,
    ).toBe(false);
  });

  it("accepts it across two days, and all day without times", () => {
    expect(
      v.safeParse(saveEventSchema, { ...input, endsOn: "2026-10-23" }).success,
    ).toBe(true);
    expect(
      v.safeParse(saveEventSchema, {
        ...input,
        allDay: true,
        startTime: "",
        endTime: "",
      }).success,
    ).toBe(true);
  });
});

describe("material changes", () => {
  const planned = {
    startsOn: "2026-10-20",
    endsOn: "2026-10-20",
    startTime: "09:00",
    endTime: "10:00",
    location: "Room 12",
    audiences: [
      { scope: "class", classId: "a", gradeId: "" },
      { scope: "families", classId: "", gradeId: "" },
    ],
  };

  it("counts a new day, hour, place or audience, in any order of audiences", () => {
    expect(
      materialChange(planned, { ...planned, startsOn: "2026-10-21" }),
    ).toBe(true);
    expect(materialChange(planned, { ...planned, endTime: "11:00" })).toBe(
      true,
    );
    expect(materialChange(planned, { ...planned, location: "Hall" })).toBe(
      true,
    );
    expect(
      materialChange(planned, {
        ...planned,
        audiences: [{ scope: "school", classId: "", gradeId: "" }],
      }),
    ).toBe(true);
    expect(
      materialChange(planned, {
        ...planned,
        audiences: planned.audiences.toReversed(),
      }),
    ).toBe(false);
  });
});
