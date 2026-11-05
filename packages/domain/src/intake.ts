import { createHmac, timingSafeEqual } from "node:crypto";

export const INTAKE_SIGNATURE_HEADER = "x-farida-signature";
export const INTAKE_TIMESTAMP_HEADER = "x-farida-timestamp";
/** How old a signed intake may be, against a replayed one. */
export const INTAKE_TOLERANCE_SECONDS = 300;

const digest = (secret: string, timestamp: string, body: string) =>
  createHmac("sha256", Buffer.from(secret, "base64"))
    .update(`${timestamp}.${body}`)
    .digest();

/**
 * What a cell signs to ask the console for a tenant's billing: the query
 * it sends, so the answer is for that tenant alone.
 */
export const billingQuery = (tenantId: string) =>
  `tenantId=${encodeURIComponent(tenantId)}`;

/** Signs an intake body as a cell sends it to the console. */
export function signIntake(input: {
  secret: string;
  timestamp: number;
  body: string;
}): string {
  return digest(input.secret, String(input.timestamp), input.body).toString(
    "base64",
  );
}

/**
 * Whether an intake body was signed with the shared secret within the
 * tolerance. A resend inside it is answered by the intake id instead.
 */
export function verifyIntake(input: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  body: string;
  now: Date;
}): boolean {
  if (!input.timestamp || !input.signature) return false;
  const seconds = Number(input.timestamp);
  if (
    !Number.isInteger(seconds) ||
    Math.abs(input.now.getTime() / 1000 - seconds) > INTAKE_TOLERANCE_SECONDS
  )
    return false;
  const expected = digest(input.secret, input.timestamp, input.body);
  const given = Buffer.from(input.signature, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}
