import { plainContent } from "@faridalms/domain/content-conversion";
import { describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";

import { openOwner } from "../src/context";
import { DemoRefusedError, seedDemoSchool } from "../src/seed";
import { saveDocument } from "../src/stores/documents";
import { openEnquiryConversation } from "../src/stores/enquiries";
import { postMessage } from "../src/stores/messages";
import { insertPerson } from "../src/stores/students";
import { siteEnquiries } from "../src/tables/index";
import { createTenant } from "../src/tenants";
import { CELL, harness, kek, urlFor } from "./harness";

describe("filling a demonstration school", () => {
  test("the owner it opens works under its own transaction limit, not the provisioner login's minute", async () => {
    const tenantId = harness().a.tenantId;
    for (const [options, expected] of [
      [{}, "1min"],
      [{ transactionTimeout: "15min" }, "15min"],
    ] as const) {
      const owner = openOwner(urlFor("provisioner"), options);
      try {
        const [row] = await owner.asOwner(tenantId, "test", (tx) =>
          tx.execute<{ limit: string }>(
            sql`select current_setting('transaction_timeout') as limit`,
          ),
        );
        expect(row?.limit).toBe(expected);
      } finally {
        await owner.close();
      }
    }
  });

  test("a school created empty gets a full school whose people the platform cannot write to, and keeps what it had", async () => {
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
      const enquiry = await owner.asOwner(tenantId, "test", async (tx) => {
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
        const [asked] = await tx
          .insert(siteEnquiries)
          .values({
            tenantId,
            orgId: schoolId,
            locale: "en",
            purpose: "visit",
            name: "Salama Ashoush",
            phone: "+20 122 555 0100",
            message: "Could we visit before we apply?",
          })
          .returning({ id: siteEnquiries.id });
        if (!asked) throw new Error("no enquiry");
        const threadId = await openEnquiryConversation(tx, {
          tenantId,
          enquiryId: asked.id,
        });
        if (!threadId) throw new Error("no conversation");
        // A reply written in the composer: its document is frozen and says
        // more than the message's plain words.
        const { id: officeId } = await insertPerson(tx, {
          tenantId,
          schoolId,
          names: {
            en: { given: "Salama", middle: null, family: "Ashoush" },
            ar: { given: null, middle: null, family: null },
          },
        });
        const reply = await postMessage(tx, {
          tenantId,
          threadId,
          authorId: officeId,
          body: "Tuesday at ten suits us.",
        });
        await saveDocument(tx, {
          tenantId,
          orgId: schoolId,
          host: { type: "message", id: reply.id },
          content: plainContent(
            "Tuesday at ten suits us, at the front gate.",
          ) as unknown as Record<string, unknown>,
          plainText: "Tuesday at ten suits us, at the front gate.",
          mediaIds: [],
          userId: officeId,
          frozen: true,
        });
        return threadId;
      });
      const { su } = harness();
      const before = await su`
        select x.id, d.id as document from core.messages x
        left join core.documents d on d.tenant_id = x.tenant_id
          and d.host_type = 'message' and d.host_id = x.id
        where x.tenant_id = ${tenantId}::uuid and x.thread_id = ${enquiry}::uuid
        order by x.id`;
      expect(before.length).toBeGreaterThan(0);

      const logins = await seedDemoSchool(owner, options);
      expect(logins.filter((login) => login.role === "teacher")).toHaveLength(
        20,
      );
      expect(
        logins.every((login) =>
          login.loginName.endsWith("@lakeside.example.com"),
        ),
      ).toBe(true);

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
      expect(
        await su`
        select x.id, d.id as document from core.messages x
        left join core.documents d on d.tenant_id = x.tenant_id
          and d.host_type = 'message' and d.host_id = x.id
        where x.tenant_id = ${tenantId}::uuid and x.thread_id = ${enquiry}::uuid
        order by x.id`,
      ).toEqual(before);

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
