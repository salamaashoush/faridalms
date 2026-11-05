import { opsEnv } from "./env";

/** Paymob as the console reaches it, or null where card payments are not set up. */
export function paymob() {
  const env = opsEnv();
  if (
    !env.PAYMOB_API_KEY ||
    !env.PAYMOB_INTEGRATION_ID ||
    !env.PAYMOB_HMAC_SECRET ||
    !env.PAYMOB_LIVE
  )
    return null;
  return {
    baseUrl: env.PAYMOB_BASE_URL,
    apiKey: env.PAYMOB_API_KEY,
    integrationId: env.PAYMOB_INTEGRATION_ID,
    hmacSecret: env.PAYMOB_HMAC_SECRET,
    live: env.PAYMOB_LIVE === "true",
  };
}

export type Paymob = NonNullable<ReturnType<typeof paymob>>;

/** A bearer token for Paymob's API, for the next hour. */
async function token(account: Paymob): Promise<string> {
  const response = await fetch(new URL("/api/auth/tokens", account.baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: account.apiKey }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => null)) as {
    token?: string;
  } | null;
  if (!response.ok || !body?.token)
    throw new Error(`paymob.auth_${response.status}`);
  return body.token;
}

/**
 * A payment link for an amount, which Paymob's hosted page takes by card,
 * telling the notification URL when it is paid. Answers the link, its
 * address and the order Paymob made for it, which the callback names.
 */
export async function createPaymentLink(
  account: Paymob,
  input: {
    amountMinor: number;
    reference: string;
    description: string;
    customer: { name: string; email: string | null; phone: string | null };
    notificationUrl: string;
    expiresAt: string;
  },
): Promise<{ id: string; url: string; orderId: string }> {
  const form = new FormData();
  form.set("amount_cents", String(input.amountMinor));
  form.set("payment_methods", account.integrationId);
  form.set("is_live", String(account.live));
  form.set("reference_id", input.reference);
  form.set("description", input.description);
  form.set("full_name", input.customer.name);
  if (input.customer.email) form.set("email", input.customer.email);
  if (input.customer.phone) form.set("phone_number", input.customer.phone);
  form.set("notification_url", input.notificationUrl);
  form.set("expires_at", input.expiresAt);
  const response = await fetch(
    new URL("/api/ecommerce/payment-links", account.baseUrl),
    {
      method: "POST",
      headers: { authorization: `Bearer ${await token(account)}` },
      body: form,
      signal: AbortSignal.timeout(15_000),
    },
  );
  const body = (await response.json().catch(() => null)) as {
    id?: number | string;
    client_url?: string;
    shorten_url?: string;
    order?: number | string;
  } | null;
  const url = body?.client_url ?? body?.shorten_url;
  if (
    !response.ok ||
    body?.id === undefined ||
    !url ||
    body.order === undefined
  )
    throw new Error(`paymob.link_${response.status}`);
  return { id: String(body.id), url, orderId: String(body.order) };
}
