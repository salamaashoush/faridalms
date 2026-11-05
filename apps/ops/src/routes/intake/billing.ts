import {
  customerOfTenant,
  customerById,
} from "@faridalms/database/business/customers";
import {
  invoiceById,
  listInvoices,
} from "@faridalms/database/business/invoices";
import { listTaxRates, profile } from "@faridalms/database/business/profile";
import { rateOn } from "@faridalms/domain/business";
import {
  billingQuery,
  INTAKE_SIGNATURE_HEADER,
  INTAKE_TIMESTAMP_HEADER,
  verifyIntake,
} from "@faridalms/domain/intake";
import { businessToday } from "@faridalms/domain/subscriptions";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { businessDb } from "../../server/business";
import { opsEnv } from "../../server/env";

const answer = (body: unknown, status: number) =>
  Response.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * A tenant's billing as its cell shows it to the school's administrators:
 * its issued invoices and credit notes, what each still owes and its card
 * link, the business's details and bank, and the billing contacts. Asked
 * with the query signed under the shared secret, on the internal network.
 */
export const Route = createFileRoute("/intake/billing")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = opsEnv().INTAKE_SECRET;
        const db = businessDb();
        if (!secret || !db) return answer({ code: "NOT_FOUND" }, 404);
        const tenant = v.safeParse(
          v.pipe(v.string(), v.uuid()),
          new URL(request.url).searchParams.get("tenantId"),
        );
        if (!tenant.success) return answer({ code: "BAD_REQUEST" }, 400);
        if (
          !verifyIntake({
            secret,
            timestamp: request.headers.get(INTAKE_TIMESTAMP_HEADER),
            signature: request.headers.get(INTAKE_SIGNATURE_HEADER),
            body: billingQuery(tenant.output),
            now: new Date(),
          })
        )
          return answer({ code: "UNAUTHORIZED" }, 401);
        const customer = await customerOfTenant(db, tenant.output);
        if (!customer) return answer({ customer: null }, 200);
        const [found, business, rates, rows] = await Promise.all([
          customerById(db, customer.id),
          profile(db),
          listTaxRates(db),
          listInvoices(db, {
            customerId: customer.id,
            states: ["issued", "partly_paid", "paid", "credited"],
          }),
        ]);
        const rate = rateOn(
          rates.map((row) => ({ ...row, percent: Number(row.percent) })),
          customer.country,
          businessToday(),
        );
        const details = await Promise.all(
          rows.map(({ invoice }) => invoiceById(db, invoice.id)),
        );
        return answer(
          {
            customer: {
              name: customer.legalNameEn,
              nameAr: customer.legalNameAr,
              address: customer.address,
              taxNumber: customer.taxNumber,
            },
            business: business && {
              legalNameEn: business.legalNameEn,
              legalNameAr: business.legalNameAr,
              addressEn: business.addressEn,
              addressAr: business.addressAr,
              taxNumber: business.taxNumber,
              commercialRegistry: business.commercialRegistry,
              email: business.email,
              bankDetailsEn: business.bankDetailsEn,
              bankDetailsAr: business.bankDetailsAr,
            },
            vatName: rate ? { en: rate.nameEn, ar: rate.nameAr } : null,
            invoices: details.flatMap((detail) =>
              detail
                ? [
                    {
                      id: detail.invoice.id,
                      number: detail.invoice.number,
                      state: detail.invoice.state,
                      issuedOn: detail.invoice.issuedOn,
                      dueOn: detail.invoice.dueOn,
                      currency: detail.invoice.currency,
                      language: detail.invoice.language,
                      purchaseOrder: detail.invoice.purchaseOrder,
                      vatPercent: Number(detail.invoice.vatPercent),
                      reverseCharge: detail.invoice.reverseCharge,
                      subtotalMinor: detail.invoice.subtotalMinor,
                      vatMinor: detail.invoice.vatMinor,
                      totalMinor: detail.invoice.totalMinor,
                      owedMinor: detail.owedMinor,
                      paymentLinkUrl:
                        detail.owedMinor > 0
                          ? detail.invoice.paymentLinkUrl
                          : null,
                      lines: detail.lines,
                      credits: detail.credits.map((note) => ({
                        id: note.id,
                        number: note.number,
                        issuedOn: note.issuedOn,
                        reason: note.reason,
                        lines: note.lines,
                        subtotalMinor: note.subtotalMinor,
                        vatMinor: note.vatMinor,
                        totalMinor: note.totalMinor,
                      })),
                    },
                  ]
                : [],
            ),
            contacts: (found?.contacts ?? [])
              .filter((contact) => contact.roles.includes("billing"))
              .map((contact) => ({
                name: contact.name,
                email: contact.email,
                phone: contact.phone,
              })),
          },
          200,
        );
      },
    },
  },
});
