import { presentVariables } from "@faridalms/domain/environment";
import { isPlatformDomain } from "@faridalms/domain/hosts";
import * as v from "valibot";

const domain = v.pipe(v.string(), v.toLowerCase(), v.check(isPlatformDomain));

const settings = v.object({
  CELL_ID: v.pipe(v.string(), v.regex(/^[a-z]{2}-[0-9]{1,2}$/)),
  CELL_KEK: v.pipe(
    v.string(),
    v.base64(),
    v.check(
      (value) => Buffer.from(value, "base64").length >= 32,
      "must decode to at least 32 bytes",
    ),
  ),
  CELL_PROVISION_URL: v.pipe(v.string(), v.url()),
  DIRECTORY_URL: v.pipe(v.string(), v.url()),
  DIRECTORY_ADMIN_URL: v.pipe(v.string(), v.url()),
  PORTAL_DOMAIN: domain,
  SITES_DOMAIN: domain,
  CELL_JURISDICTION: v.optional(
    v.pipe(v.string(), v.toUpperCase(), v.regex(/^[A-Z]{2}$/)),
  ),
  RESEND_API_KEY: v.optional(v.string()),
  EMAIL_FROM: v.optional(v.string()),
  EMAIL_WEBHOOK_URL: v.optional(v.pipe(v.string(), v.url())),
  NOTIFY_WEBHOOK_TOKEN: v.optional(v.string()),
  DEMO_PASSWORD: v.optional(v.string()),
});

export type AdminEnv = v.InferOutput<typeof settings>;

/**
 * What `admin.ts` needs: the provisioner's login, the directory's, mail, and
 * a demonstration's password.
 */
export const adminEnv = (): AdminEnv =>
  v.parse(settings, presentVariables(process.env));
