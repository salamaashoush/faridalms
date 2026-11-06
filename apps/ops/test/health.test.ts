import type { SchoolStanding } from "@faridalms/domain/provisioning";

import {
  draftInvoice,
  issueInvoice,
  recordPayment,
} from "@faridalms/database/business/invoices";
import { describe, expect, test } from "bun:test";

import type { Publishing } from "../src/server/publication";

import { dailyRound } from "../src/server/daily-round";
import { schoolHealth } from "../src/server/health";
import { business, contract, directory, inDirectory } from "./harness";

const OWNER = "op-owner";
const NOW = new Date("2026-11-06T09:00:00Z");
const TODAY = "2026-11-06";

async function issued(customerId: string, issuedOn: string) {
  const id = await draftInvoice(business(), {
    customerId,
    subscriptionId: null,
    kind: "manual",
    scheduleKey: null,
    forDay: issuedOn,
    currency: "EGP",
    country: "EG",
    language: "en",
    vatPercent: 0,
    reverseCharge: false,
    lines: [
      {
        descriptionEn: "Set-up",
        descriptionAr: "الإعداد",
        itemCode: null,
        periodStart: null,
        periodEnd: null,
        quantity: 1,
        unitPriceMinor: 100_000,
        discountPercent: 0,
      },
    ],
    by: OWNER,
  });
  if (!id) throw new Error("no invoice");
  await issueInvoice(business(), { id, issuedOn, by: OWNER });
  return id;
}

const healthOfSchool = async (schoolId: string) => {
  const school = await directory().school(schoolId);
  if (!school) throw new Error("no school");
  const health = await schoolHealth(
    { directory: directory(), business: business() },
    [school],
    NOW,
    TODAY,
  );
  const found = health.get(schoolId);
  if (!found) throw new Error("no health");
  return found;
};

describe("a school's health", () => {
  test("is green when its week was busy, its bills are paid and its steps are under way", async () => {
    const { schoolIds } = await contract("birch-health");
    const [schoolId = ""] = schoolIds;
    await inDirectory(
      (sql) => sql`insert into school_usage (school_id, used_bytes, file_count,
          signed_in_7d, school_days_7d, measured_at)
        values (${schoolId}, 0, 0, 40, 5, now())`,
    );
    expect(await healthOfSchool(schoolId)).toMatchObject({
      level: "green",
      reasons: [],
      daysOverdue: 0,
      onboarding: { stalled: false },
    });
  });

  test("is red when nobody signs in through a week of school, or an invoice is a month overdue", async () => {
    const { schoolIds, customerId } = await contract("cedar-health");
    const [schoolId = ""] = schoolIds;
    await inDirectory(
      (sql) => sql`insert into school_usage (school_id, used_bytes, file_count,
          signed_in_7d, school_days_7d, measured_at)
        values (${schoolId}, 0, 0, 0, 5, now())`,
    );
    // Issued 70 days ago, so due 40 days ago.
    await issued(customerId, "2026-08-28");
    const health = await healthOfSchool(schoolId);
    expect(health.level).toBe("red");
    expect(health.reasons).toEqual(["quiet_in_term", "invoice_overdue"]);
    expect(health.daysOverdue).toBe(40);
  });

  test("is amber when its onboarding stalls or one of its addresses fails", async () => {
    const { schoolIds } = await contract("hazel-health");
    const [schoolId = ""] = schoolIds;
    await inDirectory(async (sql) => {
      await sql`update schools set created_at = now() - interval '30 days' where id = ${schoolId}`;
      await sql`insert into school_onboarding (school_id, item, reached_at)
        values (${schoolId}, 'admin_signed_in', now() - interval '20 days')`;
    });
    await directory().addHost({
      schoolId,
      hostname: "www.hazel-health.example.com",
      role: "site",
      challenge: "hazel-health-challenge-0123456789abcdef",
      operatorId: OWNER,
      reason: "The school's own address",
    });
    await inDirectory(
      (sql) =>
        sql`update hosts set state = 'failing' where hostname = 'www.hazel-health.example.com'`,
    );
    const health = await healthOfSchool(schoolId);
    expect(health).toMatchObject({
      level: "amber",
      reasons: ["onboarding_stalled", "host_failing"],
    });
    expect(Object.keys(health.onboarding.reached)).toEqual(["admin_signed_in"]);
  });
});

describe("an operator's onboarding steps", () => {
  test("are ticked once and unticked once, each logged", async () => {
    const { schoolIds } = await contract("larch-health");
    const [schoolId = ""] = schoolIds;
    const mark = (done: boolean) =>
      directory().markOnboarding({
        schoolId,
        item: "kickoff_call",
        done,
        operatorId: OWNER,
      });
    expect(await mark(true)).toBe(true);
    expect(await mark(true)).toBe(false);
    const ticked = (await healthOfSchool(schoolId)).onboarding.reached
      .kickoff_call;
    expect(ticked?.operatorId).toBe(OWNER);
    expect(await mark(false)).toBe(true);
    expect(
      (await healthOfSchool(schoolId)).onboarding.reached.kickoff_call,
    ).toBeUndefined();
    const logged = (await directory().changes({ id: schoolId })).map(
      (change) => change.action,
    );
    expect(logged).toEqual(
      expect.arrayContaining(["onboarding.done", "onboarding.undone"]),
    );
  });

  test("include the first invoice paid, which the daily round marks", async () => {
    const { schoolIds, customerId } = await contract("maple-health");
    const [schoolId = ""] = schoolIds;
    const invoiceId = await issued(customerId, "2026-11-01");
    const deps: Publishing = {
      business: business(),
      directory: directory(),
      setStanding: async (_tenantId: string, _standing: SchoolStanding) => true,
      entitlementsChanged: async () => true,
      calendar: async () => [],
      mail: null,
      now: () => NOW,
    };
    await dailyRound(deps, "2026-11-02", OWNER);
    expect(
      (await healthOfSchool(schoolId)).onboarding.reached.first_invoice_paid,
    ).toBeUndefined();
    await recordPayment(business(), {
      customerId,
      method: "bank_transfer",
      currency: "EGP",
      amountMinor: 100_000,
      feeMinor: 0,
      receivedOn: "2026-11-03",
      reference: "Transfer 1",
      allocations: [{ invoiceId, amountMinor: 100_000 }],
      by: OWNER,
    });
    await dailyRound(deps, "2026-11-04", OWNER);
    expect(
      (await healthOfSchool(schoolId)).onboarding.reached.first_invoice_paid
        ?.at,
    ).toBe(NOW.toISOString());
  });
});
