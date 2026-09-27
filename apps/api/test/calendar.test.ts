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
    const listed = async () =>
      (await family.calendar.range(october)).events.some(
        (row) => row.id === saved.id,
      );
    expect(await listed()).toBe(false);
    expect(
      await rejection(family.calendar.event({ id: saved.id })),
    ).toMatchObject({ code: "NOT_FOUND" });

    const before = (await family.notifications.list({ tab: "all" })).total;
    const out = await office.calendar.publish({
      id: saved.id,
      expectedVersion: saved.version,
      notify: true,
    });
    expect(out.told).toBeGreaterThan(0);
    expect(await listed()).toBe(true);
    const notices = await family.notifications.list({ tab: "all" });
    expect(notices.total).toBe(before + 1);
    expect(notices.rows[0]).toMatchObject({
      kind: "event",
      params: { title: "Book fair briefing" },
    });

    expect(
      await rejection(
        office.calendar.remove({ id: saved.id, expectedVersion: out.version }),
      ),
    ).toMatchObject({ message: "calendar.cancel_first" });
    const off = await office.calendar.cancel({
      id: saved.id,
      expectedVersion: out.version,
      cancelled: true,
    });
    expect(
      (await family.notifications.list({ tab: "all" })).rows[0],
    ).toMatchObject({
      kind: "event",
      params: { cancelled: true },
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

  test("only those who manage the calendar address the school, its families or other classes", async () => {
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    expect(
      await rejection(teacher.api.calendar.save(event("Not mine"))),
    ).toMatchObject({ code: "FORBIDDEN" });

    const { classes } = await teacher.api.calendar.options();
    const own = classes[0];
    if (!own) throw new Error("the seeded teacher has no class");
    const office = await principal();
    const all = (await office.calendar.options()).classes;
    const other = all.find(
      (row) => !classes.some((mine) => mine.id === row.id),
    );
    if (!other) throw new Error("the seed has no class the teacher lacks");
    expect(
      await rejection(
        teacher.api.calendar.save({
          ...event("Their trip"),
          audiences: [{ scope: "class", classId: other.id, gradeId: "" }],
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });

  test("a teacher puts a test on their class's calendar and can change only their own", async () => {
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    const { classes, grades } = await teacher.api.calendar.options();
    expect(grades).toEqual([]);
    const own = classes[0];
    if (!own) throw new Error("the seeded teacher has no class");
    const saved = await teacher.api.calendar.save({
      ...event("Unit test: fractions"),
      category: "exam",
      audiences: [{ scope: "class", classId: own.id, gradeId: "" }],
    });
    const draft = await teacher.api.calendar.event({ id: saved.id });
    expect(draft).toMatchObject({ state: "draft", canEdit: true });
    await teacher.api.calendar.publish({
      id: saved.id,
      expectedVersion: saved.version,
      notify: false,
    });

    const other = await sessionFor("northwind", login("teacher", 0, 2));
    const seen = await rejection(
      other.api.calendar.cancel({
        id: saved.id,
        expectedVersion: 2,
        cancelled: true,
      }),
    );
    expect(seen).toMatchObject({ code: "FORBIDDEN" });
  });
});
