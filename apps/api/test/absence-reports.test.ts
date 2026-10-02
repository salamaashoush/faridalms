import { addDays } from "@faridalms/domain/school";
import { describe, expect, test } from "bun:test";

import { login, rejection, sessionFor, signedIn } from "./harness";

const principal = () => signedIn("northwind", login("principal"));
const mother = () =>
  signedIn("northwind", login("student").replace("student", "parent"));

function offDay(day: string) {
  return (
    [5, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay()) ||
    day === "2026-10-06"
  );
}

/**
 * The third school day back from today: the register and notice suites
 * take the two after it.
 */
function thirdSchoolDay(today: string) {
  let day = today;
  for (let step = 0; step < 3; step += 1) {
    if (step > 0) day = addDays(day, -1);
    while (offDay(day)) day = addDays(day, -1);
  }
  return day;
}

describe("absences families report", () => {
  test("a reported absence spares the alarm, and once accepted explains the mark", async () => {
    const office = await principal();
    const family = await mother();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const { reasons, today } = await family.absenceReports.mine({});
    const illness = reasons.find((row) => row.code === "illness");
    if (!illness) throw new Error("the seed has no illness reason");
    const date = thirdSchoolDay(today);

    const { id } = await family.absenceReports.report({
      studentId: me.id,
      kind: "absent",
      from: date,
      to: date,
      reasonId: illness.id,
      note: "A fever since last night.",
    });
    const mine = await family.absenceReports.mine({ studentId: me.id });
    expect(mine.reports.find((row) => row.id === id)).toMatchObject({
      decision: "pending",
      from: date,
      to: date,
    });

    const { rows } = await office.attendance.board({ date });
    const registers = await Promise.all(
      rows
        .filter((row) => row.classType === "homeroom")
        .map((row) =>
          office.attendance.register({
            classId: row.classId,
            date,
            periodId: row.periodId,
          }),
        ),
    );
    const homeroom = registers.find((register) =>
      register.students.some((row) => row.id === me.id),
    );
    if (!homeroom) throw new Error("the seeded student has no homeroom");
    expect(homeroom.reports).toContainEqual(
      expect.objectContaining({ studentId: me.id, accepted: false }),
    );
    await office.attendance.save({
      classId: homeroom.class.id,
      date,
      periodId: homeroom.period.id,
      expectedVersion: homeroom.register?.version ?? 0,
      marks: homeroom.students.map((row) => ({
        studentId: row.id,
        meaning: row.id === me.id ? ("absent" as const) : ("present" as const),
      })),
    });
    const alarms = await family.notifications.list({ tab: "all" });
    expect(
      alarms.rows.some(
        (row) =>
          row.kind === "absence" &&
          row.subjectId === me.id &&
          row.params.date === date,
      ),
    ).toBe(false);

    const { reports } = await office.absenceReports.inbox({ open: true });
    expect(reports.some((row) => row.id === id)).toBe(true);
    const { explained } = await office.absenceReports.decide({
      id,
      decision: "accepted",
    });
    expect(explained).toBeGreaterThan(0);
    const after = await office.attendance.register({
      classId: homeroom.class.id,
      date,
      periodId: homeroom.period.id,
    });
    expect(after.marks.find((row) => row.studentId === me.id)).toMatchObject({
      meaning: "excused",
      reasonId: illness.id,
    });
    const answer = await family.notifications.list({ tab: "all" });
    expect(
      answer.rows.some(
        (row) => row.kind === "absence" && row.params.report === "accepted",
      ),
    ).toBe(true);

    expect(
      await rejection(family.absenceReports.withdraw({ id })),
    ).toMatchObject({ code: "CONFLICT" });
  });

  test("families report only their own children, and only days not long past", async () => {
    const family = await mother();
    const { reasons, today } = await family.absenceReports.mine({});
    const reason = reasons[0];
    if (!reason) throw new Error("no reasons");
    const office = await principal();
    const day = thirdSchoolDay(today);
    const { rows } = await office.attendance.board({ date: day });
    const homeroom = rows.find((row) => row.classType === "homeroom");
    if (!homeroom) throw new Error("no homeroom");
    const register = await office.attendance.register({
      classId: homeroom.classId,
      date: day,
      periodId: homeroom.periodId,
    });
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const other = register.students.find((row) => row.id !== me.id);
    if (!other) throw new Error("no other student");
    expect(
      await rejection(
        family.absenceReports.report({
          studentId: other.id,
          kind: "absent",
          from: today,
          to: today,
          reasonId: reason.id,
        }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });

    expect(
      await rejection(
        family.absenceReports.report({
          studentId: me.id,
          kind: "absent",
          from: addDays(today, -30),
          to: addDays(today, -30),
          reasonId: reason.id,
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });

    const late = await family.absenceReports.report({
      studentId: me.id,
      kind: "late",
      from: addDays(today, 7),
      to: addDays(today, 7),
      at: "10:30",
      reasonId: reason.id,
    });
    await family.absenceReports.withdraw({ id: late.id });
    const { reports } = await family.absenceReports.mine({ studentId: me.id });
    expect(reports.find((row) => row.id === late.id)?.decision).toBe(
      "withdrawn",
    );
  });
});
