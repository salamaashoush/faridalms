import { SQL } from "bun";
import { describe, expect, test } from "bun:test";

import { login, seeded, signedIn, testDirectory } from "./harness";

async function directoryNames(slug: string) {
  const sql = new SQL(testDirectory().adminUrl);
  try {
    const [row] = await sql<
      { name_en: string | null; name_ar: string | null }[]
    >`
      select name_en, name_ar from schools where slug = ${slug}`;
    return row ?? null;
  } finally {
    await sql.close();
  }
}

describe("a school renamed in its settings", () => {
  test("takes the new names into the directory, which routes and lists it", async () => {
    const tenant = seeded().tenants.findIndex((row) =>
      row.schools.some((school) => school.slug === "fernhill"),
    );
    const api = await signedIn("fernhill", login("principal", tenant));
    const profile = await api.school.profile();
    const save = (nameEn: string, nameAr: string, version: number) =>
      api.school.saveProfile({
        expectedVersion: version,
        nameEn,
        nameAr,
        identifier: profile.identifier ?? "",
        timeZone: profile.timeZone ?? "Africa/Cairo",
        defaultLocale: profile.defaultLocale,
        weekStart: profile.weekStart,
        weekendDays: profile.weekendDays,
        secondaryCalendar: profile.secondaryCalendar ?? "",
        phone: profile.phone ?? "",
        email: profile.email ?? "",
      });
    const saved = await save(
      "Fernhill Academy",
      "أكاديمية فيرنهيل",
      profile.version,
    );
    try {
      expect(await directoryNames("fernhill")).toEqual({
        name_en: "Fernhill Academy",
        name_ar: "أكاديمية فيرنهيل",
      });
    } finally {
      await save(profile.nameEn ?? "", profile.nameAr ?? "", saved.version);
    }
  });
});
