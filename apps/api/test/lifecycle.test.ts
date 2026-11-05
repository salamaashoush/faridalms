import { plainContent } from "@faridalms/domain/content-conversion";
import { SQL } from "bun";
import { describe, expect, test } from "bun:test";

import {
  client,
  login,
  rejection,
  seeded,
  signedIn,
  testCell,
  testDirectory,
} from "./harness";

async function setLifecycle(tenantId: string, lifecycle: string) {
  const sql = new SQL(testCell().adminUrl);
  try {
    await sql`update ops.tenant_registry set lifecycle = ${lifecycle}
      where tenant_id = ${tenantId}::uuid`;
  } finally {
    await sql.close();
  }
}

async function setDirectoryState(tenantId: string, state: string) {
  const sql = new SQL(testDirectory().adminUrl);
  try {
    await sql`update tenants set state = ${state} where id = ${tenantId}::uuid`;
  } finally {
    await sql.close();
  }
}

describe("a paused school", () => {
  test("signs in and reads, and every write but its sessions' is refused", async () => {
    const tenantId = seeded().tenants[1]?.tenantId ?? "";
    await setLifecycle(tenantId, "read_only");
    try {
      const principal = await signedIn("acme", login("principal", 1));
      expect(await principal.identity.currentUser()).toMatchObject({
        school: { slug: "acme" },
        paused: true,
      });
      expect(
        await rejection(
          principal.calendar.save({
            id: "",
            expectedVersion: 0,
            titleEn: "Paused event",
            titleAr: "",
            category: "meeting",
            startsOn: "2026-12-01",
            endsOn: "2026-12-01",
            allDay: true,
            startTime: "",
            endTime: "",
            location: "",
            provisional: false,
            audiences: [{ scope: "school", classId: "", gradeId: "" }],
            description: plainContent("Nothing changes while paused."),
          }),
        ),
      ).toMatchObject({ code: "FORBIDDEN", message: "tenant.paused" });
      await principal.identity.signOut();
      expect(await rejection(principal.identity.currentUser())).toMatchObject({
        code: "UNAUTHORIZED",
      });
    } finally {
      await setLifecycle(tenantId, "active");
    }
  });

  test("a school moving cells keeps its temporary refusal", async () => {
    const tenantId = seeded().tenants[1]?.tenantId ?? "";
    const principal = await signedIn("acme", login("principal", 1));
    await setLifecycle(tenantId, "frozen");
    try {
      expect(await rejection(principal.identity.signOut())).toMatchObject({
        code: "SERVICE_UNAVAILABLE",
        message: "tenant.read_only",
      });
    } finally {
      await setLifecycle(tenantId, "active");
    }
  });

  test("a suspended school's own portal says it is paused, and nobody signs in", async () => {
    const tenantId = seeded().tenants[1]?.tenantId ?? "";
    await setLifecycle(tenantId, "suspended");
    await setDirectoryState(tenantId, "suspended");
    try {
      const face = await client("", undefined, "en", {
        "x-forwarded-for": "198.51.100.77",
      }).identity.portalFace({ school: "acme" });
      expect(face).toMatchObject({
        school: "acme",
        name: { en: "Acme School" },
        paused: true,
        logoKey: null,
        contact: { address: null, phone: null, email: null },
      });
      expect(
        await rejection(signedIn("acme", login("principal", 1))),
      ).toMatchObject({ code: "UNAUTHORIZED" });
    } finally {
      await setDirectoryState(tenantId, "active");
      await setLifecycle(tenantId, "active");
    }
  });

  test("a restricted school works but cannot switch a module on or add an address", async () => {
    const school = seeded().tenants[1]?.schools[0];
    if (!school) throw new Error("no acme");
    const sql = new SQL(testDirectory().adminUrl);
    const restrict = (access: string) =>
      sql`update school_entitlements set access = ${access}
        where school_id = ${school.id}::uuid`;
    await restrict("restricted");
    try {
      const principal = await signedIn("acme", login("principal", 1));
      expect(
        (await principal.identity.currentUser()).contract?.restricted,
      ).toBe(true);
      expect(
        await rejection(
          principal.school.setFeature({ feature: "elearning", enabled: true }),
        ),
      ).toMatchObject({ code: "FORBIDDEN", message: "school.restricted" });
      expect(
        await rejection(
          principal.hosts.add({
            hostname: "restricted.acme-school.example.org",
            role: "site",
          }),
        ),
      ).toMatchObject({ code: "FORBIDDEN", message: "school.restricted" });
      expect((await principal.school.features()).switches).toBeDefined();
    } finally {
      await restrict("full");
      await sql.close();
    }
  });
});
