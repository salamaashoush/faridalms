import { describe, expect, test } from "bun:test";

import { client, login, rejection, seeded, signedIn } from "./harness";

const YOUNG = "northwind-east";

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
    (row) => row.classType === "homeroom",
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
    const session = await client(YOUNG).identity.badgeSignIn({
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
      await rejection(client(YOUNG).identity.badgeSignIn({ secret: first })),
    ).toMatchObject({
      code: "BAD_REQUEST",
      message: "auth.invalid_credentials",
    });
    expect(await rejection(signed.identity.currentUser())).toMatchObject({
      code: "UNAUTHORIZED",
    });
    const again = await client(YOUNG).identity.badgeSignIn({ secret: second });
    expect(again.workspace).toBe("me");
  });

  test("a stopped badge signs nobody in and ends the session it opened", async () => {
    const { api, classId } = await youngTeacher();
    const child = (await api.badges.classBadges({ classId })).students[1];
    if (!child) throw new Error("a young homeroom of one");
    const secret = await badgeFor(api, classId, child.userId);
    const session = await client(YOUNG).identity.badgeSignIn({ secret });
    await api.badges.stopBadge({ classId, studentId: child.userId });
    expect(
      await rejection(client(YOUNG).identity.badgeSignIn({ secret })),
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
      await rejection(client("northwind").identity.badgeSignIn({ secret })),
    ).toMatchObject({ code: "BAD_REQUEST" });
    expect(
      (await client(YOUNG).identity.badgeSignIn({ secret })).workspace,
    ).toBe("me");
  });

  test("older students get no badge, and no one prints for a class they do not teach", async () => {
    const teacher = await signedIn("northwind", login("teacher"));
    const homeroom = (await teacher.classes.mine({})).rows.find(
      (row) => row.classType === "homeroom",
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
      await rejection(
        client(YOUNG).identity.badgeSignIn({ secret: "x".repeat(43) }),
      ),
    ).toMatchObject({
      code: "BAD_REQUEST",
      message: "auth.invalid_credentials",
    });
  });
});
