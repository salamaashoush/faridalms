import { schoolDayCount } from "@faridalms/domain/calendar";
import { teachingWeeks } from "@faridalms/domain/school";
import { DEFAULT_PERIODS } from "@faridalms/domain/timetable";
import { describe, expect, test } from "bun:test";

import { login, rejection, signedIn } from "./harness";

const northwindPrincipal = () => signedIn("northwind", login("principal"));
// Lifecycle steps change which year is current, so they run on the second
// school and leave the first school's year to the other suites.
const acmePrincipal = () => signedIn("acme", login("principal", 1));

const NEXT = {
  titleEn: "2027–2028",
  titleAr: "٢٠٢٧–٢٠٢٨",
  startsOn: "2027-09-12",
  endsOn: "2028-06-15",
  terms: [
    {
      titleEn: "Term 1",
      titleAr: "الفصل الأول",
      startsOn: "2027-09-12",
      endsOn: "2028-01-20",
    },
    {
      titleEn: "Term 2",
      titleAr: "الفصل الثاني",
      startsOn: "2028-02-06",
      endsOn: "2028-06-15",
    },
  ],
};

async function currentYear(api: Awaited<ReturnType<typeof acmePrincipal>>) {
  const { years } = await api.years.directory();
  const year = years.find((row) => row.lifecycle === "current");
  if (!year) throw new Error("seed current year");
  return year;
}

const lastDay = (endsBefore: string) => {
  const day = new Date(`${endsBefore}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
};

type Periods = Awaited<
  ReturnType<Awaited<ReturnType<typeof acmePrincipal>>["years"]["periods"]>
>["periods"];

const shapeOf = (periods: Periods) =>
  periods.map((period) => ({
    nameEn: period.nameEn,
    kind: period.kind,
    startTime: period.startTime,
    endTime: period.endTime,
    official: period.official,
    weekdays: period.weekdays,
  }));

const inputOf = (periods: Periods) =>
  periods.map((period) => ({
    id: period.id,
    nameEn: period.nameEn ?? "",
    nameAr: period.nameAr ?? "",
    kind: period.kind,
    startTime: period.startTime,
    endTime: period.endTime,
    official: period.official,
    weekdays: period.weekdays,
  }));

const knownOf = (periods: Periods) =>
  periods.map((period) => ({ id: period.id, version: period.version }));

// Acme teaches Monday to Friday. The change lands on a Monday after today
// and after the weeks other suites read.
const CHANGED = "2026-11-16";
const BEFORE_CHANGE = "2026-11-09";
const MONDAY = 1;
const FRIDAY = 5;

describe("the school day", () => {
  test("a year's periods change from a date on, keeping earlier days and their registers", async () => {
    const api = await acmePrincipal();
    const year = await currentYear(api);
    const before = await api.years.periods({ id: year.id, on: CHANGED });
    expect(shapeOf(before.periods)).toEqual(
      DEFAULT_PERIODS.map((period) => ({
        nameEn: period.nameEn,
        kind: period.kind,
        startTime: period.startTime,
        endTime: period.endTime,
        official: period.official,
        weekdays: [...period.weekdays],
      })),
    );
    expect(before).toMatchObject({
      weekStart: MONDAY,
      days: [1, 2, 3, 4, 5],
      changes: [year.startsOn],
      canEdit: true,
    });

    const first = before.periods.find((period) => period.nameEn === "Period 1");
    const last = before.periods.find((period) => period.nameEn === "Period 6");
    const registration = before.periods.find((period) => period.official);
    if (!first || !last || !registration) throw new Error("seeded periods");
    const { grids } = await api.timetable.options();
    const homeroom = grids.find((row) => row.classType === "homeroom");
    if (!homeroom) throw new Error("seeded homeroom");
    const placed = (
      await api.timetable.grid({ classId: homeroom.id, on: BEFORE_CHANGE })
    ).meetings.find(
      (row) => row.weekday === MONDAY && row.periodId === first.id,
    );
    if (!placed) throw new Error("the seeded week has no first lesson");

    const later = inputOf(before.periods)
      .filter((period) => period.id !== last.id)
      .map((period) =>
        period.id === first.id ? { ...period, startTime: "08:05" } : period,
      );
    const added = {
      nameEn: "Period 7",
      nameAr: "الحصة السابعة",
      kind: "lesson" as const,
      startTime: "13:25",
      endTime: "14:10",
      official: false,
      weekdays: [1, 2, 3, 4],
    };

    // A register already taken in a period the change touches keeps it out.
    expect(
      await rejection(
        api.years.savePeriods({
          yearId: year.id,
          from: year.startsOn,
          known: knownOf(before.periods),
          periods: inputOf(before.periods).map((period) =>
            period.id === registration.id
              ? { ...period, endTime: "07:55" }
              : period,
          ),
        }),
      ),
    ).toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(
        /^class_period\.registers_after:\d{4}-\d{2}-\d{2}$/,
      ),
    });
    expect(
      await rejection(
        api.years.savePeriods({
          yearId: year.id,
          from: CHANGED,
          known: knownOf(before.periods),
          periods: [...later, { ...added, startTime: "12:00" }],
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });

    const saved = await api.years.savePeriods({
      yearId: year.id,
      from: CHANGED,
      known: knownOf(before.periods),
      periods: [...later, added],
    });
    expect(saved).toMatchObject({ changed: 1, added: 1, ended: 1 });

    const kept = await api.years.periods({ id: year.id, on: BEFORE_CHANGE });
    expect(kept.periods.map((period) => period.id)).toEqual(
      before.periods.map((period) => period.id),
    );
    const after = await api.years.periods({ id: year.id, on: CHANGED });
    expect(after.changes).toEqual([year.startsOn, CHANGED]);
    const moved = after.periods.find((period) => period.nameEn === "Period 1");
    expect(moved).toMatchObject({ startTime: "08:05", from: CHANGED });
    expect(moved?.id).not.toBe(first.id);
    expect(after.periods.map((period) => period.nameEn)).not.toContain(
      "Period 6",
    );
    expect(after.periods.at(-1)).toMatchObject({
      nameEn: "Period 7",
      weekdays: [1, 2, 3, 4],
    });

    // The lesson in the first period carries on in its new times.
    const week = await api.timetable.grid({
      classId: homeroom.id,
      on: CHANGED,
    });
    expect(
      week.meetings.find(
        (row) => row.weekday === MONDAY && row.periodId === moved?.id,
      )?.classId,
    ).toBe(placed.classId);
    expect(week.meetings.some((row) => row.periodId === last.id)).toBe(false);
    const earlier = await api.timetable.grid({
      classId: homeroom.id,
      on: BEFORE_CHANGE,
    });
    expect(
      earlier.meetings.find(
        (row) => row.weekday === MONDAY && row.periodId === first.id,
      )?.classId,
    ).toBe(placed.classId);

    // The new period runs Monday to Thursday only.
    const seventh = after.periods.at(-1);
    const subject = week.classes[0];
    if (!seventh || !subject) throw new Error("the grid places no class");
    expect(
      await rejection(
        api.timetable.place({
          classId: homeroom.id,
          weekday: FRIDAY,
          periodId: seventh.id,
          from: CHANGED,
          meetingClassId: subject.id,
          teacherId: "",
          roomId: "",
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST", message: "timetable.no_period" });

    // An editor who read the day before it changed is refused.
    expect(
      await rejection(
        api.years.savePeriods({
          yearId: year.id,
          from: CHANGED,
          known: knownOf(before.periods),
          periods: inputOf(before.periods),
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "conflict.version" });

    // Changing the day again from the same date changes it where it stands.
    await api.years.savePeriods({
      yearId: year.id,
      from: CHANGED,
      known: knownOf(after.periods),
      periods: inputOf(after.periods).map((period) =>
        period.id === seventh.id
          ? { ...period, nameEn: "Last lesson" }
          : period,
      ),
    });
    const renamed = await api.years.periods({ id: year.id, on: CHANGED });
    expect(renamed.periods.at(-1)).toMatchObject({
      id: seventh.id,
      nameEn: "Last lesson",
    });
    expect(renamed.changes).toEqual([year.startsOn, CHANGED]);

    const history = await api.years.history({ id: year.id });
    expect(history[0]?.action).toBe("class_periods.replace");
  });

  test("a teacher reads and changes no school day", async () => {
    const api = await acmePrincipal();
    const year = await currentYear(api);
    const teacher = await signedIn("acme", login("teacher", 1));
    expect(
      await rejection(teacher.years.periods({ id: year.id, on: "" })),
    ).toMatchObject({ code: "FORBIDDEN" });
    expect(
      await rejection(
        teacher.years.savePeriods({
          yearId: year.id,
          from: CHANGED,
          known: [],
          periods: [
            {
              nameEn: "Period 1",
              nameAr: "",
              kind: "lesson",
              startTime: "08:00",
              endTime: "08:45",
              official: false,
              weekdays: [1],
            },
          ],
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("school years", () => {
  test("the principal lists the year with its terms, classes and students", async () => {
    const api = await northwindPrincipal();
    const { years, access } = await api.years.directory();
    const classes = await api.classes.directory({});
    const enrolled = await api.people.students({ status: ["enrolled"] });
    expect(years.find((row) => row.lifecycle === "current")).toMatchObject({
      lifecycle: "current",
      standing: "current",
      terms: 2,
      classes: classes.rows.length,
      students: enrolled.total,
    });
    expect(enrolled.total).toBeGreaterThanOrEqual(18);
    expect(access).toEqual({ manage: true, reopen: true });
  });

  test("a teacher reads no year", async () => {
    const teacher = await signedIn("northwind", login("teacher"));
    expect(await rejection(teacher.years.directory())).toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("a new year gets its terms, a school calendar and weeks covering it", async () => {
    const api = await acmePrincipal();
    const { id } = await api.years.save(NEXT);
    const year = await api.years.record({ id });
    expect(year).toMatchObject({
      lifecycle: "upcoming",
      standing: "upcoming",
      startsOn: "2027-09-12",
      endsBefore: "2028-06-16",
      schoolYear: 2028,
    });
    expect(year.terms.map((term) => term.titleEn)).toEqual([
      "Term 1",
      "Term 2",
    ]);
    const { weekStart } = await api.school.profile();
    expect(year.calendar.weeks).toBe(
      teachingWeeks("2027-09-12", "2028-06-15", 1, weekStart).length,
    );
    expect(year.calendar.schoolDays).toBeGreaterThan(150);
    const current = await currentYear(api);
    const [ours, theirs] = await Promise.all([
      api.years.periods({ id, on: "" }),
      api.years.periods({ id: current.id, on: lastDay(current.endsBefore) }),
    ]);
    expect(shapeOf(ours.periods)).toEqual(shapeOf(theirs.periods));
    expect(ours.changes).toEqual(["2027-09-12"]);
    expect(
      await rejection(
        api.years.save({
          ...NEXT,
          startsOn: "2028-06-01",
          endsOn: "2029-01-10",
          terms: [],
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "school_year.overlapping" });
  });

  test("narrowing a year clips what crosses its end, and widening carries it back", async () => {
    const api = await acmePrincipal();
    const year = await currentYear(api);
    const { terms } = await api.years.record({ id: year.id });
    const form = (endsOn: string, version: number) => ({
      id: year.id,
      expectedVersion: version,
      titleEn: year.titleEn ?? "",
      titleAr: year.titleAr ?? "",
      startsOn: year.startsOn,
      endsOn,
      terms: terms.map((term, index) => ({
        id: term.id,
        titleEn: term.titleEn ?? "",
        titleAr: term.titleAr ?? "",
        startsOn: term.startsOn,
        endsOn: index === terms.length - 1 ? endsOn : lastDay(term.endsBefore),
      })),
    });
    const end = lastDay(year.endsBefore);
    expect(
      await rejection(api.years.save(form("2028-01-10", year.version))),
    ).toMatchObject({ message: "school_year.end_year_fixed" });

    const saved = await api.years.save(form("2027-06-10", year.version));
    const narrowed = await api.years.record({ id: year.id });
    expect(saved.version).toBe(narrowed.version);
    expect(narrowed.endsBefore).toBe("2027-06-11");
    expect(narrowed.terms.at(-1)?.endsBefore).toBe("2027-06-11");
    expect(narrowed.students).toBe(year.students);
    expect(
      await rejection(api.years.save(form(end, year.version))),
    ).toMatchObject({ code: "CONFLICT", message: "conflict.version" });

    await api.years.save(form(end, narrowed.version));
    const homeroom = (await api.classes.directory({})).rows[0];
    if (!homeroom) throw new Error("seed homeroom");
    const lastWeek = await api.classes.record({ id: homeroom.id, on: end });
    expect(lastWeek.roster).toHaveLength(homeroom.students);
  });

  test("making the next year current closes the old one until it is reopened with a reason", async () => {
    const api = await acmePrincipal();
    const old = await currentYear(api);
    const next = (await api.years.directory()).years.find(
      (row) => row.lifecycle === "upcoming",
    );
    if (!next) throw new Error("upcoming year from the earlier test");
    expect(
      await rejection(
        api.years.lifecycle({
          id: old.id,
          expectedVersion: old.version,
          action: "close",
        }),
      ),
    ).toMatchObject({ message: "school_year.current_closing" });

    const made = await api.years.lifecycle({
      id: next.id,
      expectedVersion: next.version,
      action: "make_current",
    });
    expect(made.replaced).toBe(old.id);
    const after = (await api.years.directory()).years;
    expect(after.find((row) => row.id === next.id)?.lifecycle).toBe("current");
    const closed = after.find((row) => row.id === old.id);
    if (!closed) throw new Error("old year");
    expect(closed.lifecycle).toBe("closed");

    const homeroom = (await api.classes.directory({ year: old.id })).rows[0];
    if (!homeroom) throw new Error("old homeroom");
    const record = await api.classes.record({ id: homeroom.id });
    const student = record.roster[0];
    if (!student) throw new Error("old roster");
    expect(record.access.manage).toBe(false);
    const { periods } = await api.years.periods({ id: old.id, on: "" });
    expect(
      await rejection(
        api.years.savePeriods({
          yearId: old.id,
          from: old.startsOn,
          known: knownOf(periods),
          periods: inputOf(periods),
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "school_year.closed" });
    expect(
      await rejection(
        api.classes.withdraw({
          studentId: student.userId,
          enrollmentId: student.enrollmentId,
          expectedVersion: student.version,
          on: "",
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "school_year.closed" });

    expect(
      await rejection(
        api.years.lifecycle({
          id: old.id,
          expectedVersion: closed.version,
          action: "reopen",
          reason: " ",
        }),
      ),
    ).toMatchObject({
      code: "BAD_REQUEST",
      message: "school_year.reason_required",
    });
    await api.years.lifecycle({
      id: old.id,
      expectedVersion: closed.version,
      action: "reopen",
      reason: "Correct a mistyped grade",
    });
    const reopened = (await api.years.directory()).years.find(
      (row) => row.id === old.id,
    );
    expect(reopened).toMatchObject({ lifecycle: "upcoming", standing: "open" });
    const events = await api.years.history({ id: old.id });
    expect(events.map((event) => event.action).slice(0, 2)).toEqual([
      "academic_session.reopened",
      "academic_session.closed",
    ]);
    expect(events[0]?.reason).toBe("Correct a mistyped grade");
  });
});

describe("planning school days", () => {
  test("the office marks a week's holiday, weekends stay, and puts it back", async () => {
    const office = await northwindPrincipal();
    const year = await currentYear(office);
    const before = await office.years.days({ id: year.id });
    expect(before.canEdit).toBe(true);
    const week = before.days.filter(
      (day) => day.day >= "2027-05-02" && day.day <= "2027-05-08",
    );
    const weekdays = week.filter((day) => day.meaning !== "weekend").length;

    const marked = await office.years.paint({
      yearId: year.id,
      from: "2027-05-02",
      to: "2027-05-08",
      kind: "school_holiday",
      noteEn: "Spring break",
      noteAr: "عطلة الربيع",
      provisional: true,
    });
    expect(marked.changed).toBe(weekdays);
    const after = await office.years.days({ id: year.id });
    const inWeek = after.days.filter(
      (day) => day.day >= "2027-05-02" && day.day <= "2027-05-08",
    );
    expect(inWeek.filter((day) => day.meaning === "weekend")).toHaveLength(
      week.length - weekdays,
    );
    expect(
      inWeek.filter((day) => day.meaning === "school_holiday"),
    ).toHaveLength(weekdays);
    expect(
      inWeek.find((day) => day.meaning === "school_holiday"),
    ).toMatchObject({ noteEn: "Spring break", provisional: true });
    expect(schoolDayCount(after.days)).toBe(
      schoolDayCount(before.days) - weekdays,
    );

    const friday = inWeek.find((day) => day.meaning === "weekend");
    if (!friday) throw new Error("the week has no weekend day");
    await office.years.paint({
      yearId: year.id,
      from: friday.day,
      to: friday.day,
      kind: "make_up_day",
      noteEn: "",
      noteAr: "",
      provisional: false,
    });
    await office.years.paint({
      yearId: year.id,
      from: "2027-05-02",
      to: "2027-05-08",
      kind: "normal",
      noteEn: "",
      noteAr: "",
      provisional: false,
    });
    const restored = await office.years.days({ id: year.id });
    expect(schoolDayCount(restored.days)).toBe(schoolDayCount(before.days));
    expect(restored.days.find((day) => day.day === friday.day)?.meaning).toBe(
      "weekend",
    );

    await office.years.target({ yearId: year.id, target: 180 });
    expect((await office.years.days({ id: year.id })).targetDays).toBe(180);
  });

  test("teachers do not change school days", async () => {
    const office = await northwindPrincipal();
    const year = await currentYear(office);
    const teacher = await signedIn("northwind", login("teacher", 0, 1));
    expect(
      await rejection(
        teacher.years.paint({
          yearId: year.id,
          from: "2027-05-10",
          to: "2027-05-10",
          kind: "exam_day",
          noteEn: "",
          noteAr: "",
          provisional: false,
        }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});
