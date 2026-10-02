import { describe, expect, test } from "bun:test";

import { login, rejection, seeded, sessionFor, signedIn } from "./harness";

const principal = () => signedIn("northwind", login("principal"));

// A Monday late in the seeded year, after today and clear of the timetable
// suite's change from 1 November, so other suites never meet these changes.
const DAY = "2026-12-07";

async function northwindTeachers() {
  const tenant = seeded().tenants[0];
  const school = tenant?.schools.find((row) => row.slug === "northwind");
  const names = (tenant?.logins ?? [])
    .filter((row) => row.role === "teacher" && row.schoolId === school?.id)
    .map((row) => row.loginName);
  return Promise.all(
    names.map(async (loginName) => {
      const { api } = await sessionFor("northwind", loginName);
      const me = await api.identity.currentUser();
      const { week } = await api.timetable.teacherWeek({ on: DAY });
      return {
        api,
        id: me.id,
        lessons: (week?.meetings ?? []).filter((row) => row.on === DAY),
      };
    }),
  );
}

describe("covering lessons", () => {
  test("an absence leaves lessons to cover, and the cover teacher takes that register only", async () => {
    const office = await principal();
    const teachers = await northwindTeachers();
    const away = teachers.find((row) => row.lessons.length >= 2);
    if (!away) throw new Error("the seed has no teacher with two lessons");
    const [lesson, other] = away.lessons;
    if (!lesson || !other) throw new Error("unreachable");

    await office.cover.setAbsence({
      userId: away.id,
      from: DAY,
      to: DAY,
      reason: "illness",
    });
    const before = await office.cover.day({ on: DAY });
    const open = before.cover?.lessons.filter((row) => row.away) ?? [];
    expect(open.length).toBe(away.lessons.length);
    expect(open.every((row) => row.change === null)).toBe(true);

    const key = { classId: lesson.classId, periodId: lesson.periodId, on: DAY };
    const { candidates } = await office.cover.options(key);
    expect(candidates.some((row) => row.userId === away.id)).toBe(false);
    const cover = teachers.find(
      (row) =>
        row.id !== away.id &&
        candidates.some((candidate) => candidate.userId === row.id),
    );
    if (!cover) throw new Error("no seeded teacher is free to cover");
    expect(cover.lessons.some((row) => row.periodId === lesson.periodId)).toBe(
      false,
    );

    expect(
      await rejection(office.cover.changeLesson({ ...key, coverId: away.id })),
    ).toMatchObject({ code: "BAD_REQUEST" });
    await office.cover.changeLesson({
      ...key,
      coverId: cover.id,
      note: "p. 42",
    });

    const { week } = await cover.api.timetable.teacherWeek({ on: DAY });
    const covered = week?.meetings.find(
      (row) => row.cover && row.classId === lesson.classId,
    );
    expect(covered).toMatchObject({
      on: DAY,
      periodId: lesson.periodId,
      change: { coverId: cover.id, note: "p. 42" },
    });

    const register = await cover.api.attendance.register({
      classId: lesson.classId,
      date: DAY,
    });
    expect(register.period.id).toBe(lesson.periodId);
    if (other.classId !== lesson.classId || other.periodId !== lesson.periodId)
      expect(
        await rejection(
          cover.api.attendance.register({
            classId: other.classId,
            date: DAY,
            periodId: other.periodId,
          }),
        ),
      ).toMatchObject({ code: "NOT_FOUND" });

    await office.cover.changeLesson({
      classId: other.classId,
      periodId: other.periodId,
      on: DAY,
      cancelled: true,
    });
    const { rows } = await office.attendance.board({ date: DAY });
    expect(
      rows.some(
        (row) =>
          row.classId === other.classId && row.periodId === other.periodId,
      ),
    ).toBe(false);

    const after = await office.cover.day({ on: DAY });
    const states = after.cover?.lessons ?? [];
    expect(
      states.find((row) => row.classId === lesson.classId)?.change?.coverId,
    ).toBe(cover.id);
    expect(
      states.find(
        (row) =>
          row.classId === other.classId && row.periodId === other.periodId,
      )?.change?.cancelled,
    ).toBe(true);

    await office.cover.clearLessonChange(key);
    expect(
      await rejection(
        cover.api.attendance.register({
          classId: lesson.classId,
          date: DAY,
          periodId: lesson.periodId,
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    const absence = after.cover?.absences.find((row) => row.userId === away.id);
    if (!absence) throw new Error("the absence is gone");
    await office.cover.removeStaffAbsence({ id: absence.id });
    await office.cover.clearLessonChange({
      classId: other.classId,
      periodId: other.periodId,
      on: DAY,
    });
  });

  test("only those who plan the timetable arrange cover", async () => {
    const { api } = await sessionFor("northwind", login("teacher"));
    expect(await rejection(api.cover.day({ on: DAY }))).toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
