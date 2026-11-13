import { describe, expect, it } from "vitest";

import type {
  OverrideTerms,
  PlanTerms,
  SubscriptionItemTerms,
} from "./subscriptions";

import { BASIC_MODULES } from "./modules";
import { BASIC_ENTITLEMENTS, settableOf } from "./plans";
import { entitlementsFor, usableModules } from "./subscriptions";

const GIB = 1024 ** 3;

const standard: PlanTerms = {
  modules: [...BASIC_MODULES, "website", "admissions", "custom_domains"],
  limits: {
    poolBytes: 100 * GIB,
    classBytes: GIB,
    moduleBytes: GIB,
    personBytes: GIB / 2,
    students: 400,
    staffAccounts: 50,
    videoHours: null,
    customDomains: 2,
    emailPerMonth: 20_000,
    captionMinutes: 0,
  },
};

const item = (
  terms: Partial<SubscriptionItemTerms>,
): SubscriptionItemTerms => ({
  plan: null,
  addOn: null,
  quantity: 1,
  schoolIds: [],
  startsOn: "2026-09-01",
  endsOn: null,
  ...terms,
});

const override = (terms: Partial<OverrideTerms>): OverrideTerms => ({
  schoolId: null,
  module: null,
  granted: null,
  limitKey: null,
  value: null,
  startsOn: "2026-09-01",
  endsOn: null,
  ...terms,
});

const base = {
  schoolId: "school-a",
  day: "2026-11-05",
  overrides: [],
  trialEndsOn: null,
  notice: null,
};

describe("a school's entitlements from its subscription", () => {
  it("is Basic where no plan covers the school", () => {
    expect(entitlementsFor({ ...base, items: [] })).toEqual(
      settableOf(BASIC_ENTITLEMENTS),
    );
  });

  it("takes the plan's modules and limits", () => {
    const entitled = entitlementsFor({
      ...base,
      items: [item({ plan: standard })],
    });
    expect(entitled.modules).toContain("website");
    expect(entitled.modules).not.toContain("coding");
    expect(entitled).toMatchObject({ students: 400, customDomains: 2 });
  });

  it("adds modules and limit packs, and a pack leaves an unlimited limit unlimited", () => {
    const entitled = entitlementsFor({
      ...base,
      items: [
        item({ plan: standard }),
        item({
          addOn: {
            kind: "module",
            module: "coding",
            limitKey: null,
            amount: null,
          },
        }),
        item({
          addOn: {
            kind: "limit_pack",
            module: null,
            limitKey: "poolBytes",
            amount: 200 * GIB,
          },
          quantity: 2,
        }),
        item({
          addOn: {
            kind: "limit_pack",
            module: null,
            limitKey: "videoHours",
            amount: 10,
          },
        }),
      ],
    });
    expect(entitled.modules).toContain("coding");
    expect(entitled.poolBytes).toBe(500 * GIB);
    expect(entitled.videoHours).toBeNull();
  });

  it("ignores what covers other schools, has ended or has not begun", () => {
    const entitled = entitlementsFor({
      ...base,
      items: [
        item({ plan: standard, schoolIds: ["school-b"] }),
        item({
          addOn: {
            kind: "module",
            module: "coding",
            limitKey: null,
            amount: null,
          },
          endsOn: "2026-11-05",
        }),
        item({
          addOn: {
            kind: "module",
            module: "video",
            limitKey: null,
            amount: null,
          },
          startsOn: "2026-11-06",
        }),
      ],
    });
    expect(entitled.modules).toEqual(settableOf(BASIC_ENTITLEMENTS).modules);
  });

  it("applies overrides in force, a school's own over one for every school", () => {
    const entitled = entitlementsFor({
      ...base,
      items: [item({ plan: standard })],
      overrides: [
        override({ schoolId: "school-a", module: "website", granted: true }),
        override({ module: "website", granted: false }),
        override({ module: "badges", granted: true }),
        override({ limitKey: "students", value: null }),
        override({ limitKey: "poolBytes", value: null }),
        override({ module: "standards", granted: true, endsOn: "2026-10-01" }),
      ],
    });
    expect(entitled.modules).toContain("website");
    expect(entitled.modules).toContain("badges");
    expect(entitled.modules).not.toContain("standards");
    expect(entitled.students).toBeNull();
    expect(entitled.poolBytes).toBe(100 * GIB);
  });

  it("carries the trial's end and the notice", () => {
    expect(
      entitlementsFor({
        ...base,
        items: [],
        trialEndsOn: "2026-12-01",
        notice: "payment_overdue",
      }),
    ).toMatchObject({ trialEndsOn: "2026-12-01", notice: "payment_overdue" });
  });
});

describe("usable modules", () => {
  it("drops a module whose requirements are not entitled", () => {
    expect(usableModules(["badges", "coursework"])).toEqual(["coursework"]);
    expect(usableModules(["badges", "early_years"])).toEqual([
      "early_years",
      "badges",
    ]);
    expect(usableModules(["early_years", "coursework"])).toEqual([
      "coursework",
      "early_years",
    ]);
  });
});
