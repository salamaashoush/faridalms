import { describe, expect, test } from "bun:test";

import { login, rejection, signedIn } from "./harness";

const principal = () => signedIn("northwind", login("principal"));

type Api = Awaited<ReturnType<typeof principal>>;

// Two school weeks near the end of the seeded year that no other suite
// reads, Sunday to Thursday; every test puts back what it changes.
const WEEK_A = "2027-05-23";
const WEEK_B = "2027-05-30";
const SUNDAY = 7;

async function homeroom(api: Api, title = "8A") {
  const options = await api.timetable.options();
  const owner = options.grids.find((row) => row.titleEn === title);
  if (!owner || !options.year) throw new Error(`the seed has no ${title}`);
  return { classId: owner.id, yearId: options.year.id };
}

async function weekOf(api: Api, classId: string, on: string) {
  return (await api.timetable.classWeek({ classId, on })).week;
}

const lessonsOn = (
  week: Awaited<ReturnType<typeof weekOf>>,
  date: string,
  periodId?: string,
) =>
  week.meetings.filter(
    (row) => row.on === date && (!periodId || row.periodId === periodId),
  );

describe("timetables from a date", () => {
  test("A/B weeks start with the lessons before them and keep earlier weeks", async () => {
    const api = await principal();
    const { classId, yearId } = await homeroom(api);
    const before = await weekOf(api, classId, WEEK_A);
    const created = await api.timetable.saveTimetable({
      yearId,
      nameEn: "Summer",
      nameAr: "الصيف",
      startsOn: WEEK_A,
      kind: "weeks",
      length: 2,
      firstDay: 1,
      closuresMove: false,
      start: "copy",
    });
    expect(created.copied).toBeGreaterThan(0);

    const { timetables } = await api.timetable.timetables({ yearId });
    expect(timetables.map((row) => row.from).at(-1)).toBe(WEEK_A);
    expect(timetables.at(-2)?.until).toBe(WEEK_A);

    const grid = await api.timetable.grid({ classId, on: WEEK_A });
    expect(grid.timetable?.id).toBe(created.id);
    expect(grid.days).toEqual([7, 1, 2, 3, 4, 14, 8, 9, 10, 11]);
    const earlier = await api.timetable.grid({ classId, on: "2027-05-20" });
    expect(earlier.days).toEqual([7, 1, 2, 3, 4]);
    expect(grid.meetings.length).toBe(earlier.meetings.length * 2);

    const period = grid.periods[0];
    const sunday = grid.meetings.find(
      (row) => row.weekday === SUNDAY && row.periodId === period?.id,
    );
    const other = grid.classes.find((row) => row.id !== sunday?.classId);
    if (!period || !sunday || !other) throw new Error("the grid is empty");
    await api.timetable.place({
      classId,
      weekday: 14,
      periodId: period.id,
      from: WEEK_A,
      meetingClassId: other.id,
      teacherId: "",
      roomId: "",
      resolve: "keep",
    });

    const a = await weekOf(api, classId, WEEK_A);
    const b = await weekOf(api, classId, WEEK_B);
    expect(a.dates[0]?.cycleDay).toBe(SUNDAY);
    expect(b.dates[0]?.cycleDay).toBe(14);
    expect(lessonsOn(a, WEEK_A, period.id)[0]?.classId).toBe(sunday.classId);
    expect(lessonsOn(b, WEEK_B, period.id)[0]?.classId).toBe(other.id);
    expect(lessonsOn(before, WEEK_A).length).toBe(lessonsOn(a, WEEK_A).length);

    const saved = timetables.at(-1);
    if (!saved) throw new Error("no timetable");
    expect(
      await rejection(
        api.timetable.saveTimetable({
          yearId,
          id: saved.id,
          version: saved.version,
          nameEn: "Summer",
          nameAr: "الصيف",
          startsOn: WEEK_A,
          kind: "weeks",
          length: 4,
          firstDay: 1,
          closuresMove: false,
          start: "copy",
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "timetable.cycle_in_use" });

    await api.timetable.removeTimetable({
      id: saved.id,
      version: saved.version,
    });
    const after = await weekOf(api, classId, WEEK_B);
    expect(after.dates[0]?.cycleDay).toBe(SUNDAY);
    expect(lessonsOn(after, WEEK_B, period.id)[0]?.classId).toBe(
      sunday.classId,
    );
  });

  test("the first timetable stays, and a new one starts from today on", async () => {
    const api = await principal();
    const { yearId } = await homeroom(api);
    const { timetables, today } = await api.timetable.timetables({ yearId });
    const first = timetables[0];
    if (!first) throw new Error("the year has no timetable");
    expect(first.first).toBe(true);
    expect(
      await rejection(
        api.timetable.removeTimetable({ id: first.id, version: first.version }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST", message: "timetable.first_fixed" });
    const yesterday = new Date(`${today}T00:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    expect(
      await rejection(
        api.timetable.saveTimetable({
          yearId,
          nameEn: "Late",
          nameAr: "",
          startsOn: yesterday.toISOString().slice(0, 10),
          kind: "weeks",
          length: 1,
          firstDay: 1,
          closuresMove: false,
          start: "empty",
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
  });

  test("a cycle of days runs over school days, and closures move it when the school says", async () => {
    const api = await principal();
    const { classId, yearId } = await homeroom(api);
    const cycle = {
      yearId,
      nameEn: "Six days",
      nameAr: "ستة أيام",
      startsOn: WEEK_A,
      kind: "days" as const,
      length: 6,
      firstDay: 1,
      closuresMove: false,
    };
    expect(
      await rejection(api.timetable.saveTimetable({ ...cycle, start: "copy" })),
    ).toMatchObject({ code: "BAD_REQUEST", message: "timetable.cannot_copy" });
    const { id } = await api.timetable.saveTimetable({
      ...cycle,
      start: "empty",
    });

    const grid = await api.timetable.grid({ classId, on: WEEK_A });
    expect(grid.days).toEqual([1, 2, 3, 4, 5, 6]);
    expect(grid.meetings).toHaveLength(0);
    const period = grid.periods[0];
    const lesson = grid.classes[0];
    if (!period || !lesson) throw new Error("the grid is empty");
    await api.timetable.place({
      classId,
      weekday: 1,
      periodId: period.id,
      from: WEEK_A,
      meetingClassId: lesson.id,
      teacherId: "",
      roomId: "",
      resolve: "keep",
    });

    const a = await weekOf(api, classId, WEEK_A);
    expect(a.dates.map((row) => row.cycleDay)).toEqual([1, 2, 3, 4, 5]);
    expect(a.meetings.map((row) => row.on)).toEqual([WEEK_A]);
    const b = await weekOf(api, classId, WEEK_B);
    expect(b.dates.map((row) => row.cycleDay)).toEqual([6, 1, 2, 3, 4]);
    expect(b.meetings.map((row) => row.on)).toEqual(["2027-05-31"]);

    const holiday = {
      yearId,
      from: "2027-05-25",
      to: "2027-05-25",
      noteEn: "",
      noteAr: "",
      provisional: false,
    };
    await api.years.paint({ ...holiday, kind: "school_holiday" });
    try {
      const kept = await weekOf(api, classId, WEEK_A);
      expect(kept.dates.map((row) => row.cycleDay)).toEqual([1, 2, null, 4, 5]);
      const { timetables } = await api.timetable.timetables({ yearId });
      const saved = timetables.find((row) => row.id === id);
      if (!saved) throw new Error("no timetable");
      await api.timetable.saveTimetable({
        ...cycle,
        id,
        version: saved.version,
        closuresMove: true,
        start: "empty",
      });
      const moved = await weekOf(api, classId, WEEK_A);
      expect(moved.dates.map((row) => row.cycleDay)).toEqual([
        1,
        2,
        null,
        3,
        4,
      ]);
    } finally {
      await api.years.paint({ ...holiday, kind: "normal" });
      const { timetables } = await api.timetable.timetables({ yearId });
      const saved = timetables.find((row) => row.id === id);
      if (saved)
        await api.timetable.removeTimetable({ id, version: saved.version });
    }
  });
});

describe("the times a day keeps", () => {
  test("a period keeps other times on a weekday, and a bell schedule sets a day's", async () => {
    const api = await principal();
    const { classId, yearId } = await homeroom(api);
    const day = await api.years.periods({ id: yearId, on: WEEK_A });
    const lessons = day.periods.filter((row) => row.kind === "lesson");
    const first = lessons[0];
    const second = lessons[1];
    if (!first || !second) throw new Error("the seed has no lessons");
    const wednesday = {
      weekdays: [3],
      startTime: "08:10",
      endTime: first.endTime,
    };
    const save = (dayTimes: (typeof wednesday)[], current = day) =>
      api.years.savePeriods({
        yearId,
        from: WEEK_A,
        known: current.periods.map((row) => ({
          id: row.id,
          version: row.version,
        })),
        periods: current.periods.map((row) => ({
          id: row.id,
          nameEn: row.nameEn ?? "",
          nameAr: row.nameAr ?? "",
          kind: row.kind,
          startTime: row.startTime,
          endTime: row.endTime,
          official: row.official,
          weekdays: row.weekdays,
          dayTimes: row.code === first.code ? dayTimes : row.dayTimes,
        })),
      });
    await save([wednesday]);

    const week = await weekOf(api, classId, WEEK_A);
    const timesOf = (date: string) =>
      week.dates.find((row) => row.date === date)?.periods[0];
    expect(timesOf("2027-05-26")).toMatchObject({ startTime: "08:10" });
    expect(timesOf("2027-05-24")).toMatchObject({
      startTime: first.startTime,
    });
    expect(week.periods[0]?.startTime).toBe(first.startTime);

    const schedule = await api.years.saveSchedule({
      yearId,
      nameEn: "Exam day",
      nameAr: "يوم امتحان",
      times: [{ code: second.code, startTime: "10:00", endTime: "11:30" }],
    });
    const run = await api.years.scheduleRange({
      yearId,
      from: "2027-05-24",
      to: "2027-05-24",
      scheduleId: schedule.id,
    });
    expect(run.changed).toBe(1);
    try {
      const exam = await weekOf(api, classId, WEEK_A);
      const monday = exam.dates.find((row) => row.date === "2027-05-24");
      expect(monday?.schedule?.nameEn).toBe("Exam day");
      expect(monday?.periods.map((row) => row.startTime)).toEqual(["10:00"]);
      expect(
        lessonsOn(exam, "2027-05-24").every(
          (row) => row.periodId === monday?.periods[0]?.id,
        ),
      ).toBe(true);
      const cover = await api.cover.day({ on: "2027-05-24" });
      expect(cover.cover?.periods.map((row) => row.id)).toEqual(
        monday?.periods.map((row) => row.id),
      );
      const days = await api.years.days({ id: yearId });
      expect(
        days.days.find((row) => row.day === "2027-05-24")?.scheduleId,
      ).toBe(schedule.id);
    } finally {
      const { schedules } = await api.years.periods({ id: yearId, on: WEEK_A });
      const saved = schedules.find((row) => row.id === schedule.id);
      if (saved)
        await api.years.removeSchedule({
          id: saved.id,
          version: saved.version,
        });
      await save([], await api.years.periods({ id: yearId, on: WEEK_A }));
    }
    const back = await weekOf(api, classId, WEEK_A);
    const monday = back.dates.find((row) => row.date === "2027-05-24");
    expect(monday?.schedule).toBeNull();
    expect(monday?.periods.length).toBe(lessons.length);
  });
});
