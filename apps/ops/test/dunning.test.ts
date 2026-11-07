import type { SchoolStanding } from "@faridalms/domain/provisioning";

import {
  billingContactsOf,
  saveContact,
  setAccountOwner,
} from "@faridalms/database/business/customers";
import {
  addPause,
  dunningStandingOf,
  stepsOf,
} from "@faridalms/database/business/dunning";
import {
  draftInvoice,
  invoiceById,
  issueInvoice,
  recordPayment,
} from "@faridalms/database/business/invoices";
import { profile, saveProfile } from "@faridalms/database/business/profile";
import { subscriptionDetail } from "@faridalms/database/business/subscriptions";
import { listTasks } from "@faridalms/database/business/tasks";
import { lifecycleOf } from "@faridalms/domain/provisioning";
import { MemoryProvider } from "@faridalms/mail/providers";
import { beforeAll, describe, expect, test } from "bun:test";

import type { Publishing } from "../src/server/publication";

import { dunningRound, settleClock } from "../src/server/dunning";
import { dunningEmail } from "../src/server/dunning-mail";
import { business, contract, directory } from "./harness";

const OWNER = "op-owner";
const CAIRO = [{ timeZone: "Africa/Cairo", weekendDays: [5, 6] }];
// 1 October 2026 is a Thursday; the 2nd a Friday, Cairo's weekend.
const THURSDAY = new Date("2026-10-01T08:00:00Z");
const FRIDAY = new Date("2026-10-02T08:00:00Z");

/** The round's dependencies, with a cell that moves the directory as a real one does. */
function fakes(options: { now?: Date } = {}) {
  const mail = new MemoryProvider();
  const standings: { tenantId: string; standing: SchoolStanding }[] = [];
  const told: string[] = [];
  let now = options.now ?? FRIDAY;
  const deps: Publishing = {
    business: business(),
    directory: directory(),
    setStanding: async (tenantId, standing, reason) => {
      standings.push({ tenantId, standing });
      await directory().setTenantState({
        tenantId,
        state: lifecycleOf(standing),
        access: standing === "suspended" ? "full" : standing,
        operatorId: OWNER,
        reason,
      });
      return true;
    },
    entitlementsChanged: async (tenantId) => {
      told.push(tenantId);
      return true;
    },
    calendar: async () => CAIRO,
    mail,
    now: () => now,
  };
  return {
    deps,
    told,
    /** The emails sent to one address, oldest first. */
    sentTo: (address: string) =>
      mail.sent.filter((message) => message.to === address),
    /** What one tenant's access was moved to, in order. */
    movesOf: (tenantId: string) =>
      standings
        .filter((move) => move.tenantId === tenantId)
        .map((move) => move.standing),
    at: (when: Date) => {
      now = when;
    },
  };
}

/** A contract with a billing contact and an account owner, and one issued invoice of 10,000.00. */
async function owing(slug: string, language: "en" | "ar" = "en") {
  const held = await contract(slug);
  await setAccountOwner(business(), {
    customerId: held.customerId,
    ownerId: OWNER,
    by: OWNER,
  });
  for (const [name, roles] of [
    ["Salama Ashoush", ["billing"]],
    ["Omar Farouk", ["technical"]],
  ] as const)
    await saveContact(business(), {
      customerId: held.customerId,
      name,
      email: `${name.split(" ")[0]?.toLowerCase()}@${slug}.example.com`,
      phone: null,
      roles: [...roles],
      locale: "en",
      by: OWNER,
    });
  const invoiceId = await draftInvoice(business(), {
    customerId: held.customerId,
    subscriptionId: held.subscriptionId,
    kind: "manual",
    scheduleKey: null,
    forDay: "2026-09-01",
    currency: "EGP",
    country: "EG",
    language,
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
        unitPriceMinor: 1_000_000,
        discountPercent: 0,
      },
    ],
    by: OWNER,
  });
  if (!invoiceId) throw new Error("no invoice");
  await issueInvoice(business(), {
    id: invoiceId,
    issuedOn: "2026-09-01",
    by: OWNER,
  });
  const detail = await invoiceById(business(), invoiceId);
  if (!detail?.invoice.dueOn || !detail.invoice.number)
    throw new Error("not issued");
  return {
    ...held,
    invoiceId,
    number: detail.invoice.number,
    dueOn: detail.invoice.dueOn,
  };
}

const pay = (
  held: { customerId: string; invoiceId: string },
  amountMinor: number,
  receivedOn: string,
) =>
  recordPayment(business(), {
    customerId: held.customerId,
    method: "bank_transfer",
    currency: "EGP",
    amountMinor,
    feeMinor: 0,
    receivedOn,
    reference: `Transfer ${amountMinor}`,
    allocations: [{ invoiceId: held.invoiceId, amountMinor }],
    by: OWNER,
  });

beforeAll(async () => {
  const held = await profile(business());
  const saved = await saveProfile(business(), {
    legalNameEn: "Acme Learning",
    legalNameAr: "أكمي للتعليم",
    addressEn: "1 Example Street, Cairo",
    addressAr: "١ شارع المثال، القاهرة",
    taxNumber: "100-200-300",
    commercialRegistry: null,
    email: "billing@example.com",
    phone: null,
    website: null,
    bankDetailsEn: "Example Bank, IBAN EG00 0000",
    bankDetailsAr: "بنك المثال، رقم الحساب EG00 0000",
    expectedVersion: held?.version ?? null,
    reason: "Registered",
    by: OWNER,
  });
  if (!saved) throw new Error("the business's details were not saved");
});

/** The overdue reminder in Arabic, for an invoice that many days overdue. */
const arabicReminder = (days: number) =>
  dunningEmail({
    step: "overdue_7",
    language: "ar",
    to: "salama@example.com",
    invoice: {
      number: "INV-2026-00001",
      currency: "EGP",
      dueOn: "2026-10-01",
      totalMinor: 1_000_000,
      owedMinor: 1_000_000,
      paymentLinkUrl: null,
    },
    customer: { nameEn: "Acme Schools", nameAr: "مدارس أكمي" },
    days,
    by: null,
    business: {
      name: "أكمي للتعليم",
      email: "billing@example.com",
      bankDetails: null,
    },
  });

describe("the dunning clock", () => {
  test("reminds billing contacts once a step, asks the owner to call, and tells the school", async () => {
    const held = await owing("hawthorn");
    expect(held.dueOn).toBe("2026-10-01");
    const { deps, sentTo, told } = fakes();
    const billing = "salama@hawthorn.example.com";

    await dunningRound(deps, "2026-09-23", OWNER);
    expect(sentTo(billing)).toEqual([]);
    await dunningRound(deps, "2026-09-24", OWNER);
    await dunningRound(deps, "2026-09-24", OWNER);
    expect(sentTo(billing)).toHaveLength(1);
    expect(sentTo("omar@hawthorn.example.com")).toEqual([]);
    const [upcoming] = sentTo(billing);
    expect(upcoming?.subject).toBe(
      `Invoice ${held.number} falls due on October 1, 2026`,
    );
    expect(upcoming?.replyTo).toBe("billing@example.com");
    expect(upcoming?.text).toContain("Example Bank, IBAN EG00 0000");

    await dunningRound(deps, "2026-10-15", OWNER);
    expect(sentTo(billing)).toHaveLength(2);
    expect(sentTo(billing).at(-1)?.text).toContain("is now 14 days overdue");
    expect(
      (await stepsOf(business(), [held.invoiceId])).map((row) => row.step),
    ).toEqual(["upcoming", "overdue_14"]);

    const [call] = await listTasks(business(), { customerId: held.customerId });
    // Whom the call is to: the billing contact, not the technical one.
    expect(
      (await billingContactsOf(business(), [held.customerId])).map(
        (contact) => contact.name,
      ),
    ).toEqual(["Salama Ashoush"]);
    expect(call?.task).toMatchObject({
      kind: "call",
      assigneeId: OWNER,
      dueOn: "2026-10-15",
      doneAt: null,
    });
    // Asked once, however often the round runs.
    await dunningRound(deps, "2026-10-16", OWNER);
    expect(
      await listTasks(business(), { customerId: held.customerId }),
    ).toHaveLength(1);

    const detail = await subscriptionDetail(business(), held.subscriptionId);
    expect(detail?.subscription.notice).toBe("payment_overdue");
    expect(told).toContain(held.tenantId);
    expect(
      (await directory().school(held.schoolIds[0] ?? ""))?.entitlements.notice,
    ).toBe("payment_overdue");
  });

  test("takes access away only at the school's weekend, and gives it back at once when paid", async () => {
    const held = await owing("rowan");
    const { deps, sentTo, movesOf, at } = fakes({ now: THURSDAY });
    const billing = "salama@rowan.example.com";

    await dunningRound(deps, "2026-10-31", OWNER);
    expect(movesOf(held.tenantId)).toEqual([]);

    at(FRIDAY);
    await dunningRound(deps, "2026-10-31", OWNER);
    expect(movesOf(held.tenantId)).toEqual(["restricted"]);
    expect(await dunningStandingOf(business(), held.tenantId)).toBe(
      "restricted",
    );
    expect(sentTo(billing).at(-1)?.subject).toBe(
      `Invoice ${held.number}: your school's access is restricted`,
    );
    await dunningRound(deps, "2026-11-01", OWNER);
    expect(movesOf(held.tenantId)).toEqual(["restricted"]);

    await dunningRound(deps, "2026-11-30", OWNER);
    expect(movesOf(held.tenantId)).toEqual(["restricted", "read_only"]);

    // Half paid moves the clock back a step, to restricted, at once.
    await pay(held, 500_000, "2026-12-01");
    await settleClock(deps, {
      customerId: held.customerId,
      day: "2026-12-01",
      by: OWNER,
    });
    expect(movesOf(held.tenantId).at(-1)).toBe("restricted");

    await pay(held, 500_000, "2026-12-02");
    const sent = sentTo(billing).length;
    await settleClock(deps, {
      customerId: held.customerId,
      day: "2026-12-02",
      by: OWNER,
    });
    expect(movesOf(held.tenantId).at(-1)).toBe("full");
    expect(await dunningStandingOf(business(), held.tenantId)).toBe("full");
    expect(sentTo(billing)).toHaveLength(sent);
    const detail = await subscriptionDetail(business(), held.subscriptionId);
    expect(detail?.subscription.notice).toBeNull();
  });

  test("stops while the customer's clock is paused", async () => {
    const held = await owing("alder");
    const { deps, movesOf } = fakes();
    await addPause(business(), {
      customerId: held.customerId,
      startsOn: "2026-10-10",
      endsOn: "2026-10-19",
      reason: "Purchase order in process",
      by: OWNER,
    });
    await dunningRound(deps, "2026-10-31", OWNER);
    expect(movesOf(held.tenantId)).toEqual([]);
    expect(
      (await stepsOf(business(), [held.invoiceId])).map((row) => row.step),
    ).toEqual(["overdue_14"]);
    await dunningRound(deps, "2026-11-10", OWNER);
    expect(movesOf(held.tenantId)).toEqual(["restricted"]);
  });

  test("leaves an operator's own change alone when the invoice is paid", async () => {
    const held = await owing("juniper-hill");
    const { deps, movesOf } = fakes();
    await dunningRound(deps, "2026-10-31", OWNER);
    expect(movesOf(held.tenantId)).toEqual(["restricted"]);
    await directory().setTenantState({
      tenantId: held.tenantId,
      state: "suspended",
      access: "full",
      operatorId: OWNER,
      reason: "Asked by the school's owners",
    });
    await pay(held, 1_000_000, "2026-11-02");
    await settleClock(deps, {
      customerId: held.customerId,
      day: "2026-11-02",
      by: OWNER,
    });
    expect(movesOf(held.tenantId)).toEqual(["restricted"]);
    expect(await dunningStandingOf(business(), held.tenantId)).toBe("full");
    expect(
      (await directory().school(held.schoolIds[0] ?? ""))?.tenantState,
    ).toBe("suspended");
  });

  test("writes to a customer in Arabic as Arabic counts days", () => {
    expect(arabicReminder(7).text).toContain("مضى على موعد سدادها 7 أيام.");
    expect(arabicReminder(11).text).toContain("مضى على موعد سدادها 11 يومًا.");
    expect(arabicReminder(7).text).toStartWith("السادة مدارس أكمي،");
    expect(arabicReminder(7).subject).toBe("تأخر سداد الفاتورة INV-2026-00001");
  });
});
