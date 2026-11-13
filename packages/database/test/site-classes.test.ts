import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import { openOwner } from "../src/context";
import {
  publicSiteClasses,
  saveSiteClass,
  siteClassOf,
} from "../src/stores/site-classes";
import { harness, probe, urlFor } from "./harness";

class Undone extends Error {}

const acme = () => {
  const { b } = harness();
  const school = b.schools.find((each) => each.slug === "acme");
  if (!school) throw new Error("the seed makes acme");
  return { tenantId: b.tenantId, orgId: school.id };
};

const listed = (orgId: string) => ({
  text: "select * from app.site_classes($1::uuid, current_date)",
  params: [orgId],
});

const FIELDS = [
  "class_id",
  "title_en",
  "title_ar",
  "description_en",
  "description_ar",
  "level_en",
  "level_ar",
  "picture_key",
  "picture",
  "picture_alt_en",
  "picture_alt_ar",
  "starts_on",
  "ends_on",
  "course_id",
  "teachers_en",
  "teachers_ar",
];

describe("classes on a school's website", () => {
  test("the site role reads the shown classes' public words through the function, and nothing of a class itself", async () => {
    const { tenantId, orgId } = acme();
    const shown = await probe("site", tenantId, [listed(orgId)]);
    expect(shown.error).toBeUndefined();
    expect(
      shown.rows
        .map((row) => String(row.title_en))
        .toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(["Arabic reading circle", "Saturday coding club"]);
    for (const row of shown.rows) expect(Object.keys(row)).toEqual(FIELDS);

    const classes = await probe("cell_owner", tenantId, [
      {
        text: "select count(*)::int as count from core.classes where org_id = $1::uuid and status = 'active'",
        params: [orgId],
      },
    ]);
    expect(Number(classes.rows[0]?.count)).toBeGreaterThan(2);

    for (const table of [
      "core.site_classes",
      "core.classes",
      "core.enrollments",
      "core.users",
    ]) {
      const direct = await probe("site", tenantId, [
        { text: `select * from ${table} limit 1` },
      ]);
      expect(direct.error?.code, table).toBe("42501");
    }
  });

  test("another tenant reads none of the school's classes", async () => {
    const { a } = harness();
    const { orgId } = acme();
    const across = await probe("site", a.tenantId, [listed(orgId)]);
    expect(across.error).toBeUndefined();
    expect(across.rows).toEqual([]);
  });

  test("a class is shown only once its school says so, and a stale save is refused", async () => {
    const { tenantId, orgId } = acme();
    const owner = openOwner(urlFor(null));
    try {
      await owner.asOwner(tenantId, "test", async (tx) => {
        const [hidden] = await tx.execute<{ id: string }>(sql`
          select c.id from core.classes c
          where c.tenant_id = ${tenantId}::uuid and c.org_id = ${orgId}::uuid
            and c.status = 'active' and (upper_inf(c.runs) or upper(c.runs) > current_date)
            and not exists (select 1 from core.site_classes s
              where s.tenant_id = c.tenant_id and s.class_id = c.id and s.status = 'active')
          order by c.code limit 1`);
        if (!hidden) throw new Error("a class acme does not show");
        const [day] = await tx.execute<{ today: string }>(
          sql`select to_char(current_date, 'YYYY-MM-DD') as today`,
        );
        const today = day?.today ?? "";
        const ids = async () =>
          (await publicSiteClasses(tx, { orgId, today })).map(
            (row) => row.classId,
          );
        expect(await ids()).not.toContain(hidden.id);

        const written = {
          tenantId,
          orgId,
          classId: hidden.id,
          shown: false,
          titleEn: "",
          titleAr: "",
          descriptionEn: "Evenings of chess.",
          descriptionAr: "",
          levelEn: "",
          levelAr: "",
          pictureFileId: null,
          pictureAltEn: "",
          pictureAltAr: "",
          pictureKey: null,
          picture: null,
        };
        const first = await saveSiteClass(tx, {
          ...written,
          expectedVersion: 0,
        });
        expect(first).toEqual({ version: 1 });
        expect(
          await saveSiteClass(tx, { ...written, expectedVersion: 0 }),
        ).toBe(null);
        expect(await ids()).not.toContain(hidden.id);

        expect(
          await saveSiteClass(tx, {
            ...written,
            shown: true,
            expectedVersion: 1,
          }),
        ).toEqual({ version: 2 });
        expect(await ids()).toContain(hidden.id);
        expect(
          await saveSiteClass(tx, { ...written, expectedVersion: 1 }),
        ).toBe(null);
        expect(
          (await siteClassOf(tx, { tenantId, classId: hidden.id }))?.shown,
        ).toBe(true);

        const [mine] = (await publicSiteClasses(tx, { orgId, today })).filter(
          (row) => row.classId === hidden.id,
        );
        // With no public title of its own, a class reads by its own.
        expect(mine?.titleEn).toBeTruthy();
        expect(mine?.descriptionEn).toBe("Evenings of chess.");
        throw new Undone();
      });
    } catch (error) {
      if (!(error instanceof Undone)) throw error;
    } finally {
      await owner.close();
    }
  });

  test("a class that has ended drops off", async () => {
    const { tenantId, orgId } = acme();
    const owner = openOwner(urlFor(null));
    try {
      await owner.asOwner(tenantId, "test", async (tx) => {
        const [ended] = await tx.execute<{ id: string }>(sql`
          insert into core.classes (tenant_id, org_id, code, title_en, runs)
          values (${tenantId}::uuid, ${orgId}::uuid, 'ENDED-1', 'Last year''s club',
            daterange('2020-09-01', '2021-06-01'))
          returning id`);
        if (!ended) throw new Error("an ended class");
        await saveSiteClass(tx, {
          tenantId,
          orgId,
          classId: ended.id,
          expectedVersion: 0,
          shown: true,
          titleEn: "",
          titleAr: "",
          descriptionEn: "Over now.",
          descriptionAr: "",
          levelEn: "",
          levelAr: "",
          pictureFileId: null,
          pictureAltEn: "",
          pictureAltAr: "",
          pictureKey: null,
          picture: null,
        });
        const [day] = await tx.execute<{ today: string }>(
          sql`select to_char(current_date, 'YYYY-MM-DD') as today`,
        );
        const rows = await publicSiteClasses(tx, {
          orgId,
          today: day?.today ?? "",
        });
        expect(rows.map((row) => row.classId)).not.toContain(ended.id);
        expect(rows).toHaveLength(2);
        throw new Undone();
      });
    } catch (error) {
      if (!(error instanceof Undone)) throw error;
    } finally {
      await owner.close();
    }
  });
});
