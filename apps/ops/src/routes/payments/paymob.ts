import type { PaymobTransaction } from "@faridalms/domain/paymob";

import {
  invoiceById,
  invoiceOfPaymentOrder,
  recordPayment,
} from "@faridalms/database/business/invoices";
import { verifyPaymob } from "@faridalms/domain/paymob";
import { businessToday } from "@faridalms/domain/subscriptions";
import { createFileRoute } from "@tanstack/react-router";

import { businessDb } from "../../server/business";
import { paymob } from "../../server/paymob";

const answer = (status: number) =>
  new Response(null, { status, headers: { "cache-control": "no-store" } });

/**
 * Where Paymob tells the console a transaction was processed. Taken only
 * when its HMAC checks; a successful payment for an invoice's link is
 * recorded once, by Paymob's transaction id, against what the invoice
 * still owes. Anything else is acknowledged and left.
 */
export const Route = createFileRoute("/payments/paymob")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const account = paymob();
        const db = businessDb();
        if (!account || !db) return answer(404);
        const body = (await request.json().catch(() => null)) as {
          type?: string;
          obj?: PaymobTransaction;
        } | null;
        const obj = body?.obj;
        if (body?.type !== "TRANSACTION" || !obj?.order) return answer(400);
        if (
          !verifyPaymob(
            obj,
            new URL(request.url).searchParams.get("hmac"),
            account.hmacSecret,
          )
        )
          return answer(401);
        if (!obj.success || obj.pending || obj.is_voided || obj.is_refunded)
          return answer(200);
        const invoice = await invoiceOfPaymentOrder(db, String(obj.order.id));
        if (!invoice || invoice.currency !== obj.currency) {
          console.error(
            JSON.stringify({
              paymob: "unmatched",
              transaction: obj.id,
              order: obj.order.id,
            }),
          );
          return answer(200);
        }
        const detail = await invoiceById(db, invoice.id);
        const owed = detail?.owedMinor ?? 0;
        const open =
          invoice.state === "issued" || invoice.state === "partly_paid";
        await recordPayment(db, {
          customerId: invoice.customerId,
          method: "card",
          currency: invoice.currency,
          amountMinor: obj.amount_cents,
          feeMinor: 0,
          receivedOn: businessToday(),
          reference: `Paymob ${obj.id}`,
          providerTransactionId: String(obj.id),
          allocations:
            open && owed > 0
              ? [
                  {
                    invoiceId: invoice.id,
                    amountMinor: Math.min(owed, obj.amount_cents),
                  },
                ]
              : [],
          by: "paymob",
        });
        return answer(200);
      },
    },
  },
});
