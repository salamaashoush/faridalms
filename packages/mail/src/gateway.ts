import type { Provider } from "./providers";

import { createProvider } from "./providers";
import { ResendProvider } from "./resend";

/**
 * Resend's API, or the server named by RESEND_API_URL in its place, such as
 * an egress proxy or the end-to-end gate's stand-in.
 */
export function resendFetch(base: string | undefined): typeof fetch {
  if (!base) return fetch;
  const root = base.replace(/\/$/, "");
  return ((input: string | URL | Request, init?: RequestInit) =>
    fetch(
      String(input instanceof Request ? input.url : input).replace(
        "https://api.resend.com",
        root,
      ),
      init,
    )) as typeof fetch;
}

/** Resend when its key and sender are set, otherwise the webhook, otherwise none. */
export function emailGateway(
  settings: {
    RESEND_API_KEY?: string;
    RESEND_API_URL?: string;
    EMAIL_FROM?: string;
    EMAIL_WEBHOOK_URL?: string;
    NOTIFY_WEBHOOK_TOKEN?: string;
  },
  agent?: string,
): Provider | null {
  return settings.RESEND_API_KEY && settings.EMAIL_FROM
    ? new ResendProvider(settings.RESEND_API_KEY, settings.EMAIL_FROM, {
        fetcher: resendFetch(settings.RESEND_API_URL),
        agent,
      })
    : createProvider(settings.EMAIL_WEBHOOK_URL, settings.NOTIFY_WEBHOOK_TOKEN);
}
