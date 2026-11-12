import { schoolYears } from "@faridalms/database/stores/years";
import { BADGE_DAYS, badgeYearEnd } from "@faridalms/domain/badges";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import {
  client,
  login,
  periodOf,
  rejection,
  seeded,
  sessionFor,
  signedIn,
  withoutModules,
} from "./harness";

const YOUNG = "northwind-east";

const before = (day: string) =>
  new Date(Date.parse(`${day}T00:00:00Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10);

/** A teacher of the young school, with a homeroom they teach. */
async function youngTeacher() {
  const school = seeded().tenants[0]?.schools.find((row) => row.slug === YOUNG);
  const name = seeded()
    .tenants[0]?.logins.filter(
      (row) => row.role === "teacher" && row.schoolId === school?.id,
    )
    .at(0)?.loginName;
  if (!name) throw new Error("the seed lacks a teacher of the young school");
  const api = await signedIn(YOUNG, name);
  const homeroom = (await api.classes.mine({})).rows.find(
    (row) => row.group?.own,
  );
  if (!homeroom) throw new Error("the young teacher keeps no homeroom");
  return { api, classId: homeroom.id };
}

async function badgeFor(
  api: Awaited<ReturnType<typeof youngTeacher>>["api"],
  classId: string,
  studentId: string,
) {
  const { badges } = await api.badges.issueBadges({
    classId,
    studentIds: [studentId],
  });
  const secret = badges[0]?.secret;
  if (!secret) throw new Error("no badge was issued");
  return secret;
}

describe("sign-in badges", () => {
  test("a teacher prints a badge that signs a young child in, and a new one stops it", async () => {
    const { api, classId } = await youngTeacher();
    const listed = await api.badges.classBadges({ classId });
    expect(listed.students.length).toBeGreaterThan(0);
    expect(listed.students.every((row) => row.young)).toBe(true);
    const child = listed.students[0];
    if (!child) throw new Error("an empty young homeroom");

    const first = await badgeFor(api, classId, child.userId);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const session = await client(YOUNG).badges.signIn({
      secret: first,
    });
    const signed = client(YOUNG, session.token);
    const me = await signed.identity.currentUser();
    expect(me).toMatchObject({ id: child.userId, profile: "young_student" });
    const after = await api.badges.classBadges({ classId });
    expect(
      after.students.find((row) => row.userId === child.userId)?.badge
        ?.lastUsedAt,
    ).toBeTruthy();

    const second = await badgeFor(api, classId, child.userId);
    expect(
      await rejection(client(YOUNG).badges.signIn({ secret: first })),
    ).toMatchObject({
      code: "BAD_REQUEST",
      message: "auth.invalid_credentials",
    });
    expect(await rejection(signed.identity.currentUser())).toMatchObject({
      code: "UNAUTHORIZED",
    });
    const again = await client(YOUNG).badges.signIn({ secret: second });
    expect(again.workspace).toBe("me");
  });

  test("a stopped badge signs nobody in and ends the session it opened", async () => {
    const { api, classId } = await youngTeacher();
    const child = (await api.badges.classBadges({ classId })).students[1];
    if (!child) throw new Error("a young homeroom of one");
    const secret = await badgeFor(api, classId, child.userId);
    const session = await client(YOUNG).badges.signIn({ secret });
    await api.badges.stopBadge({ classId, studentId: child.userId });
    expect(
      await rejection(client(YOUNG).badges.signIn({ secret })),
    ).toMatchObject({ code: "BAD_REQUEST" });
    expect(
      await rejection(client(YOUNG, session.token).identity.currentUser()),
    ).toMatchObject({ code: "UNAUTHORIZED" });
    expect(
      (await api.badges.classBadges({ classId })).students.find(
        (row) => row.userId === child.userId,
      )?.badge,
    ).toBeNull();
  });

  test("a badge works only at its own school", async () => {
    const { api, classId } = await youngTeacher();
    const child = (await api.badges.classBadges({ classId })).students[2];
    if (!child) throw new Error("a young homeroom of two");
    const secret = await badgeFor(api, classId, child.userId);
    expect(
      await rejection(client("northwind").badges.signIn({ secret })),
    ).toMatchObject({ code: "BAD_REQUEST" });
    expect((await client(YOUNG).badges.signIn({ secret })).workspace).toBe(
      "me",
    );
  });

  test("older students get no badge, and no one prints for a class they do not teach", async () => {
    const teacher = await signedIn("northwind", login("teacher"));
    const homeroom = (await teacher.classes.mine({})).rows.find(
      (row) => row.group?.own,
    );
    if (!homeroom) throw new Error("seed homeroom teacher");
    const listed = await teacher.badges.classBadges({ classId: homeroom.id });
    expect(listed.students.some((row) => row.young)).toBe(false);
    const older = listed.students[0];
    if (!older) throw new Error("an empty homeroom");
    expect(
      await rejection(
        teacher.badges.issueBadges({
          classId: homeroom.id,
          studentIds: [older.userId],
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST", message: "badges.not_young" });

    const principal = await signedIn("northwind", login("principal"));
    const other = (await principal.classes.directory({})).rows.find(
      (row) => row.id !== homeroom.id,
    );
    if (!other) throw new Error("seed second homeroom");
    expect(
      await rejection(teacher.badges.classBadges({ classId: other.id })),
    ).toMatchObject({ code: "NOT_FOUND" });

    const student = await signedIn("northwind", login("student"));
    expect(
      await rejection(student.badges.classBadges({ classId: homeroom.id })),
    ).toMatchObject({ code: "FORBIDDEN" });
  });

  test("a secret that is not a badge reads like a stopped one", async () => {
    expect(
      await rejection(client(YOUNG).badges.signIn({ secret: "x".repeat(43) })),
    ).toMatchObject({
      code: "BAD_REQUEST",
      message: "auth.invalid_credentials",
    });
  });
});

/** A parent whose child is in the young school, signed in there. */
async function youngParent() {
  const school = seeded().tenants[0]?.schools.find((row) => row.slug === YOUNG);
  const name = seeded()
    .tenants[0]?.logins.filter(
      (row) => row.role === "parent" && row.schoolId === school?.id,
    )
    .at(0)?.loginName;
  if (!name) throw new Error("the seed lacks a parent at the young school");
  const { api, token } = await sessionFor(YOUNG, name);
  const child = (await api.home.followed({})).children.find((row) => row.young);
  if (!child) throw new Error("the parent has no young child");
  return { api, token, child };
}

describe("handing a device to a young child", () => {
  test("a parent hands over to their young child and keeps their own session", async () => {
    const { api, child } = await youngParent();
    const session = await api.identity.childSession({
      studentId: child.studentId,
    });
    expect(session.workspace).toBe("me");
    expect(new Date(session.guardianExpiresAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
    const me = await client(YOUNG, session.token).identity.currentUser();
    expect(me).toMatchObject({ id: child.studentId, profile: "young_student" });
    expect((await api.identity.currentUser()).workspace).toBe("family");
  });

  test("only a young child of the family's own is handed a device", async () => {
    const { api } = await youngParent();
    const older = await signedIn("northwind", login("parent"));
    const olderChild = (await older.home.followed({})).children[0];
    if (!olderChild) throw new Error("the seeded parent has no child");
    expect(olderChild.young).toBe(false);
    expect(
      await rejection(
        older.identity.childSession({ studentId: olderChild.studentId }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST", message: "account.not_young" });
    expect(
      await rejection(
        api.identity.childSession({ studentId: olderChild.studentId }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    const { api: teacher } = await youngTeacher();
    expect(
      await rejection(
        teacher.identity.childSession({ studentId: olderChild.studentId }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("badges at the class screen", () => {
  test("a badge held to the camera checks its child in, and a stranger's badge does nothing", async () => {
    const { api, classId } = await youngTeacher();
    const school = seeded().tenants[0]?.schools.find(
      (row) => row.slug === YOUNG,
    );
    const head = seeded()
      .tenants[0]?.logins.filter(
        (row) => row.role === "principal" && row.schoolId === school?.id,
      )
      .at(0)?.loginName;
    if (!head) throw new Error("the young school has no principal");
    const office = await signedIn(YOUNG, head);

    const listed = await api.badges.classBadges({ classId });
    const child = listed.students[0];
    if (!child) throw new Error("an empty young homeroom");
    const secret = await badgeFor(api, classId, child.userId);

    // A school day before today: today's check-in is late or not by the
    // clock the test runs at, and another day's is always on time. The young
    // school keeps a Friday and Saturday weekend.
    let date = before((await office.attendance.day({})).today);
    while ([5, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()))
      date = before(date);
    const register = await api.attendance.register({ classId, date });
    const held = {
      classId,
      date,
      periodId: periodOf(register).id,
      via: "qr" as const,
      badge: secret,
    };

    expect(await rejection(api.attendance.checkIn(held))).toMatchObject({
      code: "FORBIDDEN",
    });
    const rules = await office.attendance.settings();
    const { version: _version, ...kept } = rules;
    const opened = await office.attendance.saveSettings({
      ...kept,
      expectedVersion: rules.version,
      checkInQr: true,
    });

    expect(await api.attendance.checkIn(held)).toEqual({
      studentId: child.userId,
      added: true,
      late: null,
    });
    expect(
      await rejection(
        api.attendance.checkIn({ ...held, badge: "A".repeat(43) }),
      ),
    ).toMatchObject({ code: "NOT_FOUND" });
    // With badges off a badge checks nobody in, and does again once they are on.
    await withoutModules(YOUNG, ["badges"], async () => {
      expect(await rejection(api.attendance.checkIn(held))).toMatchObject({
        code: "NOT_FOUND",
      });
    });
    expect(await api.attendance.checkIn(held)).toMatchObject({
      studentId: child.userId,
    });

    await office.attendance.saveSettings({
      ...kept,
      expectedVersion: opened.version,
    });
  });
});

describe("badges as a school's modules have them", () => {
  test("a badge signs nobody in where badges or the grades they need are off, and signs in again once they are back", async () => {
    const { api, classId } = await youngTeacher();
    const child = (await api.badges.classBadges({ classId })).students[3];
    if (!child) throw new Error("a young homeroom of three");
    const secret = await badgeFor(api, classId, child.userId);
    await withoutModules(YOUNG, ["badges"], async () => {
      expect(
        await rejection(client(YOUNG).badges.signIn({ secret })),
      ).toMatchObject({ code: "NOT_FOUND" });
    });
    await withoutModules(YOUNG, ["grade_levels"], async () => {
      expect(
        await rejection(client(YOUNG).badges.signIn({ secret })),
      ).toMatchObject({
        code: "BAD_REQUEST",
        message: "auth.invalid_credentials",
      });
    });
    expect((await client(YOUNG).badges.signIn({ secret })).workspace).toBe(
      "me",
    );
    // Nor does the office open badges as a way to sign in while they are off.
    const office = await signedIn(YOUNG, login("principal", 0, 1));
    const picked = { studentIds: [child.userId], way: "badges" as const };
    await withoutModules(YOUNG, ["badges"], async () => {
      expect(await rejection(office.people.signInsPlan(picked))).toMatchObject({
        code: "BAD_REQUEST",
        message: "sign_in.way",
      });
      expect(
        await rejection(office.people.createSignIns(picked)),
      ).toMatchObject({ code: "BAD_REQUEST", message: "sign_in.way" });
    });
    expect((await office.people.signInsPlan(picked)).had).toContain(
      child.userId,
    );
  });

  test("a badge printed where there are no school years lasts its days from last use, and one printed in a year stops at its end", async () => {
    const { api, classId } = await youngTeacher();
    const child = (await api.badges.classBadges({ classId })).students[4];
    if (!child) throw new Error("a young homeroom of four");
    const { cell, tenants } = seeded();
    const tenantId = tenants[0]?.tenantId ?? "";
    const untilOf = async () => {
      const [row] = await cell.withWorker(
        { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
        "read",
        (tx) =>
          tx.execute<{ until: string | null; expires_at: string }>(sql`
            select l.metadata ->> 'until' as until, l.expires_at::text as expires_at
            from core.login_identities l
            join core.accounts a on a.tenant_id = l.tenant_id and a.id = l.account_id
            where l.tenant_id = ${tenantId}::uuid and a.user_id = ${child.userId}::uuid
              and l.kind = 'badge' and l.status = 'active' and l.voided_at is null`),
      );
      if (!row?.until) throw new Error("no badge kept");
      return {
        until: Date.parse(row.until),
        expires: Date.parse(row.expires_at),
      };
    };
    const printed = Date.now();
    await withoutModules(YOUNG, ["school_years"], async () => {
      await badgeFor(api, classId, child.userId);
    });
    const yearless = await untilOf();
    expect(yearless.until).toBe(yearless.expires);
    expect(yearless.until - printed).toBeGreaterThan(
      (BADGE_DAYS - 1) * 86_400_000,
    );
    await badgeFor(api, classId, child.userId);
    const inYear = await untilOf();
    const school = tenants[0]?.schools.find((row) => row.slug === YOUNG);
    const years = await cell.withWorker(
      { tenantId, requestId: crypto.randomUUID(), actor: { kind: "system" } },
      "read",
      (tx) => schoolYears(tx, tenantId, school?.id ?? ""),
    );
    const sliding = new Date(printed + BADGE_DAYS * 86_400_000);
    const yearEnd = badgeYearEnd(
      years,
      new Date(printed).toISOString().slice(0, 10),
      sliding,
    );
    expect(yearEnd).not.toEqual(sliding);
    expect(inYear.until).toBe(yearEnd.getTime());
  });
});
