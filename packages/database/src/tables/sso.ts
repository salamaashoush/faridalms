import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { boolean, jsonb, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { loginIdentities } from "./accounts";
import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  eraseAndDelete,
  fk,
  pk,
  tenantColumns,
} from "./conventions";
import { orgs, tenants } from "./tenancy";

export const identityProviders = core.table.withRLS(
  "identity_providers",
  {
    ...tenantColumns(),
    protocol: text("protocol")
      .$type<"oidc" | "saml" | "clever" | "classlink">()
      .notNull(),
    displayNameEn: text("display_name_en"),
    displayNameAr: text("display_name_ar"),
    issuer: text("issuer").notNull(),
    clientId: text("client_id"),
    metadataUrl: text("metadata_url"),
    allowedIssuerTenants: text("allowed_issuer_tenants")
      .array()
      .notNull()
      .default(sql`'{}'`),
    linkPolicy: text("link_policy")
      .$type<
        | "roster_external_id"
        | "verified_domain_email"
        | "invitation_only"
        | "admin_approval"
      >()
      .notNull()
      .default("roster_external_id"),
    provisionPolicy: text("provision_policy")
      .$type<"none" | "jit_membership">()
      .notNull()
      .default("none"),
    attributeMapping: jsonb("attribute_mapping")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    enabled: boolean("enabled").notNull().default(false),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("identity_providers", t.tenantId, t.id),
    ...baseConstraints("identity_providers", t, tenants),
    ck(
      "identity_providers",
      "protocol",
      sql`protocol in ('oidc', 'saml', 'clever', 'classlink')`,
    ),
    ck(
      "identity_providers",
      "display_name_en",
      sql`char_length(display_name_en) between 1 and 80`,
    ),
    ck(
      "identity_providers",
      "display_name_ar",
      sql`char_length(display_name_ar) between 1 and 80`,
    ),
    ck(
      "identity_providers",
      "issuer",
      sql`char_length(issuer) between 1 and 512`,
    ),
    ck(
      "identity_providers",
      "client_id",
      sql`char_length(client_id) between 1 and 512`,
    ),
    ck(
      "identity_providers",
      "metadata_url",
      sql`char_length(metadata_url) between 1 and 2048`,
    ),
    ck(
      "identity_providers",
      "link_policy",
      sql`link_policy in ('roster_external_id', 'verified_domain_email', 'invitation_only', 'admin_approval')`,
    ),
    ck(
      "identity_providers",
      "provision_policy",
      sql`provision_policy in ('none', 'jit_membership')`,
    ),
    ck(
      "identity_providers",
      "attribute_mapping",
      sql`jsonb_typeof(attribute_mapping) = 'object'`,
    ),
    ck(
      "identity_providers",
      "name",
      sql`num_nonnulls(display_name_en, display_name_ar) >= 1`,
    ),
    ck(
      "identity_providers",
      "tenant_list",
      sql`protocol not in ('oidc', 'clever', 'classlink') or cardinality(allowed_issuer_tenants) >= 1 or link_policy in ('invitation_only', 'admin_approval')`,
    ),
    uniqueIndex("identity_providers_issuer_key")
      .on(t.tenantId, t.protocol, t.issuer)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

export const identityProviderOrgs = core.table.withRLS(
  "identity_provider_orgs",
  {
    ...tenantColumns(),
    identityProviderId: uuid("identity_provider_id").notNull(),
    orgId: uuid("org_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("identity_provider_orgs", t.tenantId, t.id),
    ...baseConstraints("identity_provider_orgs", t, tenants),
    fk(
      "identity_provider_orgs",
      [t.tenantId, t.identityProviderId],
      [identityProviders.tenantId, identityProviders.id],
    ),
    fk(
      "identity_provider_orgs",
      [t.tenantId, t.orgId],
      [orgs.tenantId, orgs.id],
    ),
    uniqueIndex("identity_provider_orgs_key")
      .on(t.tenantId, t.identityProviderId, t.orgId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * The provider a sign-in identity came from, and who that provider says the
 * person is: its subject, and for a provider serving many organisations,
 * the organisation that vouched for them.
 */
export const federatedIdentities = core.table.withRLS(
  "federated_identities",
  {
    ...tenantColumns(),
    loginIdentityId: uuid("login_identity_id").notNull(),
    identityProviderId: uuid("identity_provider_id").notNull(),
    subject: text("subject").notNull(),
    issuerTenant: text("issuer_tenant"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("federated_identities", t.tenantId, t.id),
    ...baseConstraints("federated_identities", t, tenants),
    fk(
      "federated_identities",
      [t.tenantId, t.loginIdentityId],
      [loginIdentities.tenantId, loginIdentities.id],
    ),
    fk(
      "federated_identities",
      [t.tenantId, t.identityProviderId],
      [identityProviders.tenantId, identityProviders.id],
    ),
    ck(
      "federated_identities",
      "subject",
      sql`char_length(subject) between 1 and 256`,
    ),
    ck(
      "federated_identities",
      "issuer_tenant",
      sql`char_length(issuer_tenant) between 1 and 256`,
    ),
    uniqueIndex("federated_identities_login_key")
      .on(t.tenantId, t.loginIdentityId)
      .where(sql`status = 'active'`),
    uniqueIndex("federated_identities_subject_key")
      .on(t.tenantId, t.identityProviderId, t.subject)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    ...eraseAndDelete(
      sql`exists (select 1 from core.login_identities l join core.accounts a on a.tenant_id = l.tenant_id and a.id = l.account_id where l.tenant_id = federated_identities.tenant_id and l.id = federated_identities.login_identity_id and app.erasure_approved(a.tenant_id, a.user_id))`,
    ),
  ],
);
