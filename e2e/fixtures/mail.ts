/** Where the gate's stand-in for Resend listens (scripts/e2e-resend.ts). */
export const RESEND_STAND_IN = `http://127.0.0.1:${process.env.E2E_RESEND_PORT ?? "3207"}`;
/** The API itself, which Resend's webhook calls. */
export const API_ORIGIN = `http://127.0.0.1:${process.env.E2E_API_PORT ?? "3201"}`;
/** What the gate's API checks a received-mail webhook's signature with. */
export const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET ?? "";
