import {
  plainContent,
  withFileBlocks,
} from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";

import { login, raw, rejection, seeded, sessionFor, signedIn } from "./harness";

const principal = () => signedIn("northwind", login("principal"));
const mother = () =>
  signedIn("northwind", login("student").replace("student", "parent"));
const october = { from: "2026-09-27", to: "2026-10-31", child: "" };
// A week ahead, so an event added here is still to come whenever this runs.
const ahead = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

const event = (title: string) => ({
  id: "",
  expectedVersion: 0,
  titleEn: title,
  titleAr: "",
  category: "meeting" as const,
  startsOn: ahead,
  endsOn: ahead,
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
    const titles = events.map((row) => row.titleEn);
    expect(canManage).toBe(false);
    expect(titles).toContain("Parents' evening");
    expect(titles).toContain("Museum trip");
    expect(titles).not.toContain("Staff meeting");
    expect(
      events.find((row) => row.titleEn === "Autumn concert")?.cancelled,
    ).toBe(true);
    expect(
      events.find((row) => row.titleEn === "Football against Nile School"),
    ).toMatchObject({ provisional: true, startTime: null });
    expect(days.find((row) => row.day === "2026-10-06")?.noteEn).toBe(
      "Armed Forces Day",
    );

    const trip = events.find((row) => row.titleEn === "Museum trip");
    if (!trip) throw new Error("the seed has no trip");
    const opened = await family.calendar.event({ id: trip.id });
    expect(opened.startTime).toBe("08:30");
    expect(opened.audiences).toEqual([]);
  });

  test("a family narrows the calendar to one child, and only to their own", async () => {
    const family = await mother();
    const { children, events } = await family.calendar.range(october);
    const child = children[0];
    if (!child) throw new Error("the seeded family has no child");
    const theirs = await family.calendar.range({ ...october, child: child.id });
    const ids = new Set(events.map((row) => row.id));
    expect(theirs.events.length).toBeGreaterThan(0);
    expect(theirs.events.every((row) => ids.has(row.id))).toBe(true);

    const office = await principal();
    const me = await office.identity.currentUser();
    expect(
      await rejection(family.calendar.range({ ...october, child: me.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
  });

  test("a class's event stays with that class, and staff see their meeting", async () => {
    const office = await principal();
    const trip = (await office.calendar.range(october)).events.find(
      (row) => row.titleEn === "Museum trip",
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
      (await teacher.calendar.range(october)).events.map((row) => row.titleEn),
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
      (
        await family.calendar.range({ from: ahead, to: ahead, child: "" })
      ).events.some((row) => row.id === saved.id);
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

describe("calendar links", () => {
  test("a family's private link carries its events and closed days in their language, and a new link stops the old", async () => {
    const family = await mother();
    // Other suites change this family's language; the feed follows it.
    const before = await family.notifications.preferences();
    await family.notifications.savePreferences({ ...before, locale: "en" });
    expect(await family.calendar.feed()).toBeNull();
    const made = await family.calendar.resetFeed();
    const fetchFeed = (token: string) =>
      seeded().handler(
        new Request(`http://api.test/feeds/${made.school}/${token}.ics`),
      );
    const response = await fetchFeed(made.token);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/calendar");
    const body = await response.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("Museum trip");
    expect(body).not.toContain("Staff meeting");
    expect(body).toContain("Armed Forces Day");
    expect((await family.calendar.feed())?.lastFetchedAt).not.toBeNull();

    await family.notifications.savePreferences({ ...before, locale: "ar" });
    const arabic = await (await fetchFeed(made.token)).text();
    expect(arabic).toContain("رحلة المتحف");
    expect(arabic).toContain("عيد القوات المسلحة");
    await family.notifications.savePreferences(before);

    const again = await family.calendar.resetFeed();
    expect((await fetchFeed(made.token)).status).toBe(404);
    expect((await fetchFeed(again.token)).status).toBe(200);
    expect((await fetchFeed("x".repeat(43))).status).toBe(404);
  });

  test("a student's link carries their lessons as timed entries", async () => {
    const student = await sessionFor("northwind", login("student"));
    const made = await student.api.calendar.resetFeed();
    const response = await seeded().handler(
      new Request(`http://api.test/feeds/${made.school}/${made.token}.ics`),
    );
    // Long lines fold at 75 octets; unfolded, each entry reads whole.
    const body = (await response.text()).replaceAll("\r\n ", "");
    const { week } = await student.api.timetable.studentWeek({});
    const lesson = week?.meetings[0];
    if (!lesson) throw new Error("the seeded student has no lessons");
    expect(body).toContain(`UID:lesson-${lesson.classId}-`);
    expect(body).toMatch(
      /BEGIN:VEVENT\r\nUID:lesson-[^\r]+\r\nDTSTAMP:\d{8}T\d{6}Z\r\nSEQUENCE:\d+\r\nDTSTART:\d{8}T\d{6}Z/,
    );
  });
});

describe("a second calendar", () => {
  test("a school keeps Hijri dates beside Gregorian and everyone signed in learns which", async () => {
    const office = await signedIn("acme", login("principal", 1));
    const profile = await office.school.profile();
    const save = (
      secondaryCalendar: "" | "islamic-umalqura",
      version: number,
    ) =>
      office.school.saveProfile({
        expectedVersion: version,
        nameEn: profile.nameEn ?? "",
        nameAr: profile.nameAr ?? "",
        identifier: profile.identifier ?? "",
        timeZone: profile.timeZone ?? "Africa/Cairo",
        defaultLocale: profile.defaultLocale,
        weekStart: profile.weekStart,
        weekendDays: profile.weekendDays,
        secondaryCalendar,
        phone: profile.phone ?? "",
        email: profile.email ?? "",
      });
    const saved = await save("islamic-umalqura", profile.version);
    expect((await office.identity.currentUser()).school.secondaryCalendar).toBe(
      "islamic-umalqura",
    );
    await save("", saved.version);
    expect(
      (await office.identity.currentUser()).school.secondaryCalendar,
    ).toBeNull();
  });
});

describe("files in an event", () => {
  test("a message's attachment cannot be put in an event, which other people read", async () => {
    const office = await sessionFor("northwind", login("principal"));
    const body = new TextEncoder().encode("For the conversation only.");
    const file = await office.api.files.initiate({
      purpose: "message_attachment",
      name: "private-note.txt",
      mediaType: "text/plain",
      sizeBytes: body.byteLength,
    });
    const put = await raw(
      "northwind",
      office.token,
      `/v1/files/${file.id}/content`,
      { method: "PUT", body },
    );
    expect(put.status).toBe(200);
    expect(
      await rejection(
        office.api.calendar.save({
          ...event("Parents' evening"),
          description: withFileBlocks(plainContent("Agenda attached."), [file]),
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN", message: "file.not_attachable" });
  });
});
