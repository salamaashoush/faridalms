import { expect } from "@playwright/test";

/** Where the gate's stand-in for Resend listens (scripts/e2e-resend.ts). */
export const RESEND_STAND_IN = `http://127.0.0.1:${process.env.E2E_RESEND_PORT ?? "3207"}`;
/** The API itself, which Resend's webhook calls. */
export const API_ORIGIN = `http://127.0.0.1:${process.env.E2E_API_PORT ?? "3201"}`;
/** What the gate's API checks a received-mail webhook's signature with. */
export const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET ?? "";

export interface SentEmail {
  text?: string;
  reply_to?: string[];
  subject?: string;
}

/** The email sent to an address with these words, once whoever sends it has. */
export async function sentTo(
  address: string,
  words: string,
): Promise<SentEmail | undefined> {
  let found: SentEmail | undefined;
  await expect
    .poll(
      async () => {
        const sent = (await (
          await fetch(
            `${RESEND_STAND_IN}/e2e/sent?to=${encodeURIComponent(address)}`,
          )
        ).json()) as SentEmail[];
        found = sent.find((email) => email.text?.includes(words));
        return Boolean(found);
      },
      { timeout: 75_000, intervals: [2_000] },
    )
    .toBe(true);
  return found;
}
