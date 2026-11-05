import { savePlanVersion } from "@faridalms/database/business/catalogue";
import { saveCustomer } from "@faridalms/database/business/customers";
import {
  creditInvoice,
  InvoiceError,
  invoiceById,
  issueInvoice,
  listInvoices,
  recordPayment,
} from "@faridalms/database/business/invoices";
import { addTaxRate } from "@faridalms/database/business/profile";
import {
  addItem,
  createSubscription,
  openSubscription,
} from "@faridalms/database/business/subscriptions";
import { BASIC_MODULES } from "@faridalms/domain/modules";
import { describe, expect, test } from "bun:test";

import { billingRound } from "../src/server/billing";
import { business, directory, reportStudents, tenantWith } from "./harness";

const OWNER = "op-owner";
const GIB = 1024 ** 3;
const deps = () => ({ business: business(), directory: directory() });

async function contract(slug: string) {
  const { tenantId, schoolIds } = await tenantWith([slug]);
  const plan = await savePlanVersion(business(), {
    code: `plan_${slug.replaceAll("-", "_")}`,
    nameEn: "Standard",
    nameAr: "القياسية",
    modules: [...BASIC_MODULES],
    limits: {
      poolBytes: 100 * GIB,
      classBytes: GIB,
      moduleBytes: GIB,
      personBytes: GIB / 2,
      students: null,
      staffAccounts: null,
      videoHours: null,
      customDomains: null,
      emailPerMonth: null,
      captionMinutes: null,
    },
    prices: [
      {
        currency: "EGP",
        unit: "student_year",
        amountMinor: 35_000,
        minimumMinor: 0,
      },
    ],
    validFrom: "2026-09-01",
    reason: "Sold",
    by: OWNER,
  });
  const customerId = await saveCustomer(business(), {
    legalNameEn: `${slug} schools`,
    legalNameAr: null,
    taxNumber: "123-456-789",
    commercialRegistry: null,
    address: null,
    country: "EG",
    currency: "EGP",
    reason: "Signed",
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
      schedule: "three",
      contractedStudents: 300,
      censusOn: "2026-10-31",
      notice: null,
    },
    items: [
      {
        planVersionId: plan,
        addOnVersionId: null,
        quantity: 300,
        unitPriceMinor: 35_000,
        discountPercent: 0,
        schoolIds: [],
        startsOn: "2026-09-01",
      },
    ],
    by: OWNER,
    reason: "Signed",
  });
  return { tenantId, schoolIds, customerId, subscriptionId, plan };
}

describe("the billing schedule", () => {
  test("drafts each instalment once, before it falls due, with VAT", async () => {
    await addTaxRate(business(), {
      country: "EG",
      percent: 14,
      nameEn: "VAT",
      nameAr: "ضريبة القيمة المضافة",
      reverseCharge: false,
      validFrom: "2016-07-01",
      reason: "The law",
      by: OWNER,
    });
    const { customerId } = await contract("linden");
    expect((await billingRound(deps(), "2026-08-01", OWNER)).drafted).toBe(0);
    await billingRound(deps(), "2026-08-20", OWNER);
    await billingRound(deps(), "2026-08-21", OWNER);
    const first = await listInvoices(business(), { customerId });
    expect(first).toHaveLength(1);
    expect(first[0]?.invoice).toMatchObject({
      kind: "instalment",
      forDay: "2026-09-01",
      state: "draft",
      // A third of 300 at 350.00, with 14% VAT.
      subtotalMinor: 3_500_000,
      vatMinor: 490_000,
      totalMinor: 3_990_000,
    });
    await billingRound(deps(), "2026-12-20", OWNER);
    expect(await listInvoices(business(), { customerId })).toHaveLength(2);
  });

  test("prorates an item added in the term and trues up the census", async () => {
    const { customerId, subscriptionId, plan, schoolIds } =
      await contract("aspen");
    await addItem(business(), {
      subscriptionId,
      planVersionId: plan,
      addOnVersionId: null,
      quantity: 12,
      unitPriceMinor: 10_000,
      discountPercent: 0,
      schoolIds: [],
      startsOn: "2027-01-15",
      reason: "More seats",
      by: OWNER,
    });
    const [school] = schoolIds;
    if (!school) throw new Error("school");
    await reportStudents(school, 330);
    await billingRound(deps(), "2027-01-15", OWNER);
    const rows = (await listInvoices(business(), { customerId })).map(
      ({ invoice }) => invoice,
    );
    // 12 at 100.00 for 8 of the 12 months: 800.00.
    expect(rows.find((row) => row.kind === "proration")).toMatchObject({
      subtotalMinor: 80_000,
    });
    // 30 students past the 300 contracted, from 31 October: 11 of 12 months.
    expect(rows.find((row) => row.kind === "true_up")).toMatchObject({
      subtotalMinor: Math.round(30 * 35_000 * (11 / 12)),
    });
  });

  test("renews a term that ended on its own", async () => {
    const { tenantId } = await contract("hornbeam");
    const { renewed } = await billingRound(deps(), "2027-09-01", OWNER);
    expect(renewed).toBeGreaterThanOrEqual(1);
    expect(await openSubscription(business(), tenantId)).toMatchObject({
      termStartsOn: "2027-09-01",
      termEndsOn: "2028-09-01",
      censusOn: "2027-10-31",
    });
  });
});

describe("an invoice", () => {
  test("is issued with the next number, paid in parts, withheld, and credited", async () => {
    const { customerId } = await contract("rowan-billing");
    await billingRound(deps(), "2026-08-25", OWNER);
    const [row] = await listInvoices(business(), { customerId });
    if (!row) throw new Error("invoice");
    const id = row.invoice.id;
    const number = await issueInvoice(business(), {
      id,
      issuedOn: "2026-08-25",
      by: OWNER,
    });
    expect(number).toMatch(/^INV-2026-\d{5}$/);
    expect((await invoiceById(business(), id))?.invoice).toMatchObject({
      dueOn: "2026-09-24",
      state: "issued",
    });

    const total = row.invoice.totalMinor;
    const withheld = Math.round(total * 0.03);
    await recordPayment(business(), {
      customerId,
      method: "bank_transfer",
      currency: "EGP",
      amountMinor: total - withheld - 1000,
      receivedOn: "2026-09-10",
      reference: number,
      feeMinor: 0,
      allocations: [{ invoiceId: id, amountMinor: total - withheld - 1000 }],
      by: OWNER,
    });
    expect((await invoiceById(business(), id))?.invoice.state).toBe(
      "partly_paid",
    );
    expect(
      await recordPayment(business(), {
        customerId,
        method: "withholding_certificate",
        currency: "EGP",
        amountMinor: withheld + 5000,
        receivedOn: "2026-09-12",
        reference: "Certificate 77",
        feeMinor: 0,
        allocations: [{ invoiceId: id, amountMinor: withheld + 5000 }],
        by: OWNER,
      }).catch((error: unknown) => error),
    ).toBeInstanceOf(InvoiceError);
    await recordPayment(business(), {
      customerId,
      method: "withholding_certificate",
      currency: "EGP",
      amountMinor: withheld,
      receivedOn: "2026-09-12",
      reference: "Certificate 77",
      feeMinor: 0,
      allocations: [{ invoiceId: id, amountMinor: withheld }],
      by: OWNER,
    });
    const detail = await invoiceById(business(), id);
    expect(detail?.owedMinor).toBe(1000);

    const credit = await creditInvoice(business(), {
      invoiceId: id,
      lines: [
        {
          descriptionEn: "Rounding agreed",
          descriptionAr: "تقريب متفق عليه",
          itemCode: null,
          periodStart: null,
          periodEnd: null,
          quantity: 1,
          unitPriceMinor: Math.round(1000 / 1.14),
          discountPercent: 0,
        },
      ],
      reason: "Agreed with the school",
      issuedOn: "2026-09-15",
      by: OWNER,
    });
    expect(credit).toMatch(/^CN-2026-\d{5}$/);
    expect((await invoiceById(business(), id))?.invoice.state).toBe("paid");

    // A provider's transaction is recorded once.
    const card = {
      customerId,
      method: "card" as const,
      currency: "EGP" as const,
      amountMinor: 100,
      receivedOn: "2026-09-16",
      reference: "Card",
      feeMinor: 0,
      allocations: [],
      providerTransactionId: "txn-1",
      by: OWNER,
    };
    expect(await recordPayment(business(), card)).not.toBeNull();
    expect(await recordPayment(business(), card)).toBeNull();
  });
});
