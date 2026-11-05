import type { ModuleId } from "@faridalms/domain/modules";

import { openDirectoryAdmin } from "@faridalms/database/directory/admin";
import { BASIC_MODULES, MODULE_IDS } from "@faridalms/domain/modules";
import {
  availableModules,
  BASIC_ENTITLEMENTS,
  settableOf,
} from "@faridalms/domain/plans";
import { describe, expect, test } from "bun:test";

import {
  client,
  login,
  rejection,
  seeded,
  setPlan,
  signedIn,
  testDirectory,
} from "./harness";

describe("the operator console's directory access", () => {
  test("sets a school's entitlements, records who and why, and the cell reads them", async () => {
    const { directory, tenants } = seeded();
    const school = tenants[0]?.schools.find((row) => row.slug === "northwind");
    if (!school) throw new Error("no northwind school");
    const admin = openDirectoryAdmin(testDirectory().operatorUrl);
    const seededEntitlements = settableOf(
      (await admin.school(school.id))?.entitlements ?? BASIC_ENTITLEMENTS,
    );
    try {
      const listed = await admin.schools();
      expect(listed.some((row) => row.id === school.id)).toBe(true);
      const larger = {
        ...settableOf(BASIC_ENTITLEMENTS),
        poolBytes: 200 * 1024 ** 3,
        moduleBytes: 2 * 1024 ** 3,
        modules: [...BASIC_MODULES, "elearning", "early_years"] as ModuleId[],
        students: 450,
        customDomains: 2,
        trialEndsOn: "2026-12-01",
        notice: "plan_ends_soon" as const,
      };
      await admin.saveEntitlements({
        schoolId: school.id,
        entitlements: larger,
        operatorId: "salama-test",
        reason: "Upgraded to the larger plan",
      });
      const saved = (await admin.school(school.id))?.entitlements;
      expect(saved).toMatchObject({ ...larger, access: "full" });
      expect((await directory.bySlug("northwind"))?.entitlements).toEqual(
        saved ?? BASIC_ENTITLEMENTS,
      );
      const principal = await signedIn("northwind", login("principal"));
      expect((await principal.identity.currentUser()).contract).toEqual({
        notice: "plan_ends_soon",
        trialEndsOn: "2026-12-01",
        students: null,
        staffAccounts: null,
        emails: null,
      });
      const teacher = await signedIn("northwind", login("teacher"));
      expect((await teacher.identity.currentUser()).contract).toBeNull();

      await admin.saveEntitlements({
        schoolId: school.id,
        entitlements: seededEntitlements,
        operatorId: "salama-test",
        reason: "Back to what the seed gave it",
      });
      const restored = (await admin.school(school.id))?.entitlements;
      expect(restored).toMatchObject(seededEntitlements);
      expect(restored?.revision).toBe((saved?.revision ?? 0) + 1);
      const [latest, earlier] = await admin.changes({ id: school.id });
      expect(latest).toMatchObject({
        actor: "operator:salama-test",
        subjectType: "school",
        action: "entitlements.update",
        before: { ...larger, access: "full" },
        after: seededEntitlements,
        reason: "Back to what the seed gave it",
      });
      expect(earlier).toMatchObject({
        action: "entitlements.update",
        after: larger,
      });
    } finally {
      await admin.close();
    }
  });

  test("a school the directory holds no entitlements for has Basic", () => {
    expect(BASIC_ENTITLEMENTS.modules).toEqual([...BASIC_MODULES]);
    expect(availableModules(BASIC_ENTITLEMENTS)).not.toContain("website");
  });
});

describe("official exam sessions", () => {
  test("an operator adds a session and moves its date, and cells read it", async () => {
    const { directory } = seeded();
    const admin = openDirectoryAdmin(testDirectory().operatorUrl);
    try {
      const official = {
        board: "jcq" as const,
        sitsIn: "2031-06-01",
        retired: false,
        operatorId: "salama-test",
      };
      const id = await admin.saveSeries({
        ...official,
        keepUntil: "2031-10-31",
        reason: "Published in the 2030-31 regulations",
      });
      expect(id).toBe("jcq-2031-06");
      await admin.saveSeries({
        ...official,
        keepUntil: "2031-11-14",
        reason: "Board moved the review deadline",
      });
      directory.forget();
      expect(
        (await directory.examSeries()).find((row) => row.id === id),
      ).toEqual({
        id,
        board: "jcq",
        sitsIn: "2031-06-01",
        keepUntil: "2031-11-14",
        retired: false,
      });
      const [moved, added] = await admin.changes({ type: "exam_series" });
      expect(moved).toMatchObject({
        subjectId: id,
        action: "series.update",
        before: { keepUntil: "2031-10-31", retired: false },
        after: { keepUntil: "2031-11-14", retired: false },
        reason: "Board moved the review deadline",
      });
      expect(added).toMatchObject({ action: "series.create", before: null });
    } finally {
      await admin.close();
    }
  });
});

describe("modules a plan offers", () => {
  test("a school switches on only what its plan includes, and loses what the plan drops", async () => {
    const school = seeded().tenants[0]?.schools.find(
      (row) => row.slug === "northwind",
    );
    if (!school) throw new Error("no northwind school");
    const principal = await signedIn("northwind", login("principal"));
    try {
      await setPlan(school.id, { modules: ["elearning"] });
      expect((await principal.school.features()).available).toEqual([
        "elearning",
      ]);
      expect(
        await rejection(
          principal.school.setFeature({
            feature: "early_years",
            enabled: true,
          }),
        ),
      ).toMatchObject({ message: "feature.not_in_plan" });
      await principal.school.setFeature({
        feature: "elearning",
        enabled: true,
      });
      expect((await principal.identity.currentUser()).modules).toMatchObject({
        elearning: true,
        early_years: false,
      });

      await setPlan(school.id, { modules: ["early_years"] });
      // A module the plan leaves out answers as if it were not there; core
      // answers whatever the plan.
      expect(await rejection(principal.attendance.settings())).toMatchObject({
        code: "NOT_FOUND",
      });
      expect((await principal.identity.currentUser()).modules).toMatchObject({
        attendance: false,
        early_years: false,
      });
      // A plan may name every module the registry has.
      await setPlan(school.id, { modules: [...MODULE_IDS] });
      await setPlan(school.id, { modules: ["early_years"] });
      // Its public website is not there either.
      expect(
        await rejection(
          client("northwind").site.publicSite({ school: "northwind" }),
        ),
      ).toMatchObject({ code: "NOT_FOUND" });
      expect((await principal.identity.currentUser()).modules.elearning).toBe(
        false,
      );
      const { switches } = await principal.school.features();
      expect(switches.elearning).toBe(true);
    } finally {
      await setPlan(school.id, null);
    }
  });
});
