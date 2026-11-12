import { addDays } from "@faridalms/domain/school";
import { describe, expect, test } from "bun:test";

import {
  login,
  periodOf,
  rejection,
  runDay,
  schoolDayBack,
  seeded,
  sessionFor,
  signedIn,
} from "./harness";

const principal = () => signedIn("northwind", login("principal"));

type Api = Awaited<ReturnType<typeof principal>>;

/** The homeroom the seeded student is placed in, found through the office. */
async function homeroomOf(api: Api, studentId: string, date: string) {
  const { rows } = await api.attendance.board({ date });
  const registers = await Promise.all(
    rows
      .filter((entry) => entry.daily)
      .map((row) =>
        api.attendance.register({
          classId: row.classId,
          date,
          periodId: row.periodId,
        }),
      ),
  );
  const found = registers.find((register) =>
    register.students.some((student) => student.id === studentId),
  );
  if (!found) throw new Error("the seeded student has no homeroom");
  return found;
}

function northwindTeachers() {
  const tenant = seeded().tenants[0];
  const school = tenant?.schools.find((row) => row.slug === "northwind");
  return (tenant?.logins ?? [])
    .filter((row) => row.role === "teacher" && row.schoolId === school?.id)
    .map((row) => row.loginName);
}

/** The seeded teacher whose classes include the homeroom, and one without it. */
async function teachersOf(classId: string) {
  const teachers = await Promise.all(
    northwindTeachers().map(async (loginName) => {
      const { api } = await sessionFor("northwind", loginName);
      const day = await api.attendance.day({});
      return { api, keeps: day.classes.some((row) => row.id === classId) };
    }),
  );
  const keeper = teachers.find((row) => row.keeps)?.api;
  const stranger = teachers.find((row) => !row.keeps)?.api;
  if (!keeper || !stranger)
    throw new Error("the seed lacks a keeper and a stranger for the homeroom");
  return { keeper, stranger };
}

describe("taking a register", () => {
  test("a homeroom teacher marks everyone, the office sees it, and a correction is audited", async () => {
    const office = await principal();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const probe = await office.attendance.day({});
    const date = schoolDayBack(runDay(probe.today), 1);
    const opened = await homeroomOf(office, me.id, date);
    const { keeper: teacher } = await teachersOf(opened.class.id);

    const register = await teacher.attendance.register({
      classId: opened.class.id,
      date,
    });
    expect(periodOf(register).official).toBe(true);
    expect(register.access).toEqual({ editable: true });
    expect(register.register).toBeNull();
    const late = register.students.find((row) => row.id !== me.id);
    if (!late) throw new Error("the homeroom has one student");

    const half = await teacher.attendance.save({
      classId: opened.class.id,
      date,
      periodId: periodOf(register).id,
      expectedVersion: 0,
      marks: [{ studentId: me.id, meaning: "absent" }],
    });
    expect(half.state).toBe("in_progress");

    const full = await teacher.attendance.save({
      classId: opened.class.id,
      date,
      periodId: periodOf(register).id,
      expectedVersion: half.version,
      marks: register.students.map((row) =>
        row.id === me.id
          ? { studentId: row.id, meaning: "absent" as const }
          : row.id === late.id
            ? { studentId: row.id, meaning: "late" as const, minutes: 12 }
            : { studentId: row.id, meaning: "present" as const },
      ),
    });
    expect(full.state).toBe("submitted");

    expect(
      await rejection(
        teacher.attendance.save({
          classId: opened.class.id,
          date,
          periodId: periodOf(register).id,
          expectedVersion: half.version,
          marks: [],
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "conflict.version" });

    const board = await office.attendance.board({ date });
    const row = board.rows.find(
      (entry) =>
        entry.classId === opened.class.id &&
        entry.periodId === periodOf(register).id,
    );
    expect(row).toMatchObject({ state: "submitted" });
    expect(row?.counts.absent).toBe(1);
    expect(row?.counts.late).toBe(1);
    expect(row?.counts.present).toBe(register.students.length - 2);

    const reopened = await teacher.attendance.register({
      classId: opened.class.id,
      date,
    });
    expect(reopened.register?.state).toBe("submitted");
    expect(
      reopened.marks.find((mark) => mark.studentId === late.id),
    ).toMatchObject({ meaning: "late", minutes: 12 });

    const corrected = {
      classId: opened.class.id,
      date,
      periodId: periodOf(register).id,
      expectedVersion: full.version,
      marks: register.students.map((entry) => ({
        studentId: entry.id,
        meaning:
          entry.id === me.id ? ("absent" as const) : ("present" as const),
      })),
    };
    expect(await rejection(teacher.attendance.save(corrected))).toMatchObject({
      code: "BAD_REQUEST",
      message: "attendance.correction_reason",
    });
    await teacher.attendance.save({
      ...corrected,
      correction: "The hall clock was ten minutes fast.",
    });
    const { rows: history } = await office.people.studentHistory({
      id: late.id,
    });
    expect(
      history.some((entry) => entry.action === "attendance.mark_change"),
    ).toBe(true);
    const amended = await teacher.attendance.register({
      classId: opened.class.id,
      date,
      periodId: periodOf(register).id,
    });
    expect(
      amended.history.find((entry) => entry.studentId === late.id),
    ).toMatchObject({
      from: "late",
      to: "present",
      reason: "The hall clock was ten minutes fast.",
    });
  });

  test("a teacher reaches only their classes, school days, the roster and their window", async () => {
    const office = await principal();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const probe = await office.attendance.day({});
    const date = schoolDayBack(runDay(probe.today), 1);
    const opened = await homeroomOf(office, me.id, date);
    const { keeper: teacher, stranger } = await teachersOf(opened.class.id);
    expect(
      await rejection(
        stranger.attendance.register({ classId: opened.class.id, date }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });

    const friday = "2026-09-18";
    expect(
      (
        await teacher.attendance.register({
          classId: opened.class.id,
          date: friday,
        })
      ).access,
    ).toEqual({ editable: false, reason: "not_school_day" });
    expect(
      await rejection(
        teacher.attendance.save({
          classId: opened.class.id,
          date: friday,
          periodId: periodOf(opened).id,
          expectedVersion: 0,
          marks: [],
        }),
      ),
    ).toMatchObject({ code: "CONFLICT", message: "attendance.not_school_day" });

    expect(
      await rejection(
        teacher.attendance.save({
          classId: opened.class.id,
          date,
          periodId: periodOf(opened).id,
          expectedVersion: 0,
          marks: [{ studentId: opened.class.id, meaning: "present" }],
        }),
      ),
    ).toMatchObject({ code: "CONFLICT" });

    const rules = await office.attendance.settings();
    const narrowed = await office.attendance.saveSettings({
      expectedVersion: rules.version,
      teacherEditDays: 0,
      noticeDelayMinutes: rules.noticeDelayMinutes,
      chronicPercent: rules.chronicPercent,
    });
    try {
      const taken = "2026-09-17";
      const past = await teacher.attendance.register({
        classId: opened.class.id,
        date: taken,
      });
      expect(past.register?.state).toBe("submitted");
      expect(past.access).toEqual({ editable: false, reason: "window" });
      const corrected = await office.attendance.register({
        classId: opened.class.id,
        date: taken,
      });
      expect(corrected.access).toEqual({ editable: true });
    } finally {
      await office.attendance.saveSettings({
        expectedVersion: narrowed.version,
        teacherEditDays: rules.teacherEditDays,
        noticeDelayMinutes: rules.noticeDelayMinutes,
        chronicPercent: rules.chronicPercent,
      });
    }
  });
});

describe("registers and enrolment", () => {
  test("a student cannot leave a class from a day a register already marks them", async () => {
    const office = await principal();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const { rows } = await office.homerooms.history({ studentId: me.id });
    const homeroom = rows.find((row) => row.from <= "2026-09-14");
    if (!homeroom) throw new Error("the seeded student has no homeroom");
    expect(
      await rejection(
        office.homerooms.leave({
          studentId: me.id,
          enrollmentId: homeroom.enrollmentId,
          expectedVersion: homeroom.version,
          on: "2026-09-15",
        }),
      ),
    ).toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(
        /^enrollment\.registers_after:\d{4}-\d{2}-\d{2}$/,
      ),
    });
  });
});

describe("registers and the school year", () => {
  test("a year cannot narrow past a register already taken in it", async () => {
    const office = await principal();
    const { years } = await office.years.directory();
    const year = years.find((row) => row.lifecycle === "current");
    if (!year) throw new Error("the seed has no current year");
    const { terms } = await office.years.record({ id: year.id });
    const endsOn = addDays(year.endsBefore, -1);
    expect(
      await rejection(
        office.years.save({
          id: year.id,
          expectedVersion: year.version,
          titleEn: year.titleEn ?? "",
          titleAr: year.titleAr ?? "",
          startsOn: "2026-09-20",
          endsOn,
          terms: terms.map((term, index) => ({
            id: term.id,
            titleEn: term.titleEn ?? "",
            titleAr: term.titleAr ?? "",
            startsOn: index === 0 ? "2026-09-20" : term.startsOn,
            endsOn: addDays(term.endsBefore, -1),
          })),
        }),
      ),
    ).toMatchObject({ message: "school_year.rows_outside_dates" });
  });
});

describe("following up absences", () => {
  test("the office excuses an unexplained absence, and the family reads the reason", async () => {
    const office = await principal();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const unexplained = await office.attendance.absences({
      from: "2026-09-13",
      to: "2026-09-24",
    });
    expect(unexplained.rows.length).toBeGreaterThan(0);
    expect(
      unexplained.rows.every(
        (row) =>
          ["absent", "late"].includes(row.meaning) && row.reasonId === null,
      ),
    ).toBe(true);
    const absence = unexplained.rows.find((row) => row.meaning === "absent");
    if (!absence) throw new Error("the seed has no unexplained absence");
    const illness = unexplained.reasons.find((row) => row.code === "illness");
    if (!illness) throw new Error("the seed has no illness reason");

    const done = await office.attendance.excuse({
      marks: [{ id: absence.id, date: absence.date }],
      reasonId: illness.id,
      note: "Doctor's note received.",
    });
    expect(done.excused).toBe(1);
    const after = await office.attendance.absences({
      from: "2026-09-13",
      to: "2026-09-24",
    });
    expect(after.rows.some((row) => row.id === absence.id)).toBe(false);

    const record = await office.attendance.student({
      studentId: absence.studentId,
    });
    expect(
      record.marks.rows.find((mark) => mark.id === absence.id),
    ).toMatchObject({
      meaning: "excused",
      reasonId: illness.id,
    });

    const own = await student.api.attendance.student({});
    expect(own.summary.sessions).toBeGreaterThan(0);
    const parent = await signedIn(
      "northwind",
      login("student").replace("student", "parent"),
    );
    const child = await parent.attendance.student({ studentId: me.id });
    expect(child.summary).toEqual(own.summary);
    expect(
      await rejection(
        parent.attendance.student({ studentId: absence.studentId }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
  });

  test("reports count daily attendance by student and by homeroom", async () => {
    const office = await principal();
    const byStudent = await office.attendance.report({});
    expect(byStudent.rows.length).toBeGreaterThan(0);
    const first = byStudent.rows[0];
    expect(first?.summary.sessions).toBeGreaterThan(0);
    expect(
      byStudent.rows.every(
        (row) =>
          row.chronic ===
          (row.summary.rate !== null &&
            100 - row.summary.rate >= byStudent.chronicPercent),
      ),
    ).toBe(true);
    const byClass = await office.attendance.report({ by: "class" });
    expect(byClass.rows.every((row) => row.registers >= 0)).toBe(true);
    expect(byClass.rows.some((row) => row.registers > 0)).toBe(true);

    const teacher = await signedIn("northwind", login("teacher", 0, 1));
    expect(await rejection(teacher.attendance.report({}))).toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("classroom check-in", () => {
  test("a child taps in on the class screen, and only the teacher's save completes the register", async () => {
    const office = await principal();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    // A day before today: today's check-in is late or not by the clock the
    // test runs at, and another day's is always on time.
    const date = schoolDayBack(
      addDays(runDay((await office.attendance.day({})).today), -1),
      1,
    );
    const opened = await homeroomOf(office, me.id, date);
    const { keeper: teacher, stranger } = await teachersOf(opened.class.id);
    const first = await teacher.attendance.register({
      classId: opened.class.id,
      date,
    });
    // A period nobody has taken yet, so the register starts empty.
    const period =
      first.periods.find((row) => row.id !== periodOf(first).id) ??
      periodOf(first);
    const tap = {
      classId: opened.class.id,
      date,
      periodId: period.id,
      via: "touch" as const,
      studentId: me.id,
    };

    expect(await rejection(teacher.attendance.checkIn(tap))).toMatchObject({
      code: "FORBIDDEN",
      message: "attendance.check_in_off",
    });
    const rules = await office.attendance.settings();
    const { version: _version, ...kept } = rules;
    const turnedOn = await office.attendance.saveSettings({
      ...kept,
      expectedVersion: rules.version,
      checkInTouch: true,
    });

    expect(await teacher.attendance.checkIn(tap)).toEqual({
      studentId: me.id,
      added: true,
      late: null,
    });
    expect((await teacher.attendance.checkIn(tap)).added).toBe(false);
    expect(await rejection(stranger.attendance.checkIn(tap))).toMatchObject({
      code: "NOT_FOUND",
    });
    const seen = await teacher.attendance.register({
      classId: opened.class.id,
      date,
      periodId: period.id,
    });
    expect(seen.checkIn).toEqual({ touch: true, qr: false, nfc: false });
    expect(seen.register?.state).toBe("in_progress");
    expect(seen.marks).toContainEqual(
      expect.objectContaining({
        studentId: me.id,
        meaning: "present",
        via: "touch",
      }),
    );

    const { studentId: _who, via: _how, ...where } = tap;
    expect(
      await teacher.attendance.undoCheckIn({ ...where, studentId: me.id }),
    ).toEqual({ undone: true });
    await teacher.attendance.checkIn(tap);
    const again = await teacher.attendance.register({
      classId: opened.class.id,
      date,
      periodId: period.id,
    });
    const confirmed = await teacher.attendance.save({
      classId: opened.class.id,
      date,
      periodId: period.id,
      expectedVersion: again.register?.version ?? 0,
      marks: again.students.map((row) => ({
        studentId: row.id,
        meaning: row.id === me.id ? ("present" as const) : ("absent" as const),
      })),
    });
    expect(confirmed.state).toBe("submitted");

    await office.attendance.saveSettings({
      ...kept,
      expectedVersion: turnedOn.version,
    });
  });
});
