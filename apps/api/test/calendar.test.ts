import { plainContent } from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";

import { login, rejection, sessionFor, signedIn } from "./harness";

const principal = () => signedIn("northwind", login("principal"));
const mother = () =>
  signedIn("northwind", login("student").replace("student", "parent"));
const october = { from: "2026-09-27", to: "2026-10-31" };

const event = (title: string) => ({
  id: "",
  expectedVersion: 0,
  title,
  category: "meeting" as const,
  startsOn: "2026-10-20",
  endsOn: "2026-10-20",
  allDay: false,
  startTime: "09:00",
  endTime: "10:00",
  location: "Room 12",
  provisional: false,
  audiences: [{ scope: "families" as const, classId: "", gradeId: "" }],
  description: plainContent(`${title} agenda.`),
});

describe("reading the calendar", () => {
  test("a family sees what is for them and the school's holidays, not staff meetings", async () => {
    const family = await mother();
    const { events, days, canManage } = await family.calendar.range(october);
    const titles = events.map((row) => row.title);
    expect(canManage).toBe(false);
    expect(titles).toContain("Parents' evening");
    expect(titles).toContain("Museum trip");
    expect(titles).not.toContain("Staff meeting");
    expect(
      events.find((row) => row.title === "Autumn concert")?.cancelled,
    ).toBe(true);
    expect(
      events.find((row) => row.title === "Football against Nile School"),
    ).toMatchObject({ provisional: true, startTime: null });
    expect(days.find((row) => row.day === "2026-10-06")?.noteEn).toBe(
      "Armed Forces Day",
    );

    const trip = events.find((row) => row.title === "Museum trip");
    if (!trip) throw new Error("the seed has no trip");
    const opened = await family.calendar.event({ id: trip.id });
    expect(opened.startTime).toBe("08:30");
    expect(opened.audiences).toEqual([]);
  });

  test("a class's event stays with that class, and staff see their meeting", async () => {
    const office = await principal();
    const trip = (await office.calendar.range(october)).events.find(
      (row) => row.title === "Museum trip",
    );
    if (!trip) throw new Error("the seed has no trip");
    const outsider = await signedIn("northwind", login("parent", 0, 0));
    if (
      !(await outsider.calendar.range(october)).events.some(
        (row) => row.id === trip.id,
      )
    )
      expect(
        await rejection(outsider.calendar.event({ id: trip.id })),
      ).toMatchObject({ code: "NOT_FOUND" });
    const teacher = await signedIn("northwind", login("teacher", 0, 1));
    expect(
      (await teacher.calendar.range(october)).events.map((row) => row.title),
    ).toContain("Staff meeting");
  });
});

describe("keeping the calendar", () => {
  test("the office adds an event, calls it off and removes it", async () => {
    const office = await principal();
    expect(
      await rejection(
        office.calendar.save({
          ...event("Backwards"),
          startTime: "11:00",
          endTime: "10:00",
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });

    const saved = await office.calendar.save(event("Book fair briefing"));
    const family = await mother();
    expect(
      (await family.calendar.range(october)).events.some(
        (row) => row.id === saved.id,
      ),
    ).toBe(true);

    const off = await office.calendar.cancel({
      id: saved.id,
      expectedVersion: saved.version,
      cancelled: true,
    });
    expect((await family.calendar.event({ id: saved.id })).cancelled).toBe(
      true,
    );

    await office.calendar.remove({
      id: saved.id,
      expectedVersion: off.version,
    });
    expect(
      await rejection(family.calendar.event({ id: saved.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
  });

  test("only those who manage the calendar change it", async () => {
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    expect(
      await rejection(teacher.api.calendar.save(event("Not mine"))),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});
