import { withPurpose } from "@faridalms/database/context";
import { addDays } from "@faridalms/domain/school";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import {
  login,
  raw,
  rejection,
  runDay,
  schoolDayBack,
  seeded,
  sessionFor,
  signedIn,
} from "./harness";

const principal = () => signedIn("northwind", login("principal"));
const mother = () =>
  signedIn("northwind", login("student").replace("student", "parent"));

/**
 * The third school day back from today: the register and notice suites
 * take the two after it.
 */
const thirdSchoolDay = (today: string) => schoolDayBack(runDay(today), 3);

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
        .filter((row) => row.daily)
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
    const homeroom = rows.find((row) => row.daily);
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

describe("a note sent with a report", () => {
  test("rests sealed and opens for the family and the office, not for a teacher", async () => {
    const family = await sessionFor(
      "northwind",
      login("student").replace("student", "parent"),
    );
    const student = await sessionFor("northwind", login("student"));
    const me = await student.api.identity.currentUser();
    const { reasons, today } = await family.api.absenceReports.mine({});
    const reason = reasons[0];
    if (!reason) throw new Error("no reasons");
    const body = new TextEncoder().encode("%PDF-1.4\nDentist at 9.\n");
    const file = await family.api.files.initiate({
      purpose: "evidence",
      name: "Dentist appointment.pdf",
      mediaType: "application/pdf",
      sizeBytes: body.byteLength,
    });
    const put = await raw(
      "northwind",
      family.token,
      `/v1/files/${file.id}/content`,
      { method: "PUT", body },
    );
    expect(put.status).toBe(200);
    const { id } = await family.api.absenceReports.report({
      studentId: me.id,
      kind: "late",
      from: addDays(today, 8),
      to: addDays(today, 8),
      at: "10:00",
      reasonId: reason.id,
      fileId: file.id,
    });
    const mine = await family.api.absenceReports.mine({ studentId: me.id });
    expect(mine.reports.find((row) => row.id === id)).toMatchObject({
      fileId: file.id,
      fileName: "Dentist appointment.pdf",
    });
    const office = await sessionFor("northwind", login("principal"));
    const { reports } = await office.api.absenceReports.inbox({ open: true });
    expect(reports.find((row) => row.id === id)?.fileName).toBe(
      "Dentist appointment.pdf",
    );
    const path = `/v1/files/${file.id}/content`;
    const read = await raw("northwind", office.token, path);
    expect(read.status).toBe(200);
    expect(await read.text()).toContain("Dentist at 9.");
    const teacher = await sessionFor("northwind", login("teacher"));
    expect((await raw("northwind", teacher.token, path)).status).toBe(404);

    const { cell, tenants } = seeded();
    const tenantId = tenants[0]?.tenantId ?? "";
    const [row] = await cell.withWorker(
      { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
      "read",
      (tx) =>
        withPurpose(tx, "custody", (inner) =>
          inner.execute<{ encryption: string; storage_key: string }>(sql`
            select encryption, storage_key from core.files
            where tenant_id = ${tenantId}::uuid and id = ${file.id}::uuid`),
        ),
    );
    expect(row?.encryption).toBe("tenant_dek");
    const atRest = await seeded().files.open(row?.storage_key ?? "");
    const sealed = atRest ? await new Response(atRest).text() : "";
    expect(sealed).not.toContain("Dentist");
    await family.api.absenceReports.withdraw({ id });
  });
});
