import { openDirectoryAdmin } from "@faridalms/database/directory/admin";
import { describe, expect, test } from "bun:test";

import {
  login,
  rejection,
  seeded,
  setPlan,
  signedIn,
  testDirectory,
} from "./harness";

describe("the operator console's directory access", () => {
  test("sets a school's plan, records who and why, and the cell reads it", async () => {
    const { directory, tenants } = seeded();
    const school = tenants[0]?.schools.find((row) => row.slug === "northwind");
    if (!school) throw new Error("no northwind school");
    const admin = openDirectoryAdmin(testDirectory().operatorUrl);
    try {
      const listed = await admin.schools();
      expect(listed.some((row) => row.id === school.id)).toBe(true);
      const plan = {
        poolBytes: 200 * 1024 ** 3,
        classBytes: null,
        moduleBytes: 2 * 1024 ** 3,
        personBytes: null,
        modules: ["elearning", "early_years"],
      };
      await admin.savePlan({
        schoolId: school.id,
        plan,
        operatorId: "salama-test",
        reason: "Upgraded to the larger plan",
      });
      expect((await admin.school(school.id))?.plan).toEqual(plan);
      expect((await directory.bySlug("northwind"))?.plan).toEqual(plan);

      await admin.savePlan({
        schoolId: school.id,
        plan: null,
        operatorId: "salama-test",
        reason: "Back to the defaults",
      });
      expect((await admin.school(school.id))?.plan).toBeNull();
      const [latest, earlier] = await admin.changes(school.id);
      expect(latest).toMatchObject({
        actor: "operator:salama-test",
        subjectType: "school",
        action: "plan.update",
        before: plan,
        after: null,
        reason: "Back to the defaults",
      });
      expect(earlier).toMatchObject({ before: null, after: plan });
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
      expect((await principal.identity.currentUser()).features).toMatchObject({
        elearning: true,
        early_years: false,
      });

      await setPlan(school.id, { modules: ["early_years"] });
      expect((await principal.identity.currentUser()).features.elearning).toBe(
        false,
      );
      const { switches } = await principal.school.features();
      expect(switches.elearning).toBe(true);
    } finally {
      await setPlan(school.id, null);
    }
  });
});
