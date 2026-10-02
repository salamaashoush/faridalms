import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  bytea,
  date,
  index,
  integer,
  jsonb,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { PostalAddress } from "./tenancy";

import {
  baseConstraints,
  ck,
  core,
  daterange,
  entityColumns,
  entityProfile,
  erase,
  eraseAndDelete,
  erasureOf,
  fk,
  instant,
  pk,
  purposeGate,
  range,
  tenantColumns,
} from "./conventions";
import { descriptors } from "./descriptors";
import { files, tenantKeys } from "./files";
import { importRuns } from "./records";
import { orgs, tenants } from "./tenancy";

export const users = core.table.withRLS(
  "users",
  {
    ...tenantColumns(),
    username: text("username"),
    givenNameAr: text("given_name_ar"),
    middleNameAr: text("middle_name_ar"),
    familyNameAr: text("family_name_ar"),
    fullNameAr: text("full_name_ar"),
    givenNameEn: text("given_name_en"),
    middleNameEn: text("middle_name_en"),
    familyNameEn: text("family_name_en"),
    fullNameEn: text("full_name_en"),
    preferredGivenName: text("preferred_given_name"),
    preferredMiddleName: text("preferred_middle_name"),
    preferredFamilyName: text("preferred_family_name"),
    namePartsSource: text("name_parts_source")
      .$type<"entered" | "import_split" | "import_parts">()
      .notNull()
      .default("entered"),
    birthDate: date("birth_date", { mode: "string" }),
    birthDateSource: text("birth_date_source").$type<
      "school_record" | "guardian_declared" | "document" | "import"
    >(),
    sexDescriptorId: uuid("sex_descriptor_id"),
    sexNs: text("sex_ns")
      .notNull()
      .generatedAlwaysAs(sql`'sex'`),
    photoFileId: uuid("photo_file_id"),
    preferredLocale: text("preferred_locale").$type<"ar" | "en">(),
    primaryOrgId: uuid("primary_org_id"),
    medicalAlert: boolean("medical_alert").notNull().default(false),
    custodyAlert: boolean("custody_alert").notNull().default(false),
    erasedAt: instant("erased_at"),
    importRunId: uuid("import_run_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("users", t.tenantId, t.id),
    ...baseConstraints("users", t, tenants),
    fk("users", [t.tenantId, t.photoFileId], [files.tenantId, files.id]),
    fk("users", [t.tenantId, t.primaryOrgId], [orgs.tenantId, orgs.id]),
    fk(
      "users",
      [t.tenantId, t.sexDescriptorId, t.sexNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "users",
      [t.tenantId, t.importRunId],
      [importRuns.tenantId, importRuns.id],
    ),
    ck(
      "users",
      "username",
      sql`char_length(username) between 1 and 254 and username = lower(username)`,
    ),
    ck(
      "users",
      "given_name_ar",
      sql`char_length(given_name_ar) between 1 and 75`,
    ),
    ck(
      "users",
      "middle_name_ar",
      sql`char_length(middle_name_ar) between 1 and 150`,
    ),
    ck(
      "users",
      "family_name_ar",
      sql`char_length(family_name_ar) between 1 and 75`,
    ),
    ck(
      "users",
      "full_name_ar",
      sql`char_length(full_name_ar) between 1 and 200`,
    ),
    ck(
      "users",
      "given_name_en",
      sql`char_length(given_name_en) between 1 and 75`,
    ),
    ck(
      "users",
      "middle_name_en",
      sql`char_length(middle_name_en) between 1 and 150`,
    ),
    ck(
      "users",
      "family_name_en",
      sql`char_length(family_name_en) between 1 and 75`,
    ),
    ck(
      "users",
      "full_name_en",
      sql`char_length(full_name_en) between 1 and 200`,
    ),
    ck(
      "users",
      "preferred_given_name",
      sql`char_length(preferred_given_name) between 1 and 75`,
    ),
    ck(
      "users",
      "preferred_middle_name",
      sql`char_length(preferred_middle_name) between 1 and 75`,
    ),
    ck(
      "users",
      "preferred_family_name",
      sql`char_length(preferred_family_name) between 1 and 75`,
    ),
    ck(
      "users",
      "name_parts_source",
      sql`name_parts_source in ('entered', 'import_split', 'import_parts')`,
    ),
    ck("users", "birth_date", sql`birth_date >= date '1900-01-01'`),
    ck(
      "users",
      "birth_date_source",
      sql`birth_date_source in ('school_record', 'guardian_declared', 'document', 'import')`,
    ),
    ck("users", "preferred_locale", sql`preferred_locale in ('ar', 'en')`),
    ck(
      "users",
      "name",
      sql`erased_at is not null or num_nonnulls(full_name_ar, full_name_en) >= 1`,
    ),
    ck(
      "users",
      "ar_parts",
      sql`full_name_ar is not null or num_nonnulls(given_name_ar, middle_name_ar, family_name_ar) = 0`,
    ),
    ck(
      "users",
      "en_parts",
      sql`full_name_en is not null or num_nonnulls(given_name_en, middle_name_en, family_name_en) = 0`,
    ),
    ck(
      "users",
      "birth_source",
      sql`birth_date is not null or birth_date_source is null`,
    ),
    ck("users", "erased", sql`erased_at is null or status = 'tobedeleted'`),
    uniqueIndex("users_username_key")
      .on(t.tenantId, t.username)
      .where(sql`status = 'active' and username is not null`),
    index("users_name_ar_idx")
      .on(t.tenantId, sql`full_name_ar collate "ar-x-icu"`, t.id)
      .where(sql`status = 'active'`),
    index("users_name_en_idx")
      .on(t.tenantId, sql`full_name_en collate "en-x-icu"`, t.id)
      .where(sql`status = 'active'`),
    index("users_birth_date_idx")
      .on(t.tenantId, t.birthDate)
      .where(sql`status = 'active'`),
    index("users_delta_idx").on(t.tenantId, t.dateLastModified),
    ...entityProfile({ integration: true }),
    ...erase(erasureOf("id")),
  ],
);

export const demographics = core.table.withRLS(
  "demographics",
  {
    tenantId: uuid("tenant_id").notNull(),
    userId: uuid("user_id").notNull(),
    birthCountryCode: text("birth_country_code"),
    birthCity: text("birth_city"),
    nationalityCodes: text("nationality_codes")
      .array()
      .notNull()
      .default(sql`'{}'`),
    religionDescriptorId: uuid("religion_descriptor_id"),
    religionNs: text("religion_ns")
      .notNull()
      .generatedAlwaysAs(sql`'religion'`),
    homeLanguages: text("home_languages")
      .array()
      .notNull()
      .default(sql`'{}'`),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("demographics", t.tenantId, t.userId),
    ...baseConstraints("demographics", t, tenants),
    fk("demographics", [t.tenantId, t.userId], [users.tenantId, users.id]),
    fk(
      "demographics",
      [t.tenantId, t.religionDescriptorId, t.religionNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    ck(
      "demographics",
      "birth_country_code",
      sql`birth_country_code ~ '^[A-Z]{2}$'`,
    ),
    ck(
      "demographics",
      "birth_city",
      sql`char_length(birth_city) between 1 and 100`,
    ),
    ck(
      "demographics",
      "nationality_codes",
      sql`array_to_string(nationality_codes, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$'`,
    ),
    ck(
      "demographics",
      "home_languages",
      sql`array_to_string(home_languages, ',') ~ '^([a-z]{2,3}(,[a-z]{2,3})*)?$'`,
    ),
    index("demographics_delta_idx").on(t.tenantId, t.dateLastModified),
    ...entityProfile({ integration: true }),
    purposeGate("demographics"),
    ...erase(erasureOf("user_id")),
  ],
);

export const externalIds = core.table.withRLS(
  "external_ids",
  {
    ...tenantColumns(),
    userId: uuid("user_id").notNull(),
    systemDescriptorId: uuid("system_descriptor_id").notNull(),
    systemNs: text("system_ns")
      .notNull()
      .generatedAlwaysAs(sql`'external_id_system'`),
    systemMeaning: text("system_meaning").notNull(),
    identifier: text("identifier"),
    identifierCiphertext: bytea("identifier_ciphertext"),
    identifierHmac: bytea("identifier_hmac"),
    identifierLast4: text("identifier_last4"),
    keyPurpose: text("key_purpose").generatedAlwaysAs(
      sql`case when identifier_ciphertext is not null then 'identifiers' end`,
    ),
    keyVersion: integer("key_version"),
    assigningOrgId: uuid("assigning_org_id"),
    /** The country that issued a passport, residence permit or ID card. */
    issuingCountryCode: text("issuing_country_code"),
    validDuring: daterange("valid_during").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("external_ids", t.tenantId, t.id),
    ...baseConstraints("external_ids", t, tenants),
    fk("external_ids", [t.tenantId, t.userId], [users.tenantId, users.id]),
    fk(
      "external_ids",
      [t.tenantId, t.systemDescriptorId, t.systemNs, t.systemMeaning],
      [
        descriptors.tenantId,
        descriptors.id,
        descriptors.namespace,
        descriptors.systemMeaning,
      ],
    ),
    fk(
      "external_ids",
      [t.tenantId, t.assigningOrgId],
      [orgs.tenantId, orgs.id],
    ),
    fk(
      "external_ids",
      [t.tenantId, t.keyPurpose, t.keyVersion],
      [tenantKeys.tenantId, tenantKeys.purpose, tenantKeys.keyVersion],
    ),
    ck(
      "external_ids",
      "identifier",
      sql`char_length(identifier) between 1 and 64`,
    ),
    ck(
      "external_ids",
      "identifier_ciphertext",
      sql`octet_length(identifier_ciphertext) between 30 and 512`,
    ),
    ck(
      "external_ids",
      "identifier_hmac",
      sql`octet_length(identifier_hmac) = 32`,
    ),
    ck(
      "external_ids",
      "identifier_last4",
      sql`char_length(identifier_last4) between 1 and 4`,
    ),
    ck(
      "external_ids",
      "value",
      sql`num_nonnulls(identifier, identifier_ciphertext) = 1`,
    ),
    ck(
      "external_ids",
      "sealed",
      sql`(identifier_ciphertext is null) = (identifier_hmac is null) and (identifier_ciphertext is null) = (key_version is null)`,
    ),
    ck(
      "external_ids",
      "sensitive",
      sql`system_meaning not in ('national_id', 'passport', 'residence_permit', 'birth_certificate') or identifier_ciphertext is not null`,
    ),
    ck(
      "external_ids",
      "issuing_country_code",
      sql`issuing_country_code ~ '^[A-Z]{2}$'`,
    ),
    ck(
      "external_ids",
      "suffix",
      sql`system_meaning <> 'national_id' or identifier_last4 is null`,
    ),
    ck("external_ids", "valid_during", range.started("valid_during")),
    index("external_ids_user_idx")
      .on(t.tenantId, t.userId)
      .where(sql`status = 'active'`),
    index("external_ids_delta_idx").on(t.tenantId, t.dateLastModified),
    ...entityProfile({ integration: true }),
    ...eraseAndDelete(erasureOf("user_id")),
  ],
);

export type ContactPurpose = "notify" | "security" | "recovery" | "login";

export const contactPoints = core.table.withRLS(
  "contact_points",
  {
    ...tenantColumns(),
    userId: uuid("user_id").notNull(),
    kind: text("kind").$type<"email" | "phone" | "postal">().notNull(),
    label: text("label")
      .$type<"mobile" | "home" | "work" | "personal" | "emergency" | "other">()
      .notNull()
      .default("other"),
    value: text("value").notNull(),
    normalized: text("normalized"),
    postal: jsonb("postal").$type<PostalAddress>(),
    smsCapable: boolean("sms_capable"),
    purposes: text("purposes")
      .$type<ContactPurpose>()
      .array()
      .notNull()
      .default(sql`'{notify}'`),
    priority: smallint("priority"),
    doNotPublish: boolean("do_not_publish").notNull().default(false),
    verifiedAt: instant("verified_at"),
    verificationMethod: text("verification_method").$type<
      | "confirmation_code"
      | "invitation"
      | "idp_asserted"
      | "staff_attested"
      | "legacy_unverified"
    >(),
    bouncedAt: instant("bounced_at"),
    complaintAt: instant("complaint_at"),
    unsubscribedAt: instant("unsubscribed_at"),
    source: text("source")
      .$type<"manual" | "import" | "self_service" | "sis" | "sso">()
      .notNull(),
    importRunId: uuid("import_run_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("contact_points", t.tenantId, t.id),
    ...baseConstraints("contact_points", t, tenants),
    fk("contact_points", [t.tenantId, t.userId], [users.tenantId, users.id]),
    fk(
      "contact_points",
      [t.tenantId, t.importRunId],
      [importRuns.tenantId, importRuns.id],
    ),
    ck("contact_points", "kind", sql`kind in ('email', 'phone', 'postal')`),
    ck(
      "contact_points",
      "label",
      sql`label in ('mobile', 'home', 'work', 'personal', 'emergency', 'other')`,
    ),
    ck("contact_points", "value", sql`char_length(value) between 1 and 500`),
    ck(
      "contact_points",
      "normalized",
      sql`char_length(normalized) between 1 and 320`,
    ),
    ck("contact_points", "postal", sql`jsonb_typeof(postal) = 'object'`),
    ck(
      "contact_points",
      "purposes",
      sql`purposes <@ '{notify,security,recovery,login}'`,
    ),
    ck("contact_points", "priority", sql`priority between 1 and 99`),
    ck(
      "contact_points",
      "verification_method",
      sql`verification_method in ('confirmation_code', 'invitation', 'idp_asserted', 'staff_attested', 'legacy_unverified')`,
    ),
    ck(
      "contact_points",
      "source",
      sql`source in ('manual', 'import', 'self_service', 'sis', 'sso')`,
    ),
    ck(
      "contact_points",
      "phone",
      sql`kind <> 'phone' or normalized is null or normalized ~ '^\\+[1-9][0-9]{6,14}$'`,
    ),
    ck(
      "contact_points",
      "email",
      sql`kind <> 'email' or normalized is null or (normalized = lower(normalized) and strpos(normalized, '@') > 1)`,
    ),
    ck(
      "contact_points",
      "postal_kind",
      sql`(kind = 'postal') = (postal is not null) and (kind <> 'postal' or normalized is null)`,
    ),
    ck(
      "contact_points",
      "security",
      sql`not (purposes && '{security,recovery,login}') or (kind <> 'postal' and verified_at is not null)`,
    ),
    index("contact_points_lookup_idx")
      .on(t.tenantId, t.kind, t.normalized)
      .where(sql`status = 'active' and normalized is not null`),
    index("contact_points_user_idx")
      .on(t.tenantId, t.userId)
      .where(sql`status = 'active'`),
    uniqueIndex("contact_points_user_value_key")
      .on(t.tenantId, t.userId, t.kind, t.normalized)
      .where(sql`status = 'active' and normalized is not null`),
    index("contact_points_delta_idx").on(t.tenantId, t.dateLastModified),
    ...entityProfile({ integration: true }),
    ...eraseAndDelete(erasureOf("user_id")),
  ],
);
