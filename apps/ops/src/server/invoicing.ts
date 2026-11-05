import {
  customerById,
  listCustomers,
} from "@faridalms/database/business/customers";
import { eventsOf } from "@faridalms/database/business/events";
import {
  allocatePayment,
  creditInvoice,
  draftInvoice,
  InvoiceError,
  invoiceById,
  issueInvoice,
  listInvoices,
  outstanding,
  paymentsOf,
  recordPayment,
  saveDraftInvoice,
  setPaymentLink,
  setTaxAuthorityId,
  unsettledPayments,
} from "@faridalms/database/business/invoices";
import { listTaxRates, profile } from "@faridalms/database/business/profile";
import { rateOn } from "@faridalms/domain/business";
import { invoiceLineSchema, paymentSchema } from "@faridalms/domain/invoices";
import { addDays } from "@faridalms/domain/school";
import { businessToday } from "@faridalms/domain/subscriptions";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { requireArea, requireFreshSignIn } from "./access";
import { requireBusiness } from "./business";
import { opsEnv } from "./env";
import { operatorNames } from "./operators";
import { createPaymentLink, paymob } from "./paymob";

type Outcome<T = object> = ({ ok: true } & T) | { ok: false; message: string };

const uuid = v.pipe(v.string(), v.uuid());
const lines = v.pipe(
  v.array(invoiceLineSchema),
  v.minLength(1),
  v.maxLength(50),
);

const REFUSED: Record<InvoiceError["code"], string> = {
  not_found: "No such invoice.",
  not_draft: "It has been issued, so it no longer changes: credit it instead.",
  not_open:
    "It is not open: a draft is issued first, and a paid or credited one takes nothing more.",
  over_allocated: "That is more than the invoice still owes.",
  over_credited: "That credits more than the invoice still stands for.",
  currency_differs: "The payment and the invoice are in different currencies.",
  customer_differs: "That invoice is another customer's.",
};

async function refused<T extends object>(
  write: () => Promise<T>,
): Promise<Outcome<T>> {
  try {
    return { ok: true, ...(await write()) };
  } catch (error) {
    if (error instanceof InvoiceError)
      return { ok: false, message: REFUSED[error.code] };
    throw error;
  }
}

/** The VAT a customer is charged today, and whether they reverse-charge it. */
async function vatFor(country: string) {
  const rates = await listTaxRates(requireBusiness());
  return rateOn(
    rates.map((rate) => ({ ...rate, percent: Number(rate.percent) })),
    country,
    businessToday(),
  );
}

/** Drafts to issue, invoices still owed with those overdue, and the latest payments. */
export const getBilling = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireArea("readBilling");
    const db = requireBusiness();
    const [rows, customers] = await Promise.all([
      listInvoices(db, { states: ["draft", "issued", "partly_paid"] }),
      listCustomers(db),
    ]);
    const owed = await outstanding(
      db,
      rows.map(({ invoice }) => invoice),
    );
    return {
      today: businessToday(),
      invoices: rows.map(({ invoice, customerName }) => ({
        ...invoice,
        customerName,
        owedMinor: owed.get(invoice.id) ?? invoice.totalMinor,
      })),
      customers: customers.map((row) => ({
        id: row.id,
        legalNameEn: row.legalNameEn,
        currency: row.currency,
      })),
      cards: paymob() !== null,
    };
  },
);

/** A customer's open invoices, for settling a payment against them. */
export const getOpenInvoices = createServerFn({ method: "GET" })
  .validator((input: { customerId: string }) =>
    v.parse(v.object({ customerId: uuid }), input),
  )
  .handler(async ({ data }) => {
    await requireArea("billing");
    const db = requireBusiness();
    const rows = (
      await listInvoices(db, {
        customerId: data.customerId,
        states: ["issued", "partly_paid"],
      })
    ).map(({ invoice }) => invoice);
    const owed = await outstanding(db, rows);
    return rows.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      currency: invoice.currency,
      dueOn: invoice.dueOn,
      owedMinor: owed.get(invoice.id) ?? 0,
    }));
  });

/** An invoice, what paid and credited it, who it is for, and its history. */
export const getInvoice = createServerFn({ method: "GET" })
  .validator((input: { id: string }) => v.parse(v.object({ id: uuid }), input))
  .handler(async ({ data }) => {
    await requireArea("readBilling");
    const db = requireBusiness();
    const detail = await invoiceById(db, data.id);
    if (!detail) throw new Error("NOT_FOUND");
    const [found, business, history, names, rate] = await Promise.all([
      customerById(db, detail.invoice.customerId),
      profile(db),
      eventsOf(db, "invoice", data.id),
      operatorNames(db),
      vatFor(detail.invoice.country),
    ]);
    if (!found) throw new Error("NOT_FOUND");
    const kept = await unsettledPayments(db, found.customer.id);
    return {
      ...detail,
      unsettled: kept
        .filter(({ payment }) => payment.currency === detail.invoice.currency)
        .map(({ payment, leftMinor }) => ({
          id: payment.id,
          method: payment.method,
          receivedOn: payment.receivedOn,
          reference: payment.reference,
          leftMinor: Number(leftMinor),
        })),
      customer: found.customer,
      business,
      history,
      names,
      vatName: rate ? { en: rate.nameEn, ar: rate.nameAr } : null,
      cards: paymob() !== null,
      today: businessToday(),
    };
  });

const newInvoice = v.object({
  customerId: uuid,
  forDay: v.pipe(v.string(), v.isoDate()),
  lines,
});

/** Drafts an invoice by hand, for a service sold once or anything off the schedule. */
export const addInvoice = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof newInvoice>) =>
    v.parse(newInvoice, input),
  )
  .handler(async ({ data }): Promise<Outcome<{ id: string }>> => {
    const { operator } = await requireArea("billing");
    const db = requireBusiness();
    const found = await customerById(db, data.customerId);
    if (!found) return { ok: false, message: "No such customer." };
    const rate = await vatFor(found.customer.country);
    const id = await draftInvoice(db, {
      customerId: found.customer.id,
      subscriptionId: null,
      kind: "manual",
      scheduleKey: null,
      forDay: data.forDay,
      currency: found.customer.currency,
      country: found.customer.country,
      language:
        found.contacts.find((contact) => contact.roles.includes("billing"))
          ?.locale ?? "en",
      vatPercent: rate?.percent ?? 0,
      reverseCharge: rate?.reverseCharge ?? false,
      lines: data.lines,
      by: operator.id,
    });
    if (!id) throw new Error("invoice was not drafted");
    return { ok: true, id };
  });

const draftInput = v.object({
  id: uuid,
  lines,
  purchaseOrder: v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(60),
    v.transform((value) => value || null),
  ),
  language: v.picklist(["en", "ar"]),
});

export const saveInvoiceDraft = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof draftInput>) =>
    v.parse(draftInput, input),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("billing");
    return refused(async () => {
      await saveDraftInvoice(requireBusiness(), { ...data, by: operator.id });
      return {};
    });
  });

/**
 * Issues a draft today. A customer who reverse-charges the VAT must have its
 * tax registration number recorded first, since the invoice cites it.
 */
export const issue = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => v.parse(v.object({ id: uuid }), input))
  .handler(async ({ data }): Promise<Outcome<{ number: string }>> => {
    const { operator } = await requireArea("billing");
    const db = requireBusiness();
    const detail = await invoiceById(db, data.id);
    if (!detail) return { ok: false, message: REFUSED.not_found };
    const found = await customerById(db, detail.invoice.customerId);
    if (detail.invoice.reverseCharge && !found?.customer.taxNumber)
      return {
        ok: false,
        message:
          "The customer accounts for the VAT, so the invoice cites its tax registration number: record it on the customer first.",
      };
    if (!(await profile(db)))
      return {
        ok: false,
        message:
          "Set the business's legal details in Settings first: the invoice carries them.",
      };
    return refused(async () => ({
      number: await issueInvoice(db, {
        id: data.id,
        issuedOn: businessToday(),
        by: operator.id,
      }),
    }));
  });

export const recordCustomerPayment = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof paymentSchema>) =>
    v.parse(paymentSchema, input),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("billing");
    return refused(async () => {
      await recordPayment(requireBusiness(), { ...data, by: operator.id });
      return {};
    });
  });

const creditInput = v.object({
  invoiceId: uuid,
  lines,
  reason: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
});

/** Credits an issued invoice, which asks for a fresh sign-in: it gives money back. */
export const credit = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof creditInput>) =>
    v.parse(creditInput, input),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("billing");
    requireFreshSignIn(operator);
    return refused(async () => ({
      number: await creditInvoice(requireBusiness(), {
        ...data,
        issuedOn: businessToday(),
        by: operator.id,
      }),
    }));
  });

const taxInput = v.object({
  document: v.picklist(["invoice", "credit_note"]),
  id: uuid,
  taxAuthorityId: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
});

/** The tax authority's id for an issued invoice or credit note, entered by finance from it. */
export const recordTaxId = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof taxInput>) => v.parse(taxInput, input))
  .handler(async ({ data }) => {
    const { operator } = await requireArea("billing");
    await setTaxAuthorityId(requireBusiness(), { ...data, by: operator.id });
    return { ok: true };
  });

/**
 * A Paymob link for what an issued invoice still owes, in Egyptian pounds,
 * for the customer to pay by card; its payment arrives by the webhook.
 */
export const makePaymentLink = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => v.parse(v.object({ id: uuid }), input))
  .handler(async ({ data }): Promise<Outcome<{ url: string }>> => {
    const { operator } = await requireArea("billing");
    const account = paymob();
    if (!account)
      return { ok: false, message: "Card payments are not set up." };
    const db = requireBusiness();
    const detail = await invoiceById(db, data.id);
    if (!detail) return { ok: false, message: REFUSED.not_found };
    const { invoice } = detail;
    if (invoice.state !== "issued" && invoice.state !== "partly_paid")
      return { ok: false, message: REFUSED.not_open };
    if (invoice.currency !== "EGP")
      return { ok: false, message: "Cards are taken in Egyptian pounds only." };
    const found = await customerById(db, invoice.customerId);
    const contact =
      found?.contacts.find((row) => row.roles.includes("billing")) ??
      found?.contacts[0];
    try {
      const link = await createPaymentLink(account, {
        amountMinor: detail.owedMinor,
        reference: invoice.number ?? invoice.id,
        description: `Invoice ${invoice.number}`,
        customer: {
          name: contact?.name ?? found?.customer.legalNameEn ?? "",
          email: contact?.email ?? null,
          phone: contact?.phone ?? null,
        },
        notificationUrl: new URL(
          "/payments/paymob",
          opsEnv().OPS_ORIGIN,
        ).toString(),
        expiresAt: `${addDays(businessToday(), 60)}T23:59:59`,
      });
      await setPaymentLink(db, {
        id: invoice.id,
        linkId: link.id,
        orderId: link.orderId,
        url: link.url,
        by: operator.id,
      });
      return { ok: true, url: link.url };
    } catch (error) {
      console.error(
        JSON.stringify({
          paymob: "link",
          invoice: invoice.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        ok: false,
        message: "Paymob did not make the link. Try again in a minute.",
      };
    }
  });

/** A customer's invoices and payments, for its page. */
export const getCustomerBilling = createServerFn({ method: "GET" })
  .validator((input: { customerId: string }) =>
    v.parse(v.object({ customerId: uuid }), input),
  )
  .handler(async ({ data }) => {
    await requireArea("readBilling");
    const db = requireBusiness();
    const [rows, paid] = await Promise.all([
      listInvoices(db, { customerId: data.customerId }),
      paymentsOf(db, data.customerId),
    ]);
    const invoices = rows.map(({ invoice }) => invoice);
    const owed = await outstanding(db, invoices);
    return {
      invoices: invoices.map((invoice) => ({
        ...invoice,
        owedMinor: owed.get(invoice.id) ?? 0,
      })),
      payments: paid,
    };
  });

const allocateInput = v.object({
  paymentId: uuid,
  invoiceId: uuid,
  amountMinor: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

/** Settles what is left of a payment already received against an invoice. */
export const settleFromPayment = createServerFn({ method: "POST" })
  .validator((input: v.InferInput<typeof allocateInput>) =>
    v.parse(allocateInput, input),
  )
  .handler(async ({ data }) => {
    const { operator } = await requireArea("billing");
    return refused(async () => {
      await allocatePayment(requireBusiness(), {
        paymentId: data.paymentId,
        allocations: [
          { invoiceId: data.invoiceId, amountMinor: data.amountMinor },
        ],
        by: operator.id,
      });
      return {};
    });
  });
