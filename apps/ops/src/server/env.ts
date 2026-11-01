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
    v.object({
      // The directory as `directory_admin`; only this app holds that login.
      OPS_DIRECTORY_URL: v.pipe(v.string(), v.url()),
      // Where operators reach the console; sign-in returns here.
      OPS_ORIGIN: v.pipe(v.string(), v.url()),
      OPS_OIDC_ISSUER: v.pipe(v.string(), v.url()),
      OPS_OIDC_CLIENT_ID: v.pipe(v.string(), v.minLength(1)),
      OPS_OIDC_CLIENT_SECRET: v.optional(v.pipe(v.string(), v.minLength(1))),
      // Only people in this group of the identity provider may sign in.
      OPS_OIDC_GROUP: v.pipe(v.string(), v.minLength(1)),
      OPS_OIDC_GROUP_CLAIM: v.optional(
        v.pipe(v.string(), v.minLength(1)),
        "groups",
      ),
      OPS_SESSION_SECRET: bytes(32),
      // The cell's provisioner, which creates schools; reachable from this
      // app alone, and trusting only calls signed with the shared secret.
      PROVISION_URL: v.pipe(v.string(), v.url()),
      PROVISION_SECRET: bytes(32),
      // The cells' platform domains and edge address, for the DNS records a
      // school's own host needs; the same values the cells' API holds.
      PORTAL_DOMAIN: domain,
      SITES_DOMAIN: domain,
      // Empty, as compose passes an unset one, means none.
      EDGE_IPV4: v.optional(
        v.union([v.literal(""), v.pipe(v.string(), v.ipv4())]),
      ),
    }),
    process.env,
  );
}
