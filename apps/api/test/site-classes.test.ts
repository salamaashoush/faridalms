import { describe, expect, test } from "bun:test";

import { client, login, rejection, signedIn, withoutModules } from "./harness";

const ACME = 1;
const principal = () => signedIn("acme", login("principal", ACME));
const visitor = () => client("acme").site;

const PUBLIC_FIELDS = [
  "id",
  "title",
  "description",
  "level",
  "picture",
  "startsOn",
  "endsOn",
  "courseId",
  "teachers",
].toSorted();

const written = (classId: string, expectedVersion: number) => ({
  classId,
  shown: true,
  titleEn: "Chess after school",
  titleAr: "الشطرنج بعد المدرسة",
  descriptionEn: "Openings, endgames and a tournament at the end of term.",
  descriptionAr: "الافتتاحيات والنهايات وبطولة في آخر الفصل.",
  levelEn: "",
  levelAr: "",
  pictureFileId: null,
  pictureAltEn: "",
  pictureAltAr: "",
  expectedVersion,
});

/** A class of the school it has not put on its website. */
async function hiddenClass() {
  const api = await principal();
  const { choices } = await api.site.siteClasses();
  const hidden = choices.find((row) => !row.shown);
  if (!hidden) throw new Error("a class acme does not show");
  return { api, hidden };
}

describe("classes on the website", () => {
  test("a visitor reads only the chosen words of the classes shown, in their language", async () => {
    const english = await visitor().publicSiteClassList({
      school: "acme",
      locale: "en",
    });
    expect(english.classes.map((row) => row.title).toSorted()).toEqual([
      "Arabic reading circle",
      "Saturday coding club",
    ]);
    for (const row of english.classes)
      expect(Object.keys(row).toSorted()).toEqual(PUBLIC_FIELDS);
    const club = english.classes.find(
      (row) => row.title === "Saturday coding club",
    );
    expect(club?.level).toBe("Beginners welcome");

    const arabic = await visitor().publicSiteClassList({
      school: "acme",
      locale: "ar",
    });
    expect(arabic.classes.map((row) => row.title).toSorted()).toEqual([
      "حلقة القراءة العربية",
      "نادي البرمجة يوم السبت",
    ]);
  });

  test("no roster, code or unshown class reaches a visitor", async () => {
    const { api, hidden } = await hiddenClass();
    const shown = await visitor().publicSiteClassList({ school: "acme" });
    expect(shown.classes.map((row) => row.id)).not.toContain(hidden.id);
    const said = JSON.stringify(shown);
    for (const row of shown.classes) {
      const record = await api.classes.record({ id: row.id });
      expect(said).not.toContain(record.code);
      for (const student of record.roster)
        for (const name of [student.fullNameEn, student.fullNameAr])
          if (name) expect(said).not.toContain(name);
    }
  });

  test("another school's visitor and staff reach none of its classes", async () => {
    const { hidden } = await hiddenClass();
    const elsewhere = await client("northwind").site.publicSiteClassList({
      school: "northwind",
    });
    expect(elsewhere.classes).toEqual([]);
    const other = await signedIn("northwind", login("principal"));
    expect(
      await rejection(other.site.classWebsite({ classId: hidden.id })),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(
      await rejection(other.site.saveClassWebsite(written(hidden.id, 0))),
    ).toMatchObject({ code: "NOT_FOUND" });
  });

  test("whoever keeps the classes shows one, a teacher may not, and taking it off hides it", async () => {
    const { api, hidden } = await hiddenClass();
    const teacher = await signedIn("acme", login("teacher", ACME));
    expect(
      await rejection(teacher.site.saveClassWebsite(written(hidden.id, 0))),
    ).toMatchObject({ code: "FORBIDDEN" });

    expect(
      await rejection(
        api.site.saveClassWebsite({
          ...written(hidden.id, 0),
          descriptionEn: "",
          descriptionAr: "",
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST", message: "site.class_description" });

    const before = await api.site.classWebsite({ classId: hidden.id });
    expect(before).toMatchObject({ version: 0, shown: false });
    const saved = await api.site.saveClassWebsite(
      written(hidden.id, before.version),
    );
    const listed = await visitor().publicSiteClassList({ school: "acme" });
    expect(listed.classes.map((row) => row.title)).toContain(
      "Chess after school",
    );
    expect(
      await rejection(
        api.site.saveClassWebsite(written(hidden.id, before.version)),
      ),
    ).toMatchObject({ code: "CONFLICT" });

    await api.site.saveClassWebsite({
      ...written(hidden.id, saved.version),
      shown: false,
    });
    const after = await visitor().publicSiteClassList({ school: "acme" });
    expect(after.classes.map((row) => row.id)).not.toContain(hidden.id);
  });

  test("without the website the classes are not found, publicly or on the record", async () => {
    const { hidden } = await hiddenClass();
    await withoutModules("acme", ["website"], async () => {
      const api = await principal();
      expect(
        await rejection(api.site.classWebsite({ classId: hidden.id })),
      ).toMatchObject({ code: "NOT_FOUND" });
      expect(
        await rejection(visitor().publicSiteClassList({ school: "acme" })),
      ).toMatchObject({ code: "NOT_FOUND" });
    });
  });
});
