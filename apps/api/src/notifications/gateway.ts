import { resendFetch } from "@faridalms/mail/gateway";

import { ResendInbox } from "./resend-inbox";

/** Where received mail is read from: Resend's receiving API. */
export function resendInbox(settings: {
  RESEND_API_KEY: string;
  RESEND_API_URL?: string;
}): ResendInbox {
  return new ResendInbox(
    settings.RESEND_API_KEY,
    resendFetch(settings.RESEND_API_URL),
  );
}
