import { describe, expect, test } from "bun:test";

import type { TenantSpec } from "../src/tenants";

import { openOwner } from "../src/context";
import { replaceContact } from "../src/stores/persons";
import { schoolAdministrator, setStaffRoles } from "../src/stores/staff";
import { insertPerson } from "../src/stores/students";
import { createTenant, tenantLifecycle } from "../src/tenants";
import { CELL, harness, kek, urlFor } from "./harness";

const today = new Date().toISOString().slice(0, 10);

function spec(
  tenantId: string,
  schoolId: string,
): TenantSpec & {
  tenantId: string;
} {
  return {
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
  };
}

async function registered(tenantId: string) {
  const rows = await harness()
    .su`select lifecycle from ops.tenant_registry where tenant_id = ${tenantId}::uuid`;
  return rows.length;
}

describe("provisioning a tenant", () => {
  test("the provisioner login creates a tenant as the owner, and a failure later in the same transaction leaves nothing", async () => {
    const owner = openOwner(urlFor("provisioner"));
    try {
      const tenantId = Bun.randomUUIDv7();
      const schoolId = Bun.randomUUIDv7();
      const failed = await owner
        .asOwner(tenantId, "test", async (tx) => {
          await createTenant(tx, spec(tenantId, schoolId), { kek, cell: CELL });
          expect(await tenantLifecycle(tx, tenantId)).toBe("active");
          throw new Error("the email was not sent");
        })
        .catch((error: unknown) => error);
      expect(failed).toBeInstanceOf(Error);
      expect(await registered(tenantId)).toBe(0);

      const created = await owner.asOwner(tenantId, "test", async (tx) => {
        expect(await tenantLifecycle(tx, tenantId)).toBeNull();
        return createTenant(tx, spec(tenantId, schoolId), { kek, cell: CELL });
      });
      expect(created).toEqual({
        tenantId,
        rootOrgId: schoolId,
        schoolIds: [schoolId],
      });
      expect(await registered(tenantId)).toBe(1);
    } finally {
      await owner.close();
    }
  });

  test("a school's administrator is found by email, or else the first one appointed", async () => {
    const owner = openOwner(urlFor("provisioner"));
    try {
      const tenantId = Bun.randomUUIDv7();
      const schoolId = Bun.randomUUIDv7();
      await owner.asOwner(tenantId, "test", async (tx) => {
        await createTenant(tx, spec(tenantId, schoolId), { kek, cell: CELL });
        const scope = { tenantId, schoolId, today };
        const person = async (
          given: string,
          email: string,
          role: "system_administrator" | "site_administrator" | "teacher",
        ) => {
          const { id } = await insertPerson(tx, {
            tenantId,
            schoolId,
            names: {
              en: { given, middle: null, family: "Ashoush" },
              ar: { given: null, middle: null, family: null },
            },
          });
          await replaceContact(tx, {
            tenantId,
            userId: id,
            kind: "email",
            label: "work",
            value: email,
            normalized: email,
          });
          await setStaffRoles(tx, scope, id, {
            roles: [role],
            positionId: null,
            titleEn: null,
            titleAr: null,
          });
          return id;
        };
        expect(await schoolAdministrator(tx, scope, null)).toBeNull();
        const first = await person(
          "Salama",
          "salama@lakeside.example.com",
          "system_administrator",
        );
        const second = await person(
          "Heba",
          "heba@lakeside.example.com",
          "site_administrator",
        );
        await person("Omar", "omar@lakeside.example.com", "teacher");
        expect(await schoolAdministrator(tx, scope, null)).toBe(first);
        expect(
          await schoolAdministrator(tx, scope, "Heba@Lakeside.example.com"),
        ).toBe(second);
        expect(
          await schoolAdministrator(tx, scope, "omar@lakeside.example.com"),
        ).toBeNull();
        await setStaffRoles(tx, scope, first, {
          roles: ["teacher"],
          positionId: null,
          titleEn: null,
          titleAr: null,
        });
        expect(await schoolAdministrator(tx, scope, null)).toBe(second);
      });
    } finally {
      await owner.close();
    }
  });
});
