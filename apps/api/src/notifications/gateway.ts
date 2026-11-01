import type { Provider } from "./providers";

import { createProvider } from "./providers";
import { ResendProvider } from "./resend";

/** Resend when its key and sender are set, otherwise the webhook, otherwise none. */
export function emailGateway(settings: {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_WEBHOOK_URL?: string;
  NOTIFY_WEBHOOK_TOKEN?: string;
}): Provider | null {
  return settings.RESEND_API_KEY && settings.EMAIL_FROM
    ? new ResendProvider(settings.RESEND_API_KEY, settings.EMAIL_FROM)
    : createProvider(settings.EMAIL_WEBHOOK_URL, settings.NOTIFY_WEBHOOK_TOKEN);
}
