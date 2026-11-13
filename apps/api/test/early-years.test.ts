import { addDays } from "@faridalms/domain/school";
import { describe, expect, test } from "bun:test";

import {
  client,
  login,
  rejection,
  seeded,
  signedIn,
  withoutModules,
} from "./harness";

const SCHOOL = "acme";
const ACME = 1;
const GRADES_SCHOOL = "northwind-east";

async function principal() {
  return signedIn(SCHOOL, login("principal", ACME));
}

type Api = Awaited<ReturnType<typeof principal>>;

/** A new class running from today, saved with these parts. */
async function newClass(
  api: Api,
  code: string,
  parts: Record<string, unknown>,
) {
  const options = await api.classes.options();
  const teacher = options.teachers.find((row) => row.teaches);
  if (!teacher) throw new Error("seed teacher");
  const saved = await api.classes.save({
    startsOn: options.today,
    endsOn: addDays(options.today, 120),
    parts,
    code,
    titleEn: `Little explorers ${code}`,
    titleAr: `المستكشفون الصغار ${code}`,
    teacherIds: [teacher.id],
  });
  return { id: saved.id };
}

/** A seeded learner of the school. */
async function learner(api: Api, index: number) {
  const found = (await api.people.students({})).rows[index];
  if (!found) throw new Error("seed student");
  return found.id;
}

/** Whether the learner is young, as the badges of a class they learn in see them. */
async function youngIn(api: Api, classId: string, studentId: string) {
  return (await api.badges.classBadges({ classId })).students.find(
    (row) => row.userId === studentId,
  )?.young;
}

/** Marks a class young or not by saving it again as it is. */
async function markClass(api: Api, classId: string, young: boolean) {
  const record = await api.classes.record({ id: classId });
  return api.classes.save({
    id: classId,
    expectedVersion: record.version,
    code: record.code,
    titleEn: record.titleEn ?? "",
    titleAr: record.titleAr ?? "",
    teacherIds: record.teachers.map((row) => row.userId),
    startsOn: record.runs.from,
    endsOn: record.runs.to ? addDays(record.runs.to, -1) : "",
    parts: { young: { young } },
  });
}

describe("a class for young children, without grades", () => {
  test("makes its learner young: a badge signs them in to the young home", async () => {
    await withoutModules(SCHOOL, ["grade_levels"], async () => {
      const api = await principal();
      const child = await learner(api, 0);
      const made = await newClass(api, "EY-1", { young: { young: true } });
      const record = await api.classes.record({ id: made.id });
      expect(record.young).toBe(true);
      expect(await api.earlyYears.classMark({ classId: made.id })).toEqual({
        young: true,
      });
      await api.classes.enrol({ studentId: child, classId: made.id });
      expect(await youngIn(api, made.id, child)).toBe(true);

      const { badges } = await api.badges.issueBadges({
        classId: made.id,
        studentIds: [child],
      });
      const secret = badges[0]?.secret;
      if (!secret) throw new Error("no badge was issued");
      const session = await client(SCHOOL).badges.signIn({ secret });
      expect(session.workspace).toBe("me");
      expect(
        await client(SCHOOL, session.token).identity.currentUser(),
      ).toMatchObject({ id: child, profile: "young_student" });

      await markClass(api, made.id, false);
      expect((await api.classes.record({ id: made.id })).young).toBe(false);
      expect(await youngIn(api, made.id, child)).toBe(false);
      expect(
        await rejection(client(SCHOOL).badges.signIn({ secret })),
      ).toMatchObject({ code: "BAD_REQUEST" });
      expect(
        await rejection(
          api.badges.issueBadges({ classId: made.id, studentIds: [child] }),
        ),
      ).toMatchObject({ code: "BAD_REQUEST", message: "badges.not_young" });
    });
  });

  test("a learner in a young class and an older one is young", async () => {
    const api = await principal();
    const child = await learner(api, 1);
    const young = await newClass(api, "EY-2", { young: { young: true } });
    const older = await newClass(api, "EY-3", { young: { young: false } });
    await api.classes.enrol({ studentId: child, classId: older.id });
    expect(await youngIn(api, older.id, child)).toBe(false);
    await api.classes.enrol({ studentId: child, classId: young.id });
    expect(await youngIn(api, older.id, child)).toBe(true);
    expect((await api.classes.record({ id: older.id })).young).toBe(false);
    await markClass(api, young.id, false);
    expect(await youngIn(api, older.id, child)).toBe(false);
  });

  test("only whoever manages classes marks one young", async () => {
    const api = await principal();
    const made = await newClass(api, "EY-4", {});
    const teacher = await signedIn(SCHOOL, login("teacher", ACME));
    expect(await rejection(markClass(teacher, made.id, true))).toMatchObject({
      code: "FORBIDDEN",
    });
    expect((await api.classes.record({ id: made.id })).young).toBe(false);
  });
});

describe("young children across the modules", () => {
  test("without the early years no class is young, and no part or badge answers", async () => {
    await withoutModules(SCHOOL, ["early_years"], async () => {
      const api = await principal();
      expect(
        await rejection(newClass(api, "EY-5", { young: { young: true } })),
      ).toMatchObject({ code: "BAD_REQUEST", message: "classes.part_unknown" });
      const made = await newClass(api, "EY-6", {});
      expect(
        await rejection(api.badges.classBadges({ classId: made.id })),
      ).toMatchObject({ code: "NOT_FOUND" });
      expect(
        await rejection(api.earlyYears.classMark({ classId: made.id })),
      ).toMatchObject({ code: "NOT_FOUND" });
    });
  });

  test("with neither the early years nor grades, badges answer not found", async () => {
    await withoutModules(SCHOOL, ["early_years", "grade_levels"], async () => {
      const api = await principal();
      const made = await newClass(api, "EY-7", {});
      expect(
        await rejection(api.badges.classBadges({ classId: made.id })),
      ).toMatchObject({ code: "NOT_FOUND" });
    });
  });

  test("a young grade still makes its learners young where the early years are on", async () => {
    const school = seeded().tenants[0]?.schools.find(
      (row) => row.slug === GRADES_SCHOOL,
    );
    const name = seeded().tenants[0]?.logins.find(
      (row) => row.role === "teacher" && row.schoolId === school?.id,
    )?.loginName;
    if (!name) throw new Error("the seed lacks a teacher of the young school");
    const api = await signedIn(GRADES_SCHOOL, name);
    const homeroom = (await api.classes.mine({})).rows.find(
      (row) => row.group?.own,
    );
    if (!homeroom) throw new Error("the young teacher keeps no homeroom");
    const young = async () =>
      (await api.badges.classBadges({ classId: homeroom.id })).students.map(
        (row) => row.young,
      );
    expect(await young()).not.toContain(false);
    expect((await api.classes.record({ id: homeroom.id })).young).toBe(true);
    await withoutModules(GRADES_SCHOOL, ["grade_levels"], async () => {
      expect(await young()).not.toContain(true);
      expect((await api.classes.record({ id: homeroom.id })).young).toBe(false);
    });
    await withoutModules(GRADES_SCHOOL, ["early_years"], async () => {
      expect(
        await rejection(api.badges.classBadges({ classId: homeroom.id })),
      ).toMatchObject({ code: "NOT_FOUND" });
      expect((await api.classes.record({ id: homeroom.id })).young).toBe(false);
    });
  });
});
