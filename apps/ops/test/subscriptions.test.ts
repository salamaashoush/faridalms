import {
  catalogue,
  retireVersion,
  saveAddOnVersion,
  savePlanVersion,
} from "@faridalms/database/business/catalogue";
import {
  customerById,
  saveCustomer,
} from "@faridalms/database/business/customers";
import { eventsOf } from "@faridalms/database/business/events";
import {
  addItem,
  addOverride,
  createSubscription,
  endParts,
  openSubscription,
  setTerms,
  SubscriptionError,
} from "@faridalms/database/business/subscriptions";
import { BASIC_MODULES } from "@faridalms/domain/modules";
import { SQL } from "bun";
import { describe, expect, test } from "bun:test";

import {
  dailyRound,
  publishSubscription,
  roundDue,
  SYSTEM_OPERATOR,
} from "../src/server/publication";
import { business, businessUrl, directory, tenantWith } from "./harness";

const GIB = 1024 ** 3;
const paused: { tenantId: string; reason: string }[] = [];
const told: string[] = [];
const deps = () => ({
  business: business(),
  directory: directory(),
  pauseTenant: async (tenantId: string, reason: string) => {
    paused.push({ tenantId, reason });
    return true;
  },
  entitlementsChanged: async (tenantId: string) => {
    told.push(tenantId);
    return true;
  },
});
const OWNER = "op-owner";

async function entitlementsOf(schoolId: string) {
  return (await directory().school(schoolId))?.entitlements;
}

const standard = {
  code: "standard",
  nameEn: "Standard",
  nameAr: "القياسية",
  modules: [...BASIC_MODULES, "website" as const, "admissions" as const],
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
  prices: [
    {
      currency: "EGP" as const,
      unit: "student_year" as const,
      amountMinor: 35_000,
      minimumMinor: 0,
    },
  ],
  validFrom: "2026-09-01",
  reason: "The launch catalogue",
};

describe("the catalogue", () => {
  test("a version is written once and only retired", async () => {
    const first = await savePlanVersion(business(), { ...standard, by: OWNER });
    const listed = await catalogue(business());
    const version = listed.plans.find((row) => row.id === first);
    expect(version).toMatchObject({
      code: "standard",
      version: 1,
      students: 400,
    });
    expect(version?.prices).toEqual(standard.prices);
    const second = await savePlanVersion(business(), {
      ...standard,
      planId: version?.planId,
      limits: { ...standard.limits, students: 500 },
      reason: "More students for the price",
      by: OWNER,
    });
    expect(
      (await catalogue(business())).plans.find((row) => row.id === second)
        ?.version,
    ).toBe(2);
    expect(
      await retireVersion(business(), {
        kind: "plan",
        id: first,
        by: OWNER,
        reason: "Superseded",
      }),
    ).toBe(true);
    expect(
      await retireVersion(business(), {
        kind: "plan",
        id: first,
        by: OWNER,
        reason: "Again",
      }),
    ).toBe(false);
    const sql = new SQL(businessUrl());
    try {
      expect(
        await sql`update plan_versions set students = 1 where id = ${second}`.catch(
          (error: Error) => error.message,
        ),
      ).toContain("permission denied");
    } finally {
      await sql.close();
    }
  });
});

describe("a subscription", () => {
  test("publishes its plan, add-ons and overrides to the tenant's schools", async () => {
    const { tenantId, schoolIds } = await tenantWith(
      ["oakfield", "oakfield-east"],
      {
        modules: BASIC_MODULES,
      },
    );
    const [oakfield, east] = schoolIds;
    if (!oakfield || !east) throw new Error("schools");
    const planVersionId = (await catalogue(business())).plans.find(
      (row) => row.code === "standard" && !row.retiredAt,
    )?.id;
    if (!planVersionId) throw new Error("plan");
    const coding = await saveAddOnVersion(business(), {
      code: "coding",
      nameEn: "Coding",
      nameAr: "البرمجة",
      kind: "module",
      module: "coding",
      limitKey: null,
      amount: null,
      prices: [],
      validFrom: "2026-09-01",
      reason: "Sold on its own",
      by: OWNER,
    });
    const customerId = await saveCustomer(business(), {
      legalNameEn: "Oakfield Schools",
      legalNameAr: null,
      taxNumber: "123-456-789",
      commercialRegistry: null,
      address: null,
      country: "EG",
      currency: "EGP",
      reason: "Won in October",
      by: OWNER,
      tenantId,
    });
    if (!customerId) throw new Error("customer");
    const subscriptionId = await createSubscription(business(), {
      customerId,
      tenantId,
      currency: "EGP",
      terms: {
        state: "active",
        termStartsOn: "2026-09-01",
        termEndsOn: "2027-09-01",
        trialEndsOn: null,
        renewal: "auto",
        schedule: "annual",
        contractedStudents: 300,
        censusOn: "2026-10-31",
        notice: null,
      },
      by: OWNER,
      reason: "Signed the order form",
    });
    expect(
      await createSubscription(business(), {
        customerId,
        tenantId,
        currency: "EGP",
        terms: {
          state: "trial",
          termStartsOn: null,
          termEndsOn: null,
          trialEndsOn: "2026-12-01",
          renewal: "auto",
          schedule: "annual",
          contractedStudents: null,
          censusOn: null,
          notice: null,
        },
        by: OWNER,
        reason: "A second one",
      }).catch((error: unknown) => error),
    ).toBeInstanceOf(SubscriptionError);
    await addItem(business(), {
      subscriptionId,
      planVersionId,
      addOnVersionId: null,
      quantity: 300,
      unitPriceMinor: 35_000,
      discountPercent: 0,
      schoolIds: [],
      startsOn: "2026-09-01",
      reason: "The order form",
      by: OWNER,
    });
    await addItem(business(), {
      subscriptionId,
      planVersionId: null,
      addOnVersionId: coding,
      quantity: 1,
      unitPriceMinor: 0,
      discountPercent: 0,
      schoolIds: [oakfield],
      startsOn: "2026-09-01",
      reason: "Coding for the main school",
      by: OWNER,
    });
    const overrideId = await addOverride(business(), {
      subscriptionId,
      schoolId: east,
      module: "badges",
      granted: true,
      limitKey: null,
      value: null,
      startsOn: "2026-11-01",
      endsOn: null,
      reason: "A pilot term of badges",
      by: OWNER,
    });

    const out = await publishSubscription(deps(), {
      subscriptionId,
      day: "2026-11-05",
      by: OWNER,
      reason: "Signed",
    });
    expect(out.published.toSorted()).toEqual([oakfield, east].toSorted());
    // The tenant's cell is told once, for both its schools.
    expect(out.atOnce).toBe(true);
    expect(told.filter((id) => id === tenantId)).toEqual([tenantId]);
    expect((await entitlementsOf(oakfield))?.modules).toContain("coding");
    expect((await entitlementsOf(east))?.modules).toContain("badges");
    expect((await entitlementsOf(east))?.modules).not.toContain("coding");
    expect(await entitlementsOf(oakfield)).toMatchObject({
      students: 500,
      customDomains: 2,
    });

    // Unchanged, nothing is written again.
    expect(
      (
        await publishSubscription(deps(), {
          subscriptionId,
          day: "2026-11-05",
          by: OWNER,
          reason: "Again",
        })
      ).published,
    ).toEqual([]);
    expect(told.filter((id) => id === tenantId)).toHaveLength(1);

    expect(
      await endParts(business(), {
        part: "override",
        subscriptionId,
        ids: [overrideId],
        endsOn: "2026-12-01",
        by: OWNER,
        reason: "The pilot term ends",
      }),
    ).toBe(1);
    // Already ending by then, so nothing changes.
    expect(
      await endParts(business(), {
        part: "override",
        subscriptionId,
        ids: [overrideId],
        endsOn: "2027-01-01",
        by: OWNER,
        reason: "Later",
      }),
    ).toBe(0);
    const round = await dailyRound(deps(), "2026-12-01");
    expect(round?.published).toBeGreaterThanOrEqual(1);
    expect((await entitlementsOf(east))?.modules).not.toContain("badges");
  });

  test("a tenant from before the console sold anything keeps what it has", async () => {
    const { tenantId, schoolIds } = await tenantWith(["willow"], {
      country: "AE",
    });
    const [willow] = schoolIds;
    if (!willow) throw new Error("school");
    const before = await entitlementsOf(willow);
    const round = await dailyRound(deps(), "2026-11-05");
    expect(round?.grandfathered).toBeGreaterThanOrEqual(1);
    const subscription = await openSubscription(business(), tenantId);
    expect(subscription).toMatchObject({
      grandfathered: true,
      currency: "USD",
    });
    const customer = await customerById(
      business(),
      subscription?.customerId ?? "",
    );
    expect(customer?.customer).toMatchObject({
      country: "AE",
      legalNameEn: "willow schools",
    });
    expect(
      (await eventsOf(business(), "customer", customer?.customer.id ?? "")).map(
        (event) => event.action,
      ),
    ).toEqual(["customer.create"]);
    expect(await entitlementsOf(willow)).toEqual(before);
    expect(round).not.toBeNull();
    expect(SYSTEM_OPERATOR).toBe("console-daily");

    // Given a contract's term, it is billed as sold from then on.
    await setTerms(business(), {
      id: subscription?.id ?? "",
      terms: {
        state: "active",
        termStartsOn: "2026-12-01",
        termEndsOn: "2027-12-01",
        trialEndsOn: null,
        renewal: "auto",
        schedule: "two",
        contractedStudents: 120,
        censusOn: null,
        notice: null,
      },
      by: OWNER,
      reason: "Renewed under a contract",
    });
    expect(await openSubscription(business(), tenantId)).toMatchObject({
      grandfathered: false,
      schedule: "two",
    });
  });
});

describe("a tenant on a trial set by hand", () => {
  test("keeps its trial and notice as its subscription's", async () => {
    const { tenantId, schoolIds } = await tenantWith(["hazel"], {
      trialEndsOn: "2027-03-01",
      notice: "plan_ends_soon",
    });
    const [hazel] = schoolIds;
    if (!hazel) throw new Error("school");
    const before = await entitlementsOf(hazel);
    await dailyRound(deps(), "2026-11-20");
    expect(await openSubscription(business(), tenantId)).toMatchObject({
      state: "trial",
      trialEndsOn: "2027-03-01",
      notice: "plan_ends_soon",
      grandfathered: true,
    });
    expect(await entitlementsOf(hazel)).toEqual(before);
  });
});

describe("the daily round", () => {
  test("runs once a day and pauses a trial that is over", async () => {
    const { tenantId } = await tenantWith(["birch"]);
    const customerId = await saveCustomer(business(), {
      legalNameEn: "Birch School",
      legalNameAr: null,
      taxNumber: null,
      commercialRegistry: null,
      address: null,
      country: "EG",
      currency: "EGP",
      reason: "Trying it out",
      by: OWNER,
      tenantId,
    });
    if (!customerId) throw new Error("customer");
    await createSubscription(business(), {
      customerId,
      tenantId,
      currency: "EGP",
      terms: {
        state: "trial",
        termStartsOn: null,
        termEndsOn: null,
        trialEndsOn: "2027-01-10",
        renewal: "auto",
        schedule: "annual",
        contractedStudents: null,
        censusOn: null,
        notice: null,
      },
      by: OWNER,
      reason: "A month's trial",
    });

    // Its last day is still the trial.
    expect(await roundDue(business(), "2027-01-10")).toBe(true);
    const last = await dailyRound(deps(), "2027-01-10");
    expect(last?.paused).toBe(0);
    expect(paused.filter((call) => call.tenantId === tenantId)).toEqual([]);
    expect(await roundDue(business(), "2027-01-10")).toBe(false);

    expect(await roundDue(business(), "2027-01-11")).toBe(true);
    const over = await dailyRound(deps(), "2027-01-11");
    expect(over?.paused).toBeGreaterThanOrEqual(1);
    expect(over?.failed).toEqual([]);
    expect(paused.filter((call) => call.tenantId === tenantId)).toEqual([
      {
        tenantId,
        reason: "The trial ended on 2027-01-10 without a contract",
      },
    ]);
  });

  test("records a subscription it could not finish and goes on", async () => {
    const { tenantId } = await tenantWith(["cedar"]);
    const customerId = await saveCustomer(business(), {
      legalNameEn: "Cedar School",
      legalNameAr: null,
      taxNumber: null,
      commercialRegistry: null,
      address: null,
      country: "EG",
      currency: "EGP",
      reason: "Trying it out",
      by: OWNER,
      tenantId,
    });
    if (!customerId) throw new Error("customer");
    const subscriptionId = await createSubscription(business(), {
      customerId,
      tenantId,
      currency: "EGP",
      terms: {
        state: "trial",
        termStartsOn: null,
        termEndsOn: null,
        trialEndsOn: "2027-02-01",
        renewal: "auto",
        schedule: "annual",
        contractedStudents: null,
        censusOn: null,
        notice: null,
      },
      by: OWNER,
      reason: "A trial",
    });
    const refusing = {
      ...deps(),
      pauseTenant: async () => false,
    };
    const round = await dailyRound(refusing, "2027-02-02");
    expect(round?.failed).toContain(subscriptionId);
    // The round still finished and is recorded for the day.
    expect(await roundDue(business(), "2027-02-02")).toBe(false);
  });
});
