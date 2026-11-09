import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import { openOwner } from "../src/context";
import { DemoRefusedError, seedDemoSchool } from "../src/seed";
import { createTenant } from "../src/tenants";
import { CELL, harness, kek, urlFor } from "./harness";

describe("filling a demonstration school", () => {
  test("a school created empty gets a full school whose people the platform cannot write to", async () => {
    const owner = openOwner(urlFor("provisioner"));
    const tenantId = Bun.randomUUIDv7();
    const schoolId = Bun.randomUUIDv7();
    const options = {
      kek,
      cell: CELL,
      tenantId,
      schoolId,
      slug: "lakeside",
      domain: "lakeside.example.com",
      password: "a demonstration password",
    };
    try {
      await owner.asOwner(tenantId, "test", async (tx) => {
        await createTenant(
          tx,
          {
            tenantId,
            kind: "school",
            nameEn: "Lakeside School",
            defaultLocale: "en",
            jurisdictions: ["EG"],
            schools: [
              {
                id: schoolId,
                nameEn: "Lakeside School",
                timeZone: "Africa/Cairo",
                countryCode: "EG",
              },
            ],
          },
          { kek, cell: CELL },
        );
        await tx.execute(sql`
          insert into core.site_settings (tenant_id, org_id, tagline_en)
          values (${tenantId}::uuid, ${schoolId}::uuid, 'Our own words')`);
      });

      const logins = await seedDemoSchool(owner, options);
      expect(logins.filter((login) => login.role === "teacher")).toHaveLength(
        20,
      );
      expect(
        logins.every((login) =>
          login.loginName.endsWith("@lakeside.example.com"),
        ),
      ).toBe(true);

      const { su } = harness();
      const [counts] = await su`
        select
          (select count(*)::int from core.classes
            where tenant_id = ${tenantId}::uuid and class_type = 'homeroom') as homerooms,
          (select count(*)::int from core.enrollments
            where tenant_id = ${tenantId}::uuid and role = 'student' and class_type = 'homeroom') as students,
          (select count(*)::int from core.contact_points
            where tenant_id = ${tenantId}::uuid and kind = 'email') as emails,
          (select count(*)::int from core.contact_points
            where tenant_id = ${tenantId}::uuid and kind = 'phone' and sms_capable) as texts,
          (select count(*)::int from core.attendance_registers
            where tenant_id = ${tenantId}::uuid) as registers,
          (select tagline_en from core.site_settings
            where tenant_id = ${tenantId}::uuid) as tagline`;
      expect(counts).toEqual({
        homerooms: 20,
        students: 400,
        emails: 0,
        texts: 0,
        registers: expect.any(Number),
        tagline: "Our own words",
      });
      expect(counts.registers).toBeGreaterThan(0);

      const clashes = await su`
        select m.teacher_user_id, m.location_id, m.weekday, m.class_period_id,
          count(*)::int as meetings
        from core.class_meetings m
        where m.tenant_id = ${tenantId}::uuid
        group by grouping sets (
          (m.teacher_user_id, m.weekday, m.class_period_id),
          (m.location_id, m.weekday, m.class_period_id))
        having count(*) > 1`;
      expect(clashes).toEqual([]);

      const again = await seedDemoSchool(owner, options).catch(
        (error: unknown) => error,
      );
      expect(again).toBeInstanceOf(DemoRefusedError);
    } finally {
      await owner.close();
    }
  }, 120_000);
});
