import { customerById } from "@faridalms/database/business/customers";
import { draftById } from "@faridalms/database/business/drafts";
import { eventsAbout } from "@faridalms/database/business/events";
import {
  addActivity,
  createLead,
  dueNextSteps,
  intakeLead,
  leadById,
  planLead,
  purgeLostLeads,
  setLeadState,
} from "@faridalms/database/business/leads";
import {
  addTaxRate,
  listTaxRates,
  profile,
  saveProfile,
} from "@faridalms/database/business/profile";
import {
  acceptQuote,
  createQuote,
  markQuoteSent,
  QuoteError,
  quoteById,
  quotesFor,
  reviseQuote,
  saveQuote,
} from "@faridalms/database/business/quotes";
import { blankDraft } from "@faridalms/domain/provisioning-draft";
import { quoteTotals } from "@faridalms/domain/quotes";
import { SQL } from "bun";
import { describe, expect, test } from "bun:test";

import { business, businessUrl } from "./harness";

const OWNER = "op-owner";

const intake = {
  source: "demo_form" as const,
  name: "Salama Ashoush",
  email: "salama@maple.example.com",
  phone: null,
  organisation: "Maple School",
  role: "leader" as const,
  size: "200_1000" as const,
  country: "EG",
  locale: "en" as const,
  message: "We would like to see it",
  schoolId: null,
  tenantId: null,
  module: null,
};

function content(totalLine: number) {
  const lines = [
    {
      kind: "plan" as const,
      versionId: crypto.randomUUID(),
      nameEn: "Standard",
      nameAr: "القياسية",
      unit: "student_year" as const,
      quantity: 1,
      unitPriceMinor: totalLine,
      discountPercent: 0,
    },
  ];
  return {
    spec: {
      currency: "EGP" as const,
      planVersionId: lines[0]?.versionId ?? null,
      quantity: 1,
      unitPriceMinor: totalLine,
      discountPercent: 0,
      addOns: [],
      termStartsOn: "2026-12-01",
      termEndsOn: "2027-12-01",
      schedule: "annual" as const,
      validUntil: "2026-12-05",
      notesEn: null,
      notesAr: null,
    },
    lines,
    country: "EG",
    totals: quoteTotals({ lines, vatPercent: 14, schedule: "annual" }),
  };
}

describe("a lead", () => {
  test("arrives once from an intake, is worked, and its next step comes due", async () => {
    const intakeId = crypto.randomUUID();
    const first = await intakeLead(business(), { ...intake, intakeId });
    const again = await intakeLead(business(), { ...intake, intakeId });
    expect(first.created).toBe(true);
    expect(again).toEqual({ id: first.id, created: false });

    await planLead(business(), {
      id: first.id,
      ownerId: OWNER,
      nextStep: "Call to book the demonstration",
      nextStepOn: "2026-11-06",
      by: OWNER,
    });
    expect(
      (await dueNextSteps(business(), "2026-11-05")).some(
        (lead) => lead.id === first.id,
      ),
    ).toBe(false);
    expect(
      (await dueNextSteps(business(), "2026-11-06")).some(
        (lead) => lead.id === first.id,
      ),
    ).toBe(true);
    await addActivity(business(), {
      leadId: first.id,
      kind: "call",
      note: "Booked for Tuesday",
      by: OWNER,
    });
    expect((await leadById(business(), first.id))?.activities).toHaveLength(1);

    // Its log names the school, never the person.
    const sql = new SQL(businessUrl());
    try {
      const events = await sql<{ after: unknown }[]>`
        select after from business_events
        where subject_type = 'lead' and subject_id = ${first.id} and action = 'lead.create'`;
      expect(events).toHaveLength(1);
      expect(JSON.stringify(events[0]?.after)).not.toContain("Salama");
      expect(JSON.stringify(events[0]?.after)).toContain("Maple School");
    } finally {
      await sql.close();
    }
  });

  test("lost two years ago, is deleted with its activities and unaccepted quotes", async () => {
    const id = await createLead(business(), {
      name: "Omar Farouk",
      email: null,
      phone: "+20 100 000 0000",
      organisation: "Old Oak School",
      size: null,
      country: "EG",
      locale: "ar",
      by: OWNER,
    });
    await createQuote(business(), {
      ...content(100_000),
      leadId: id,
      customerId: null,
      year: "2024",
      by: OWNER,
    });
    await setLeadState(business(), {
      id,
      state: "lost",
      lostReason: "timing",
      by: OWNER,
    });
    const sql = new SQL(businessUrl());
    try {
      await sql`update leads set last_contact_at = now() - interval '25 months' where id = ${id}`;
    } finally {
      await sql.close();
    }
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 24);
    expect(await purgeLostLeads(business(), cutoff)).toBeGreaterThanOrEqual(1);
    expect(await leadById(business(), id)).toBeNull();
    expect(await quotesFor(business(), { leadId: id })).toEqual([]);
  });
});

describe("a quote", () => {
  test("is numbered by year, changed while a draft, versioned once sent, and accepted into a customer and a draft", async () => {
    const { id: leadId } = await intakeLead(business(), {
      ...intake,
      intakeId: crypto.randomUUID(),
      organisation: "Rowan Schools",
    });
    const first = await createQuote(business(), {
      ...content(500_000),
      leadId,
      customerId: null,
      year: "2026",
      by: OWNER,
    });
    const second = await createQuote(business(), {
      ...content(600_000),
      leadId,
      customerId: null,
      year: "2026",
      by: OWNER,
    });
    const [a, b] = [
      await quoteById(business(), first),
      await quoteById(business(), second),
    ];
    expect(a?.number).toMatch(/^Q-2026-\d{4}$/);
    expect(Number(b?.number.slice(-4))).toBe(Number(a?.number.slice(-4)) + 1);
    expect((await leadById(business(), leadId))?.lead.state).toBe("proposal");

    await saveQuote(business(), { ...content(550_000), id: first, by: OWNER });
    expect((await quoteById(business(), first))?.subtotalMinor).toBe(550_000);
    await markQuoteSent(business(), { id: first, by: OWNER });
    expect(
      await saveQuote(business(), {
        ...content(1),
        id: first,
        by: OWNER,
      }).catch((error: unknown) => error),
    ).toBeInstanceOf(QuoteError);
    const revised = await reviseQuote(business(), {
      ...content(520_000),
      id: first,
      by: OWNER,
    });
    expect(await quoteById(business(), first)).toMatchObject({
      state: "superseded",
    });
    expect(await quoteById(business(), revised)).toMatchObject({
      number: a?.number,
      version: 2,
      state: "draft",
    });

    await planLead(business(), {
      id: leadId,
      ownerId: OWNER,
      nextStep: "Collect the signed quote",
      nextStepOn: "2026-11-06",
      by: OWNER,
    });
    const accepted = await acceptQuote(business(), {
      id: revised,
      attachment: {
        name: "signed.pdf",
        type: "application/pdf",
        bytes: new TextEncoder().encode("%PDF-1.4 signed"),
      },
      newCustomer: {
        legalNameEn: "Rowan Schools",
        country: "EG",
        contact: {
          name: "Salama Ashoush",
          email: "salama@maple.example.com",
          phone: null,
          roles: ["decision_maker"],
          locale: "en",
        },
      },
      draft: () => blankDraft({ cellId: "eg-1", trialEndsOn: "2026-12-01" }),
      by: OWNER,
    });
    expect(await quoteById(business(), revised)).toMatchObject({
      state: "accepted",
      customerId: accepted.customerId,
      draftId: accepted.draftId,
      attachmentName: "signed.pdf",
    });
    expect((await leadById(business(), leadId))?.lead).toMatchObject({
      state: "won",
      customerId: accepted.customerId,
    });
    const customer = await customerById(business(), accepted.customerId);
    expect(customer?.customer.legalNameEn).toBe("Rowan Schools");
    // Whoever worked the lead looks after the customer it became.
    expect(customer?.customer.accountOwnerId).toBe(OWNER);
    expect(customer?.contacts.map((contact) => contact.name)).toEqual([
      "Salama Ashoush",
    ]);
    expect(await draftById(business(), accepted.draftId)).toMatchObject({
      customerId: accepted.customerId,
      step: "schools",
    });
  });
});

describe("the business's own details", () => {
  test("are set once, then changed only by whoever read the last version", async () => {
    const details = {
      legalNameEn: "Acme Learning",
      legalNameAr: "أكمي للتعليم",
      addressEn: "1 Example Street, Cairo",
      addressAr: "١ شارع المثال، القاهرة",
      taxNumber: "100-200-300",
      commercialRegistry: null,
      email: "billing@example.com",
      phone: null,
      website: null,
      bankDetailsEn: null,
      bankDetailsAr: null,
      reason: "Registered",
    };
    const held = await profile(business());
    expect(
      await saveProfile(business(), {
        ...details,
        expectedVersion: held?.version ?? null,
        by: OWNER,
      }),
    ).toBe(true);
    const saved = await profile(business());
    expect(
      await saveProfile(business(), {
        ...details,
        expectedVersion: held?.version ?? null,
        by: OWNER,
      }),
    ).toBe(false);
    expect(saved?.taxNumber).toBe("100-200-300");

    const rate = {
      country: "EG",
      percent: 14,
      nameEn: "VAT",
      nameAr: "ضريبة القيمة المضافة",
      reverseCharge: false,
      validFrom: "2017-07-01",
      reason: "The law",
    };
    expect(await addTaxRate(business(), { ...rate, by: OWNER })).toBe(true);
    expect(await addTaxRate(business(), { ...rate, by: OWNER })).toBe(false);
    expect(
      (await listTaxRates(business())).find((row) => row.country === "EG"),
    ).toMatchObject({ percent: "14.00" });
  });

  test("keep what each change moved, for the settings' history", async () => {
    const held = await profile(business());
    if (!held) throw new Error("the details were not set");
    expect(
      await saveProfile(business(), {
        legalNameEn: held.legalNameEn,
        legalNameAr: held.legalNameAr,
        addressEn: held.addressEn,
        addressAr: held.addressAr,
        taxNumber: "100-200-301",
        commercialRegistry: held.commercialRegistry,
        email: held.email,
        phone: held.phone,
        website: held.website,
        bankDetailsEn: held.bankDetailsEn,
        bankDetailsAr: held.bankDetailsAr,
        reason: "Re-registered",
        expectedVersion: held.version,
        by: OWNER,
      }),
    ).toBe(true);
    const [latest, ...earlier] = await eventsAbout(business(), [
      "business",
      "tax_rate",
    ]);
    expect(latest).toMatchObject({
      action: "business.profile",
      reason: "Re-registered",
      before: { taxNumber: held.taxNumber },
      after: { taxNumber: "100-200-301" },
    });
    expect(earlier.map((event) => event.action)).toContain("tax_rate.create");
    expect(
      [latest, ...earlier].every((event) =>
        ["business", "tax_rate"].includes(event?.subjectType ?? ""),
      ),
    ).toBe(true);
  });
});
