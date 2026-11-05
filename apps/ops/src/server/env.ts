import { presentVariables } from "@faridalms/domain/environment";
import { isHostname } from "@faridalms/domain/hosts";
import * as v from "valibot";

const domain = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.check(
    (value) => value === "localhost" || isHostname(value),
    "must be a domain name",
  ),
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
    ),
    presentVariables(process.env),
  );
}
