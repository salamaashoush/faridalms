import { describe, expect, test } from "bun:test";

import {
  login,
  rejection,
  runDay,
  schoolDayBack,
  sessionFor,
  signedIn,
} from "./harness";

const principal = () => signedIn("northwind", login("principal"));

/** The fourth school day back: the register, notice and report suites take the three after it. */
const fourthSchoolDay = (today: string) => schoolDayBack(runDay(today), 4);

describe("following up absences", () => {
  test("an unexplained absence puts the child on the call list until a reason arrives", async () => {
    const office = await principal();
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const probe = await office.attendance.day({});
    const date = fourthSchoolDay(probe.today);
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
    const taken = await office.attendance.save({
      classId: homeroom.class.id,
      date,
      periodId: homeroom.period.id,
      expectedVersion: homeroom.register?.version ?? 0,
      marks: homeroom.students.map((row) => ({
        studentId: row.id,
        meaning: row.id === me.id ? ("absent" as const) : ("present" as const),
      })),
    });

    const before = await office.followUp.day({ date });
    // Overdue reasons and children needing support come a page at a time.
    for (const list of [before.followUp?.overdue, before.followUp?.support])
      expect(list).toMatchObject({ page: 1, pageSize: 25 });
    const call = before.followUp?.calls.find((row) => row.studentId === me.id);
    expect(call).toBeDefined();
    expect(call?.guardians.length).toBeGreaterThan(0);

    await office.followUp.logContact({
      studentId: me.id,
      date,
      outcome: "no_answer",
      note: "Rang twice.",
    });
    const logged = await office.followUp.day({ date });
    expect(
      logged.followUp?.calls.find((row) => row.studentId === me.id)?.contacts,
    ).toEqual([
      expect.objectContaining({ outcome: "no_answer", note: "Rang twice." }),
    ]);

    const reason = homeroom.reasons[0];
    if (!reason) throw new Error("no reasons");
    await office.attendance.save({
      classId: homeroom.class.id,
      date,
      periodId: homeroom.period.id,
      expectedVersion: taken.version,
      marks: homeroom.students.map((row) => ({
        studentId: row.id,
        meaning: row.id === me.id ? ("absent" as const) : ("present" as const),
        reasonId: row.id === me.id ? reason.id : "",
      })),
    });
    const after = await office.followUp.day({ date });
    expect(after.followUp?.calls.some((row) => row.studentId === me.id)).toBe(
      false,
    );
  });

  test("only the office follows up", async () => {
    const { api } = await sessionFor("northwind", login("teacher"));
    expect(await rejection(api.followUp.day({}))).toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
