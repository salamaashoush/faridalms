import { presentVariables } from "@faridalms/domain/environment";
import { isPlatformDomain } from "@faridalms/domain/hosts";
import * as v from "valibot";

const domain = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.check(isPlatformDomain, "must be a domain name"),
);

// A comma-separated list of addresses, compared as the provider's verified
// email claim is: trimmed and lower-cased.
const emails = v.pipe(
  v.string(),
  v.transform((value) =>
    value
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email !== ""),
  ),
  v.array(v.pipe(v.string(), v.email())),
  v.minLength(1, "must name at least one email address"),
);

const bytes = (length: number) =>
  v.pipe(
    v.string(),
    v.base64(),
    v.check(
      (value) => Buffer.from(value, "base64").length >= length,
      `must decode to at least ${length} bytes`,
    ),
  );

/** Read when first used, so a build never needs the secrets. */
export function opsEnv() {
  return v.parse(
    v.pipe(
      v.object({
        // The directory as `directory_admin`; only this app holds that login.
        OPS_DIRECTORY_URL: v.pipe(v.string(), v.url()),
        // The business database as `business_admin`: customers, contracts,
        // invoices and operators' roles. Without it the console is the
        // self-hosted one: every operator is an owner and nothing is sold.
        BUSINESS_DATABASE_URL: v.optional(v.pipe(v.string(), v.url())),
        // Where operators reach the console; sign-in returns here.
        OPS_ORIGIN: v.pipe(v.string(), v.url()),
        OPS_OIDC_ISSUER: v.pipe(v.string(), v.url()),
        OPS_OIDC_CLIENT_ID: v.pipe(v.string(), v.minLength(1)),
        OPS_OIDC_CLIENT_SECRET: v.optional(v.pipe(v.string(), v.minLength(1))),
        // Who may sign in: either the members of this group of the identity
        // provider, or, for a provider without groups such as Google, the
        // accounts whose verified email is listed. Exactly one is set.
        OPS_OIDC_GROUP: v.optional(v.pipe(v.string(), v.minLength(1))),
        OPS_OIDC_EMAILS: v.optional(emails),
        OPS_OIDC_GROUP_CLAIM: v.optional(
          v.pipe(v.string(), v.minLength(1)),
          "groups",
        ),
        OPS_SESSION_SECRET: bytes(32),
        // The cell's provisioner, which creates schools; reachable from this
        // app alone, and trusting only calls signed with the shared secret.
        PROVISION_URL: v.pipe(v.string(), v.url()),
        PROVISION_SECRET: bytes(32),
        // The secret the cells sign the leads they send with, at
        // /intake/leads; without it, or a business database, none is taken.
        INTAKE_SECRET: v.optional(bytes(32)),
        // Card payments through Paymob payment links, all four or none:
        // the account's API key, the card integration's id, the HMAC
        // secret its callbacks are signed with, and whether the
        // integration is live. Its region's host, Egypt's by default.
        PAYMOB_API_KEY: v.optional(v.pipe(v.string(), v.minLength(1))),
        PAYMOB_INTEGRATION_ID: v.optional(v.pipe(v.string(), v.regex(/^\d+$/))),
        PAYMOB_HMAC_SECRET: v.optional(v.pipe(v.string(), v.minLength(1))),
        PAYMOB_LIVE: v.optional(v.picklist(["true", "false"])),
        PAYMOB_BASE_URL: v.optional(
          v.pipe(v.string(), v.url()),
          "https://accept.paymob.com",
        ),
        // Email to customers' billing contacts, through Resend, from the
        // business's billing address (EMAIL_FROM, such as
        // `Billing <billing@example.com>`); both or neither. Unset, the
        // clock still runs and notes that it emailed nobody.
        RESEND_API_KEY: v.optional(v.pipe(v.string(), v.minLength(1))),
        EMAIL_FROM: v.optional(v.pipe(v.string(), v.minLength(3))),
        // Another server answering as Resend's API, such as the end-to-end
        // gate's stand-in. Unset, Resend's own.
        RESEND_API_URL: v.optional(v.pipe(v.string(), v.url())),
        // The cells' platform domains and edge address, for the DNS records a
        // school's own host needs; the same values the cells' API holds.
        PORTAL_DOMAIN: domain,
        SITES_DOMAIN: domain,
        EDGE_IPV4: v.optional(v.pipe(v.string(), v.ipv4())),
      }),
      v.check(
        (value) =>
          (value.OPS_OIDC_GROUP === undefined) !==
          (value.OPS_OIDC_EMAILS === undefined),
        "Set OPS_OIDC_GROUP or OPS_OIDC_EMAILS, and not both",
      ),
      v.check(
        (value) =>
          new Set(
            [
              value.PAYMOB_API_KEY,
              value.PAYMOB_INTEGRATION_ID,
              value.PAYMOB_HMAC_SECRET,
              value.PAYMOB_LIVE,
            ].map((setting) => setting === undefined),
          ).size === 1,
        "Set PAYMOB_API_KEY, PAYMOB_INTEGRATION_ID, PAYMOB_HMAC_SECRET and PAYMOB_LIVE together, or none",
      ),
      v.check(
        (value) =>
          (value.RESEND_API_KEY === undefined) ===
          (value.EMAIL_FROM === undefined),
        "Set RESEND_API_KEY and EMAIL_FROM together, or neither",
      ),
    ),
    presentVariables(process.env),
  );
}
