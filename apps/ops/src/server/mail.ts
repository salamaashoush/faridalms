import type { Provider } from "@faridalms/mail/providers";

import { emailGateway } from "@faridalms/mail/gateway";

import { opsEnv } from "./env";

let provider: Provider | null | undefined;

/**
 * The console's email to customers' contacts, kept for the life of the
 * process so Resend's rate window is paced across sends; null when unset.
 */
export function consoleMail(): Provider | null {
  if (provider === undefined)
    provider = emailGateway(opsEnv(), "faridalms-ops");
  return provider;
}
