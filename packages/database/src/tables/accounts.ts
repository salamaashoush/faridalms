import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  bytea,
  cidr,
  index,
  integer,
  jsonb,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { NaturalRole } from "./membership";

import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  ephemeralProfile,
  erase,
  eraseAndDelete,
  erasureOf,
  fk,
  holderErased,
  instant,
  pk,
  tenantColumns,
  uq,
} from "./conventions";
import { tenantKeys } from "./files";
import { users } from "./people";
import { orgs, tenants } from "./tenancy";

export type AccountState = "invited" | "active" | "disabled" | "locked";

export const accounts = core.table.withRLS(
  "accounts",
  {
    ...tenantColumns(),
    userId: uuid("user_id").notNull(),
    state: text("state").$type<AccountState>().notNull().default("invited"),
    webauthnUserHandle: bytea("webauthn_user_handle").notNull(),
    firstAuthenticatedAt: instant("first_authenticated_at"),
    lastAuthenticatedAt: instant("last_authenticated_at"),
    stateChangedAt: instant("state_changed_at"),
    stateChangedByUserId: uuid("state_changed_by_user_id"),
    stateReason: text("state_reason"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("accounts", t.tenantId, t.id),
    uq("accounts", t.tenantId, t.webauthnUserHandle),
    ...baseConstraints("accounts", t, tenants),
    fk("accounts", [t.tenantId, t.userId], [users.tenantId, users.id]),
    fk(
      "accounts",
      [t.tenantId, t.stateChangedByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "accounts",
      "state",
      sql`state in ('invited', 'active', 'disabled', 'locked')`,
    ),
    ck(
      "accounts",
      "state_reason",
      sql`char_length(state_reason) between 1 and 500`,
    ),
    ck(
      "accounts",
      "handle",
      sql`octet_length(webauthn_user_handle) = 64 and substring(webauthn_user_handle from 1 for 16) = uuid_send(tenant_id)`,
    ),
    uniqueIndex("accounts_user_key")
      .on(t.tenantId, t.userId)
      .where(sql`status = 'active'`),
    index("accounts_delta_idx").on(t.tenantId, t.dateLastModified),
    ...entityProfile({ integration: true }),
    ...erase(erasureOf("user_id")),
  ],
);

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

export type LoginKind =
  | "password"
  | "oidc"
  | "saml"
  | "clever"
  | "classlink"
  | "badge"
  | "invite";

export const loginIdentities = core.table.withRLS(
  "login_identities",
  {
    ...tenantColumns(),
    accountId: uuid("account_id").notNull(),
    kind: text("kind").$type<LoginKind>().notNull(),
    identityProviderId: uuid("identity_provider_id"),
    subject: text("subject"),
    issuerTenant: text("issuer_tenant"),
    loginName: text("login_name"),
    secretHash: text("secret_hash"),
    secretSetAt: instant("secret_set_at"),
    compromisedAt: instant("compromised_at"),
    pinHash: text("pin_hash"),
    linkMethod: text("link_method")
      .$type<
        | "roster_external_id"
        | "verified_domain"
        | "invitation"
        | "admin"
        | "import"
        | "self_service"
      >()
      .notNull(),
    linkedAt: instant("linked_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    linkedByUserId: uuid("linked_by_user_id"),
    lastUsedAt: instant("last_used_at"),
    failedAttempts: smallint("failed_attempts").notNull().default(0),
    lockedUntil: instant("locked_until"),
    expiresAt: instant("expires_at"),
    voidedAt: instant("voided_at"),
    voidReason: text("void_reason").$type<
      | "lost"
      | "rollover"
      | "aged_out"
      | "admin"
      | "compromised"
      | "unused"
      | "merge_pending"
      | "used"
    >(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("login_identities", t.tenantId, t.id),
    ...baseConstraints("login_identities", t, tenants),
    fk(
      "login_identities",
      [t.tenantId, t.accountId],
      [accounts.tenantId, accounts.id],
    ),
    fk(
      "login_identities",
      [t.tenantId, t.identityProviderId],
      [identityProviders.tenantId, identityProviders.id],
    ),
    fk(
      "login_identities",
      [t.tenantId, t.linkedByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "login_identities",
      "kind",
      sql`kind in ('password', 'oidc', 'saml', 'clever', 'classlink', 'badge', 'invite')`,
    ),
    ck(
      "login_identities",
      "subject",
      sql`char_length(subject) between 1 and 256`,
    ),
    ck(
      "login_identities",
      "issuer_tenant",
      sql`char_length(issuer_tenant) between 1 and 256`,
    ),
    ck(
      "login_identities",
      "login_name",
      sql`char_length(login_name) between 1 and 254 and login_name = lower(login_name)`,
    ),
    ck(
      "login_identities",
      "secret_hash",
      sql`char_length(secret_hash) between 20 and 512`,
    ),
    ck(
      "login_identities",
      "pin_hash",
      sql`char_length(pin_hash) between 20 and 512`,
    ),
    ck(
      "login_identities",
      "link_method",
      sql`link_method in ('roster_external_id', 'verified_domain', 'invitation', 'admin', 'import', 'self_service')`,
    ),
    ck(
      "login_identities",
      "failed_attempts",
      sql`failed_attempts between 0 and 100`,
    ),
    ck(
      "login_identities",
      "void_reason",
      sql`void_reason in ('lost', 'rollover', 'aged_out', 'admin', 'compromised', 'unused', 'merge_pending', 'used')`,
    ),
    ck(
      "login_identities",
      "federated",
      sql`(kind in ('oidc', 'saml', 'clever', 'classlink')) = (identity_provider_id is not null and subject is not null)`,
    ),
    ck(
      "login_identities",
      "password",
      sql`(kind = 'password') = (login_name is not null) and (kind <> 'password' or secret_hash is not null)`,
    ),
    ck(
      "login_identities",
      "badge",
      sql`kind not in ('badge', 'invite') or (secret_hash is not null and expires_at is not null)`,
    ),
    ck(
      "login_identities",
      "void",
      sql`(voided_at is null) = (void_reason is null)`,
    ),
    uniqueIndex("login_identities_subject_key")
      .on(t.tenantId, t.identityProviderId, t.subject)
      .where(sql`status = 'active' and subject is not null`),
    uniqueIndex("login_identities_login_name_key")
      .on(t.tenantId, t.loginName)
      .where(
        sql`status = 'active' and kind = 'password' and voided_at is null`,
      ),
    uniqueIndex("login_identities_badge_key")
      .on(t.tenantId, t.secretHash)
      .where(sql`status = 'active' and kind = 'badge' and voided_at is null`),
    uniqueIndex("login_identities_invite_key")
      .on(t.tenantId, t.secretHash)
      .where(sql`status = 'active' and kind = 'invite' and voided_at is null`),
    index("login_identities_account_idx")
      .on(t.tenantId, t.accountId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    ...eraseAndDelete(holderErased("login_identities")),
  ],
);

export const passkeys = core.table.withRLS(
  "passkeys",
  {
    ...tenantColumns(),
    accountId: uuid("account_id").notNull(),
    credentialId: bytea("credential_id").notNull(),
    publicKey: bytea("public_key").notNull(),
    signCount: bigint("sign_count", { mode: "number" }).notNull().default(0),
    transports: text("transports")
      .array()
      .notNull()
      .default(sql`'{}'`),
    uvInitialized: boolean("uv_initialized").notNull(),
    backupEligible: boolean("backup_eligible").notNull(),
    backupState: boolean("backup_state").notNull(),
    aaguid: uuid("aaguid"),
    rpId: text("rp_id").notNull(),
    nickname: text("nickname"),
    attestationObject: bytea("attestation_object"),
    attestationClientDataJson: bytea("attestation_client_data_json"),
    createdFromIpPrefix: cidr("created_from_ip_prefix"),
    lastUsedAt: instant("last_used_at"),
    revokedAt: instant("revoked_at"),
    revokedReason: text("revoked_reason").$type<
      "user" | "admin" | "account_disabled" | "compromised" | "tenant_merged"
    >(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("passkeys", t.tenantId, t.id),
    uq("passkeys", t.tenantId, t.credentialId),
    ...baseConstraints("passkeys", t, tenants),
    fk("passkeys", [t.tenantId, t.accountId], [accounts.tenantId, accounts.id]),
    ck(
      "passkeys",
      "credential_id",
      sql`octet_length(credential_id) between 16 and 1023`,
    ),
    ck(
      "passkeys",
      "public_key",
      sql`octet_length(public_key) between 16 and 2048`,
    ),
    ck("passkeys", "sign_count", sql`sign_count >= 0`),
    ck(
      "passkeys",
      "transports",
      sql`transports <@ '{usb,nfc,ble,smart-card,hybrid,internal}'`,
    ),
    ck("passkeys", "rp_id", sql`char_length(rp_id) between 1 and 253`),
    ck("passkeys", "nickname", sql`char_length(nickname) between 1 and 64`),
    ck(
      "passkeys",
      "revoked_reason",
      sql`revoked_reason in ('user', 'admin', 'account_disabled', 'compromised', 'tenant_merged')`,
    ),
    ck("passkeys", "backup", sql`backup_eligible or not backup_state`),
    ck(
      "passkeys",
      "revoked",
      sql`(revoked_at is null) = (revoked_reason is null)`,
    ),
    index("passkeys_account_idx")
      .on(t.tenantId, t.accountId)
      .where(sql`revoked_at is null`),
    ...entityProfile(),
    ...eraseAndDelete(holderErased("passkeys")),
  ],
);

export const devices = core.table.withRLS(
  "devices",
  {
    ...tenantColumns(),
    accountId: uuid("account_id").notNull(),
    platform: text("platform").$type<"ios" | "android" | "web">().notNull(),
    appVersion: text("app_version"),
    pushTokenCiphertext: bytea("push_token_ciphertext"),
    keyPurpose: text("key_purpose").generatedAlwaysAs(
      sql`case when push_token_ciphertext is not null then 'identifiers' end`,
    ),
    keyVersion: integer("key_version"),
    locale: text("locale").$type<"ar" | "en">(),
    lastSeenAt: instant("last_seen_at"),
    revokedAt: instant("revoked_at"),
    revokedReason: text("revoked_reason").$type<
      "sign_out" | "admin" | "token_invalid" | "replaced"
    >(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("devices", t.tenantId, t.id),
    ...baseConstraints("devices", t, tenants),
    fk("devices", [t.tenantId, t.accountId], [accounts.tenantId, accounts.id]),
    fk(
      "devices",
      [t.tenantId, t.keyPurpose, t.keyVersion],
      [tenantKeys.tenantId, tenantKeys.purpose, tenantKeys.keyVersion],
    ),
    ck("devices", "platform", sql`platform in ('ios', 'android', 'web')`),
    ck(
      "devices",
      "app_version",
      sql`char_length(app_version) between 1 and 40`,
    ),
    ck(
      "devices",
      "push_token_ciphertext",
      sql`octet_length(push_token_ciphertext) between 30 and 4096`,
    ),
    ck("devices", "locale", sql`locale in ('ar', 'en')`),
    ck(
      "devices",
      "revoked_reason",
      sql`revoked_reason in ('sign_out', 'admin', 'token_invalid', 'replaced')`,
    ),
    ck(
      "devices",
      "key",
      sql`(push_token_ciphertext is null) = (key_version is null)`,
    ),
    ck(
      "devices",
      "revoked",
      sql`(revoked_at is null) = (revoked_reason is null)`,
    ),
    index("devices_account_idx")
      .on(t.tenantId, t.accountId)
      .where(sql`revoked_at is null`),
    ...entityProfile(),
    ...eraseAndDelete(holderErased("devices")),
  ],
);

export type SessionContext = "staff" | "family" | "student";
export type ClientKind = "web" | "ios" | "android" | "shared_device";

export const sessions = core.table.withRLS(
  "sessions",
  {
    tenantId: uuid("tenant_id").notNull(),
    id: uuid("id")
      .notNull()
      .default(sql`uuidv7()`),
    accountId: uuid("account_id").notNull(),
    tokenHash: bytea("token_hash").notNull(),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    authenticatedAt: instant("authenticated_at").notNull(),
    lastSeenAt: instant("last_seen_at").notNull(),
    idleExpiresAt: instant("idle_expires_at").notNull(),
    absoluteExpiresAt: instant("absolute_expires_at").notNull(),
    aal: smallint("aal").notNull(),
    amr: text("amr").array().notNull(),
    loginIdentityId: uuid("login_identity_id"),
    passkeyId: uuid("passkey_id"),
    context: text("context").$type<SessionContext>().notNull(),
    activeOrgId: uuid("active_org_id"),
    activeRole: text("active_role").$type<NaturalRole>(),
    clientKind: text("client_kind").$type<ClientKind>().notNull(),
    deviceId: uuid("device_id"),
    ipPrefix: cidr("ip_prefix"),
    userAgentSummary: text("user_agent_summary"),
    revokedAt: instant("revoked_at"),
    revokedReason: text("revoked_reason").$type<
      | "sign_out"
      | "admin"
      | "credential_change"
      | "context_switch"
      | "reuse_detected"
      | "account_disabled"
      | "superseded"
      | "tenant_merged"
    >(),
    replacedBySessionId: uuid("replaced_by_session_id"),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("sessions", t.tenantId, t.id),
    uq("sessions", t.tenantId, t.tokenHash),
    fk("sessions", [t.tenantId], [tenants.tenantId]),
    fk("sessions", [t.tenantId, t.accountId], [accounts.tenantId, accounts.id]),
    fk(
      "sessions",
      [t.tenantId, t.loginIdentityId],
      [loginIdentities.tenantId, loginIdentities.id],
    ),
    fk("sessions", [t.tenantId, t.passkeyId], [passkeys.tenantId, passkeys.id]),
    fk("sessions", [t.tenantId, t.activeOrgId], [orgs.tenantId, orgs.id]),
    fk("sessions", [t.tenantId, t.deviceId], [devices.tenantId, devices.id]),
    fk("sessions", [t.tenantId, t.replacedBySessionId], [t.tenantId, t.id]),
    ck("sessions", "token_hash", sql`octet_length(token_hash) = 32`),
    ck("sessions", "aal", sql`aal between 1 and 3`),
    ck("sessions", "amr", sql`cardinality(amr) >= 1`),
    ck("sessions", "context", sql`context in ('staff', 'family', 'student')`),
    ck(
      "sessions",
      "active_role",
      sql`active_role in ('student', 'teacher', 'aide', 'counselor', 'principal', 'site_administrator', 'district_administrator', 'system_administrator', 'proctor', 'staff', 'parent', 'guardian', 'relative')`,
    ),
    ck(
      "sessions",
      "client_kind",
      sql`client_kind in ('web', 'ios', 'android', 'shared_device')`,
    ),
    ck(
      "sessions",
      "user_agent_summary",
      sql`char_length(user_agent_summary) between 1 and 200`,
    ),
    ck(
      "sessions",
      "revoked_reason",
      sql`revoked_reason in ('sign_out', 'admin', 'credential_change', 'context_switch', 'reuse_detected', 'account_disabled', 'superseded', 'tenant_merged')`,
    ),
    ck(
      "sessions",
      "authenticator",
      sql`num_nonnulls(login_identity_id, passkey_id) <= 1`,
    ),
    ck(
      "sessions",
      "expiry",
      sql`idle_expires_at <= absolute_expires_at and authenticated_at <= last_seen_at`,
    ),
    ck(
      "sessions",
      "revoked",
      sql`(revoked_at is null) = (revoked_reason is null)`,
    ),
    index("sessions_account_idx")
      .on(t.tenantId, t.accountId)
      .where(sql`revoked_at is null`),
    index("sessions_expiry_idx").on(t.tenantId, t.absoluteExpiresAt),
    ...ephemeralProfile(
      sql`absolute_expires_at < statement_timestamp() - interval '30 days' or ${holderErased("sessions")}`,
    ),
  ],
);

export const authAttempts = core.table.withRLS(
  "auth_attempts",
  {
    tenantId: uuid("tenant_id").notNull(),
    keyHash: bytea("key_hash").notNull(),
    count: integer("count").notNull().default(1),
    windowEndsAt: instant("window_ends_at").notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("auth_attempts", t.tenantId, t.keyHash),
    fk("auth_attempts", [t.tenantId], [tenants.tenantId]),
    ck("auth_attempts", "key_hash", sql`octet_length(key_hash) = 32`),
    ck("auth_attempts", "count", sql`count > 0`),
    index("auth_attempts_window_idx").on(t.tenantId, t.windowEndsAt),
    ...ephemeralProfile(sql`window_ends_at < statement_timestamp()`),
  ],
);
