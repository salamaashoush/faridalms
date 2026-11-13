import { SQL } from "bun";
import { describe, expect, test } from "bun:test";

import {
  login,
  rejection,
  seeded,
  signedIn,
  testCell,
  withoutModules,
} from "./harness";

const tenant = () =>
  seeded().tenants.findIndex((row) =>
    row.schools.some((school) => school.slug === "acme"),
  );
const principal = () => signedIn("acme", login("principal", tenant()));
const teacher = () => signedIn("acme", login("teacher", tenant()));

function acme() {
  const school = seeded()
    .tenants.flatMap((row) => row.schools)
    .find((row) => row.slug === "acme");
  if (!school) throw new Error("the seed lacks Acme");
  return school.id;
}

async function adminRun<T>(query: string, values: unknown[]): Promise<T[]> {
  const admin = new SQL(testCell().adminUrl);
  try {
    return (await admin.unsafe(query, values)) as T[];
  } finally {
    await admin.close();
  }
}

/** Puts Acme back as it was seeded: no word chosen. */
const forget = () =>
  adminRun(`delete from core.grade_level_settings where org_id = $1::uuid`, [
    acme(),
  ]);

describe("a school's word for its grades", () => {
  test("is unchosen until set, and then on the face of everyone at the school", async () => {
    const office = await principal();
    try {
      expect(await office.gradeLevels.term()).toEqual({
        term: null,
        version: 0,
      });
      expect((await office.identity.currentUser()).wording).toEqual({});
      const saved = await office.gradeLevels.setTerm({
        term: "level",
        expectedVersion: 0,
      });
      expect(saved.term).toBe("level");
      expect((await (await teacher()).identity.currentUser()).wording).toEqual({
        grade_levels: "level",
      });
      expect(
        await rejection(
          office.gradeLevels.setTerm({ term: "stage", expectedVersion: 0 }),
        ),
      ).toMatchObject({ message: "conflict.version" });
      await office.gradeLevels.setTerm({
        term: "stage",
        expectedVersion: saved.version,
      });
      expect(await office.gradeLevels.term()).toMatchObject({ term: "stage" });
      const [audited] = await adminRun<{ count: number }>(
        `select count(*)::int as count from audit.log
         where action = 'grade_level.term' and object_id = $1::uuid`,
        [acme()],
      );
      expect(audited?.count).toBe(2);
      const choices = await adminRun<{ details: Record<string, unknown> }>(
        `select details from audit.log
         where action = 'grade_level.term' and object_id = $1::uuid
         order by occurred_at`,
        [acme()],
      );
      expect(
        choices.map(({ details }) => ({
          term: details.term,
          from: details.from,
        })),
      ).toEqual([
        { term: "level", from: null },
        { term: "stage", from: "level" },
      ]);
    } finally {
      await forget();
    }
  });

  test("is set only by those who manage the school", async () => {
    const staff = await teacher();
    expect(await rejection(staff.gradeLevels.term())).toMatchObject({
      code: "FORBIDDEN",
    });
    expect(
      await rejection(
        staff.gradeLevels.setTerm({ term: "level", expectedVersion: 0 }),
      ),
    ).toMatchObject({ code: "FORBIDDEN" });
  });

  test("leaves no word on the face where grade levels are off", async () => {
    const office = await principal();
    try {
      await office.gradeLevels.setTerm({ term: "level", expectedVersion: 0 });
      await withoutModules("acme", ["grade_levels"], async () => {
        expect((await office.identity.currentUser()).wording).toEqual({});
        expect(
          await rejection(
            office.gradeLevels.setTerm({ term: "stage", expectedVersion: 1 }),
          ),
        ).toMatchObject({ code: "NOT_FOUND" });
      });
    } finally {
      await forget();
    }
  });
});
