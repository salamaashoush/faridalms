import { describe, expect, it } from "vitest";

import type { PaymobTransaction } from "./paymob";

import { paymobHmac, paymobSigned, verifyPaymob } from "./paymob";

/** The sample processed callback in Paymob's HMAC documentation. */
const sample: PaymobTransaction = {
  id: 192036465,
  amount_cents: 100000,
  created_at: "2024-06-13T11:33:44.592345",
  currency: "EGP",
  error_occured: false,
  has_parent_transaction: false,
  integration_id: 4097558,
  is_3d_secure: true,
  is_auth: false,
  is_capture: false,
  is_refunded: false,
  is_standalone_payment: true,
  is_voided: false,
  order: { id: 217503754 },
  owner: 302852,
  pending: false,
  source_data: { pan: "2346", sub_type: "MasterCard", type: "card" },
  success: true,
};

describe("a Paymob callback", () => {
  it("signs the values Paymob's documentation runs together, in its order", () => {
    expect(paymobSigned(sample)).toBe(
      "1000002024-06-13T11:33:44.592345EGPfalsefalse1920364654097558truefalsefalsefalsetruefalse217503754302852false2346MasterCardcardtrue",
    );
  });

  it("is taken only with the account's HMAC, whatever its case", () => {
    const hmac = paymobHmac(sample, "secret");
    expect(verifyPaymob(sample, hmac, "secret")).toBe(true);
    expect(verifyPaymob(sample, hmac.toUpperCase(), "secret")).toBe(true);
    expect(verifyPaymob(sample, hmac, "another")).toBe(false);
    expect(verifyPaymob({ ...sample, amount_cents: 1 }, hmac, "secret")).toBe(
      false,
    );
    expect(verifyPaymob(sample, null, "secret")).toBe(false);
  });
});
