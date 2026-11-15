import type { AgreementError } from "@faridalms/database/business/agreements";

import {
  acceptancesOf,
  agreementsInForce,
  publishAgreementVersion,
  recordAcceptance,
} from "@faridalms/database/business/agreements";
import {
  customerById,
  saveCustomer,
} from "@faridalms/database/business/customers";
import { intakeLead, leadById } from "@faridalms/database/business/leads";
import {
  acceptQuote,
  createQuote,
  markQuoteSent,
  quoteById,
} from "@faridalms/database/business/quotes";
import {
  agreementDigest,
  CUSTOMER_LINK_ACTOR,
} from "@faridalms/domain/agreements";
import { blankDraft } from "@faridalms/domain/provisioning-draft";
import { quoteTotals } from "@faridalms/domain/quotes";
import { SQL } from "bun";
import { describe, expect, test } from "bun:test";

import { business, businessUrl } from "./harness";

const OWNER = "op-owner";

async function publish(kind: "terms" | "dpa", version: string, from: string) {
  const words = { bodyEn: `# ${kind} ${version}`, bodyAr: null };
  return publishAgreementVersion(business(), {
    kind,
    version,
    effectiveOn: from,
    ...words,
    digest: await agreementDigest(words),
    reason: "Reviewed by counsel",
    by: OWNER,
  });
}

describe("an agreement", () => {
  test("is published once per version, and the latest in effect is in force", async () => {
    await publish("terms", "t-2026-01", "2026-01-01");
    await publish("terms", "t-2027-01", "2027-01-01");
    expect(
      await publish("terms", "t-2026-01", "2026-02-01").catch(
        (error: AgreementError) => error.code,
      ),
    ).toBe("exists");
    expect(
      (await agreementsInForce(business(), "2026-06-01")).terms?.version,
    ).toBe("t-2026-01");
    expect(
      (await agreementsInForce(business(), "2027-06-01")).terms?.version,
    ).toBe("t-2027-01");
    const sql = new SQL(businessUrl());
    try {
      expect(
        await sql`update agreement_versions set body_en = 'changed'`.catch(
          (error: Error) => error.message,
        ),
      ).toContain("permission denied");
    } finally {
      await sql.close();
    }
  });

  test("accepted on paper keeps the signed copy and becomes the customer's version", async () => {
    const versionId = await publish("dpa", "d-paper", "2026-01-01");
    const customerId = await saveCustomer(business(), {
      legalNameEn: "Hazel Schools",
      legalNameAr: null,
      taxNumber: null,
      commercialRegistry: null,
      address: null,
      country: "EG",
      currency: "EGP",
      reason: "Signed",
      by: OWNER,
      tenantId: null,
    });
    if (!customerId) throw new Error("customer");
    // A paper acceptance needs its signed copy.
    expect(
      await recordAcceptance(business(), {
        customerId,
        versionId,
        method: "paper",
        signer: { name: "Salama Ashoush", title: null, email: null },
        ip: null,
        userAgent: null,
        attachment: null,
        recordedBy: OWNER,
      }).catch(
        (error: Error) =>
          (error.cause as { constraint?: string } | undefined)?.constraint,
      ),
    ).toBe("agreement_acceptances_paper_check");
    await recordAcceptance(business(), {
      customerId,
      versionId,
      method: "paper",
      signer: { name: "Salama Ashoush", title: "Head", email: null },
      ip: null,
      userAgent: null,
      attachment: {
        name: "dpa.pdf",
        type: "application/pdf",
        bytes: new TextEncoder().encode("%PDF-1.4"),
      },
      recordedBy: OWNER,
    });
    expect(
      (await customerById(business(), customerId))?.customer,
    ).toMatchObject({ dpaVersion: "d-paper" });
    expect(await acceptancesOf(business(), customerId)).toMatchObject([
      {
        kind: "dpa",
        version: "d-paper",
        method: "paper",
        signerName: "Salama Ashoush",
        attachmentName: "dpa.pdf",
        recordedBy: OWNER,
      },
    ]);
  });
});

describe("a quote accepted through its link", () => {
  test("makes the customer from what it gave, records who signed the agreements, and starts a complete draft", async () => {
    const terms = await publish("terms", "t-link", "2026-01-01");
    const dpa = await publish("dpa", "d-link", "2026-01-01");
    const { id: leadId } = await intakeLead(business(), {
      source: "demo_form",
      intakeId: crypto.randomUUID(),
      name: "Salama Ashoush",
      email: "salama@linden.example.com",
      phone: "+20 100 000 0000",
      organisation: "Linden Academy",
      role: "leader",
      size: "200_1000",
      country: "EG",
      locale: "en",
      message: null,
      schoolId: null,
      tenantId: null,
      module: null,
    });
    const lines = [
      {
        kind: "plan" as const,
        versionId: crypto.randomUUID(),
        nameEn: "Standard",
        nameAr: "القياسية",
        unit: "student_year" as const,
        quantity: 100,
        unitPriceMinor: 35_000,
        discountPercent: 0,
      },
    ];
    const id = await createQuote(business(), {
      spec: {
        currency: "EGP",
        planVersionId: lines[0]?.versionId ?? null,
        quantity: 100,
        unitPriceMinor: 35_000,
        discountPercent: 0,
        addOns: [],
        termStartsOn: "2026-09-01",
        termEndsOn: "2027-09-01",
        schedule: "annual",
        validUntil: "2026-12-01",
        notesEn: null,
        notesAr: null,
      },
      lines,
      country: "EG",
      totals: quoteTotals({ lines, vatPercent: 14, schedule: "annual" }),
      leadId,
      customerId: null,
      year: "2026",
      by: OWNER,
    });
    await markQuoteSent(business(), {
      id,
      by: OWNER,
      offer: {
        link: crypto.randomUUID(),
        to: {
          name: "Salama Ashoush",
          email: "salama@linden.example.com",
          locale: "en",
        },
        school: {
          nameEn: "Linden Academy",
          nameAr: null,
          slug: "linden-academy",
        },
      },
    });
    const { customerId, draftId } = await acceptQuote(business(), {
      id,
      evidence: {
        kind: "link",
        signer: {
          name: "Salama Ashoush",
          title: "Head of school",
          email: "salama@linden.example.com",
        },
        ip: "203.0.113.7",
        userAgent: "Mozilla/5.0",
        agreementVersionIds: [terms, dpa],
      },
      newCustomer: {
        legalNameEn: "Linden Academy LLC",
        legalNameAr: null,
        taxNumber: "555-666-777",
        commercialRegistry: null,
        address: "2 Example Road, Giza",
        country: "EG",
        contact: {
          name: "Salama Ashoush",
          email: "salama@linden.example.com",
          phone: null,
          roles: ["decision_maker"],
          locale: "en",
        },
      },
      draft: () => blankDraft({ cellId: "eg-1", trialEndsOn: "2026-09-01" }),
      draftStep: "review",
      by: CUSTOMER_LINK_ACTOR,
    });
    expect(await quoteById(business(), id)).toMatchObject({
      state: "accepted",
      signerName: "Salama Ashoush",
      signerTitle: "Head of school",
      attachmentName: null,
    });
    expect(
      (await customerById(business(), customerId))?.customer,
    ).toMatchObject({
      legalNameEn: "Linden Academy LLC",
      taxNumber: "555-666-777",
      termsVersion: "t-link",
      dpaVersion: "d-link",
    });
    expect(
      (await acceptancesOf(business(), customerId)).map((row) => [
        row.kind,
        row.method,
        row.ip,
      ]),
    ).toEqual(
      expect.arrayContaining([
        ["terms", "link", "203.0.113.7"],
        ["dpa", "link", "203.0.113.7"],
      ]),
    );
    expect((await leadById(business(), leadId))?.lead.state).toBe("won");
    const sql = new SQL(businessUrl());
    try {
      const [draft] =
        await sql`select step, created_by from provisioning_drafts where id = ${draftId}`;
      expect(draft).toMatchObject({
        step: "review",
        created_by: CUSTOMER_LINK_ACTOR,
      });
    } finally {
      await sql.close();
    }
  });
});
