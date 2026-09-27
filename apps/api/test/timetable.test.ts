import { describe, expect, test } from "bun:test";

import { login, rejection, sessionFor, signedIn } from "./harness";

const principal = () => signedIn("northwind", login("principal"));

// A Sunday well inside the seeded year and after today, so a change from it
// leaves the weeks other suites read untouched.
const FROM = "2026-11-01";
const SUNDAY = 7;

type Api = Awaited<ReturnType<typeof principal>>;

async function gridOf(api: Api, title: string, on = FROM) {
  const { grids } = await api.timetable.options();
  const owner = grids.find((row) => row.titleEn === title);
  if (!owner) throw new Error(`the seed has no ${title}`);
  return api.timetable.grid({ classId: owner.id, on });
}

describe("planning the timetable", () => {
  test("a homeroom's week holds its subject classes in every lesson period", async () => {
    const api = await principal();
    const grid = await gridOf(api, "8A");
    expect(grid.classes.length).toBe(4);
    expect(grid.meetings.length).toBe(grid.days.length * grid.periods.length);
    expect(grid.days[0]).toBe(SUNDAY);
    expect(grid.meetings.every((row) => !row.clashing)).toBe(true);
  });

  test("a change from a day leaves the days before as they were", async () => {
    const api = await principal();
    const grid = await gridOf(api, "8A");
    const period = grid.periods.at(-1);
    if (!period) throw new Error("the seed has no periods");
    const current = grid.meetings.find(
      (row) => row.weekday === SUNDAY && row.periodId === period.id,
    );
    const other = grid.classes.find((row) => row.id !== current?.classId);
    if (!current || !other) throw new Error("the grid is empty");
    const teacher = other.teachers[0]?.userId ?? "";
    const check = await api.timetable.check({
      classId: grid.class.id,
      weekday: SUNDAY,
      periodId: period.id,
      from: FROM,
      teacherId: teacher,
      roomId: current.roomId ?? "",
    });
    await api.timetable.place({
      classId: grid.class.id,
      weekday: SUNDAY,
      periodId: period.id,
      from: FROM,
      meetingClassId: other.id,
      teacherId: teacher,
      roomId: current.roomId ?? "",
      resolve: check.bookings.length ? "keep" : "ask",
    });
    const after = await gridOf(api, "8A");
    expect(
      after.meetings.find(
        (row) => row.weekday === SUNDAY && row.periodId === period.id,
      )?.classId,
    ).toBe(other.id);
    const before = await gridOf(api, "8A", "2026-10-29");
    expect(
      before.meetings.find(
        (row) => row.weekday === SUNDAY && row.periodId === period.id,
      )?.classId,
    ).toBe(current.classId);

    await api.timetable.clear({
      classId: grid.class.id,
      weekday: SUNDAY,
      periodId: period.id,
      from: FROM,
    });
    const cleared = await gridOf(api, "8A");
    expect(
      cleared.meetings.some(
        (row) => row.weekday === SUNDAY && row.periodId === period.id,
      ),
    ).toBe(false);
  });

  test("a teacher booked elsewhere asks first, then moves or stays flagged", async () => {
    const api = await principal();
    const eight = await gridOf(api, "8A");
    const seven = await gridOf(api, "7A");
    const period = eight.periods[0];
    if (!period) throw new Error("the seed has no periods");
    const booked = eight.meetings.find(
      (row) => row.weekday === SUNDAY && row.periodId === period.id,
    );
    if (!booked?.teacherId) throw new Error("the cell has no teacher");
    const sevenClass = seven.classes[0];
    if (!sevenClass) throw new Error("7A has no classes");
    const cell = {
      classId: seven.class.id,
      weekday: SUNDAY,
      periodId: period.id,
      from: FROM,
      meetingClassId: sevenClass.id,
      teacherId: booked.teacherId,
      roomId: "",
    };
    const { bookings } = await api.timetable.check(cell);
    expect(bookings.map((row) => row.id)).toContain(booked.id);
    expect(
      await rejection(api.timetable.place({ ...cell, resolve: "ask" })),
    ).toMatchObject({ code: "CONFLICT", message: "timetable.busy" });

    await api.timetable.place({ ...cell, resolve: "keep" });
    const { rows } = await api.timetable.clashes({ on: FROM });
    expect(
      rows.some(
        (row) => row.groupClassId === seven.class.id && row.clashAccepted,
      ),
    ).toBe(true);

    await api.timetable.place({ ...cell, resolve: "move" });
    const moved = await gridOf(api, "8A");
    expect(moved.meetings.some((row) => row.id === booked.id)).toBe(false);
    const earlier = await gridOf(api, "8A", "2026-10-29");
    expect(earlier.meetings.some((row) => row.id === booked.id)).toBe(true);
  });
});

describe("reading weeks", () => {
  test("teachers, students and families read the week that concerns them", async () => {
    const teacher = await sessionFor("northwind", login("teacher", 0, 1));
    const mine = await teacher.api.timetable.teacherWeek({});
    const lessons = mine.week?.meetings ?? [];
    expect(lessons.length).toBeGreaterThan(0);
    expect(
      lessons.every((row) => row.teacherId === lessons[0]?.teacherId),
    ).toBe(true);
    expect(await rejection(teacher.api.timetable.options())).toMatchObject({
      code: "FORBIDDEN",
    });

    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const own = await student.api.timetable.studentWeek({});
    expect(own.week?.meetings.length).toBeGreaterThan(0);
    const parent = await signedIn(
      "northwind",
      login("student").replace("student", "parent"),
    );
    const child = await parent.timetable.studentWeek({ studentId: me.id });
    expect(child.week?.meetings.length).toBe(own.week?.meetings.length);
  });
});
