import { createHmac, timingSafeEqual } from "node:crypto";

/** A transaction as Paymob's processed callback sends it, the fields its HMAC covers. */
export interface PaymobTransaction {
  id: number;
  amount_cents: number;
  created_at: string;
  currency: string;
  error_occured: boolean;
  has_parent_transaction: boolean;
  integration_id: number;
  is_3d_secure: boolean;
  is_auth: boolean;
  is_capture: boolean;
  is_refunded: boolean;
  is_standalone_payment: boolean;
  is_voided: boolean;
  order: { id: number };
  owner: number;
  pending: boolean;
  source_data: { pan: string; sub_type: string; type: string };
  success: boolean;
}

/**
 * The string Paymob signs for a processed transaction: these values, in
 * this order, run together (developers.paymob.com, HMAC Transaction
 * Callback).
 */
export function paymobSigned(obj: PaymobTransaction): string {
  return [
    obj.amount_cents,
    obj.created_at,
    obj.currency,
    obj.error_occured,
    obj.has_parent_transaction,
    obj.id,
    obj.integration_id,
    obj.is_3d_secure,
    obj.is_auth,
    obj.is_capture,
    obj.is_refunded,
    obj.is_standalone_payment,
    obj.is_voided,
    obj.order.id,
    obj.owner,
    obj.pending,
    obj.source_data.pan,
    obj.source_data.sub_type,
    obj.source_data.type,
    obj.success,
  ]
    .map(String)
    .join("");
}

/** The callback's HMAC: SHA-512 under the account's HMAC secret, in hex. */
export const paymobHmac = (obj: PaymobTransaction, secret: string) =>
  createHmac("sha512", secret).update(paymobSigned(obj)).digest("hex");

/** Whether a processed callback was signed with the account's HMAC secret. */
export function verifyPaymob(
  obj: PaymobTransaction,
  hmac: string | null,
  secret: string,
): boolean {
  if (!hmac) return false;
  const expected = Buffer.from(paymobHmac(obj, secret), "hex");
  const given = Buffer.from(hmac.toLowerCase(), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
