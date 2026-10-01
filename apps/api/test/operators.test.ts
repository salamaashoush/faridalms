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
      const [latest, earlier] = await admin.changes({ id: school.id });
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
