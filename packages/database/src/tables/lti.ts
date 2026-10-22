import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  bytea,
  index,
  jsonb,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  ephemeralProfile,
  fk,
  instant,
  pk,
  tenantColumns,
} from "./conventions";
import { orgs, tenants } from "./tenancy";

/**
 * An outside tool a school has registered to launch by LTI 1.3: where it
 * starts a sign-in, where launches may be posted back, its keys, and the
 * client and deployment ids the school gave it. A school registers each
 * tool once, so a tool has one deployment there.
 */
export const ltiTools = core.table.withRLS(
  "lti_tools",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    name: text("name").notNull(),
    clientId: text("client_id").notNull(),
    deploymentId: text("deployment_id").notNull(),
    loginUrl: text("login_url").notNull(),
    launchUrl: text("launch_url").notNull(),
    redirectUrls: jsonb("redirect_urls").$type<string[]>().notNull(),
    jwksUrl: text("jwks_url").notNull(),
    deepLinkUrl: text("deep_link_url"),
    sendNames: boolean("send_names").notNull().default(false),
    custom: jsonb("custom")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("lti_tools", t.tenantId, t.id),
    ...baseConstraints("lti_tools", t, tenants),
    fk("lti_tools", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck("lti_tools", "name", sql`char_length(name) between 1 and 120`),
    ck(
      "lti_tools",
      "urls",
      sql`login_url like 'https://%' and launch_url like 'https://%' and jwks_url like 'https://%' and (deep_link_url is null or deep_link_url like 'https://%') and char_length(login_url) <= 500 and char_length(launch_url) <= 500 and char_length(jwks_url) <= 500 and char_length(coalesce(deep_link_url, '')) <= 500`,
    ),
    ck(
      "lti_tools",
      "redirect_urls",
      sql`jsonb_typeof(redirect_urls) = 'array' and jsonb_array_length(redirect_urls) between 1 and 5`,
    ),
    ck(
      "lti_tools",
      "custom",
      sql`jsonb_typeof(custom) = 'object' and octet_length(custom::text) <= 16384`,
    ),
    ck(
      "lti_tools",
      "ids",
      sql`char_length(client_id) between 1 and 255 and char_length(deployment_id) between 1 and 255`,
    ),
    uniqueIndex("lti_tools_client_key")
      .on(t.tenantId, t.clientId)
      .where(sql`status = 'active'`),
    index("lti_tools_org_idx")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * A school's key for signing what it sends tools, published by its id in
 * the school's key set. The private half is kept sealed; a retired key
 * stays published a while so launches signed just before still check.
 */
export const ltiKeys = core.table.withRLS(
  "lti_keys",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    kid: text("kid").notNull(),
    publicJwk: jsonb("public_jwk").$type<Record<string, unknown>>().notNull(),
    sealedPrivateJwk: text("sealed_private_jwk").notNull(),
    retiredAt: instant("retired_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("lti_keys", t.tenantId, t.id),
    ...baseConstraints("lti_keys", t, tenants),
    fk("lti_keys", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck("lti_keys", "kid", sql`char_length(kid) between 1 and 100`),
    uniqueIndex("lti_keys_kid_key").on(t.tenantId, t.kid),
    uniqueIndex("lti_keys_active_key")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active' and retired_at is null`),
    ...entityProfile(),
  ],
);

/**
 * Values a tool may send once only, kept until they would have expired
 * anyway: a Deep Linking response's nonce, a client assertion's id. Only a
 * digest is kept.
 */
export const ltiReplays = core.table.withRLS(
  "lti_replays",
  {
    tenantId: uuid("tenant_id").notNull(),
    keyHash: bytea("key_hash").notNull(),
    expiresAt: instant("expires_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("lti_replays", t.tenantId, t.keyHash),
    fk("lti_replays", [t.tenantId], [tenants.tenantId]),
    ck("lti_replays", "key_hash", sql`octet_length(key_hash) = 32`),
    index("lti_replays_expiry_idx").on(t.tenantId, t.expiresAt),
    ...ephemeralProfile(sql`expires_at < statement_timestamp()`),
  ],
);
