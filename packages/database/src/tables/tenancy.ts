import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  pgPolicy,
  smallint,
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
  fk,
  integrationRead,
  isolation,
  pk,
  roles,
  tenantColumns,
  uq,
} from "./conventions";
import { files } from "./files";

export const tenants = core.table.withRLS(
  "tenants",
  {
    tenantId: uuid("tenant_id").notNull(),
    kind: text("kind").$type<"school_group" | "school">().notNull(),
    rootOrgId: uuid("root_org_id").notNull(),
    nameEn: text("name_en"),
    nameAr: text("name_ar"),
    defaultLocale: text("default_locale")
      .$type<"ar" | "en">()
      .notNull()
      .default("ar"),
    jurisdictions: text("jurisdictions").array().notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("tenants", t.tenantId),
    ck("tenants", "kind", sql`kind in ('school_group', 'school')`),
    ck("tenants", "name_en", sql`char_length(name_en) between 1 and 160`),
    ck("tenants", "name_ar", sql`char_length(name_ar) between 1 and 160`),
    ck("tenants", "default_locale", sql`default_locale in ('ar', 'en')`),
    ck(
      "tenants",
      "jurisdictions",
      sql`array_to_string(jurisdictions, ',') ~ '^[A-Z]{2}(,[A-Z]{2})*$'`,
    ),
    ck("tenants", "status", sql`status in ('active', 'tobedeleted')`),
    ck("tenants", "version", sql`version > 0`),
    ck(
      "tenants",
      "metadata",
      sql`jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 16384`,
    ),
    ck("tenants", "name", sql`num_nonnulls(name_en, name_ar) >= 1`),
    ...isolation(),
    pgPolicy("p_select", {
      for: "select",
      to: [roles.app, roles.worker, roles.cellIo, roles.retention],
      using: sql`true`,
    }),
    pgPolicy("p_insert", {
      for: "insert",
      to: roles.cellIo,
      withCheck: sql`true`,
    }),
    pgPolicy("p_update", {
      for: "update",
      to: [roles.app, roles.worker, roles.cellIo],
      using: sql`true`,
      withCheck: sql`true`,
    }),
    integrationRead(),
  ],
);

export type OrgType = "school_group" | "school" | "department";

export interface PostalAddress {
  lines?: string[];
  city?: string;
  region?: string;
  postal_code?: string;
  country?: string;
}

export const orgs = core.table.withRLS(
  "orgs",
  {
    ...tenantColumns(),
    type: text("type").$type<OrgType>().notNull(),
    parentId: uuid("parent_id"),
    parentType: text("parent_type").$type<OrgType>(),
    nameEn: text("name_en"),
    nameAr: text("name_ar"),
    identifier: text("identifier"),
    timeZone: text("time_zone"),
    defaultLocale: text("default_locale").$type<"ar" | "en">().notNull(),
    weekStart: smallint("week_start").notNull().default(7),
    weekendDays: smallint("weekend_days")
      .array()
      .notNull()
      .default(sql`'{5,6}'`),
    countryCode: text("country_code"),
    /**
     * The age, on the school's day, from which a learner signs, asks and
     * reports for themself; a learner with no birth date counts as younger.
     */
    learnersDecideFrom: smallint("learners_decide_from").notNull().default(18),
    /**
     * The school states that every learner it teaches is an adult, so each
     * decides for themself whatever their birth date on record.
     */
    learnersAreAdults: boolean("learners_are_adults").notNull().default(false),
    /** A calendar shown beside the Gregorian one, for schools that keep Hijri dates. */
    secondaryCalendar: text("secondary_calendar").$type<
      "islamic-umalqura" | "islamic-civil"
    >(),
    /** How the Arabic interface writes digits: Western 0-9, or Arabic-Indic ٠-٩. */
    digits: text("digits").$type<"latn" | "arab">().notNull().default("latn"),
    /**
     * How mathematics within Arabic text is set: left to right, as in the
     * Maghreb and in international schools, or right to left in Arabic
     * notation, as the Mashriq's school books write it.
     */
    arabicMath: text("arabic_math")
      .$type<"ltr" | "rtl">()
      .notNull()
      .default("ltr"),
    address: jsonb("address").$type<PostalAddress>(),
    phone: text("phone"),
    email: text("email"),
    logoFileId: uuid("logo_file_id"),
    lifecycle: text("lifecycle")
      .$type<"importing" | "active">()
      .notNull()
      .default("active"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("orgs", t.tenantId, t.id),
    uq("orgs", t.tenantId, t.id, t.type),
    ...baseConstraints("orgs", t, tenants),
    fk(
      "orgs",
      [t.tenantId, t.parentId, t.parentType],
      [t.tenantId, t.id, t.type],
    ),
    fk("orgs", [t.tenantId, t.logoFileId], [files.tenantId, files.id]),
    ck("orgs", "type", sql`type in ('school_group', 'school', 'department')`),
    ck("orgs", "name_en", sql`char_length(name_en) between 1 and 160`),
    ck("orgs", "name_ar", sql`char_length(name_ar) between 1 and 160`),
    ck("orgs", "identifier", sql`char_length(identifier) between 1 and 64`),
    ck("orgs", "time_zone", sql`char_length(time_zone) between 1 and 64`),
    ck("orgs", "default_locale", sql`default_locale in ('ar', 'en')`),
    ck("orgs", "week_start", sql`week_start between 1 and 7`),
    ck("orgs", "weekend_days", sql`weekend_days <@ '{1,2,3,4,5,6,7}'`),
    ck(
      "orgs",
      "secondary_calendar",
      sql`secondary_calendar in ('islamic-umalqura', 'islamic-civil')`,
    ),
    ck("orgs", "digits", sql`digits in ('latn', 'arab')`),
    ck("orgs", "arabic_math", sql`arabic_math in ('ltr', 'rtl')`),
    ck("orgs", "country_code", sql`country_code ~ '^[A-Z]{2}$'`),
    ck(
      "orgs",
      "learners_decide_from",
      sql`learners_decide_from between 1 and 25`,
    ),
    ck("orgs", "address", sql`jsonb_typeof(address) = 'object'`),
    ck("orgs", "phone", sql`char_length(phone) between 1 and 40`),
    ck("orgs", "email", sql`char_length(email) between 3 and 254`),
    ck("orgs", "lifecycle", sql`lifecycle in ('importing', 'active')`),
    ck("orgs", "name", sql`num_nonnulls(name_en, name_ar) >= 1`),
    ck("orgs", "parent_pair", sql`(parent_id is null) = (parent_type is null)`),
    ck(
      "orgs",
      "hierarchy",
      sql`(type = 'school_group' and parent_id is null) or (type = 'school' and (parent_type is null or parent_type = 'school_group')) or (type = 'department' and parent_type in ('school', 'school_group'))`,
    ),
    ck(
      "orgs",
      "school_time_zone",
      sql`type <> 'school' or time_zone is not null`,
    ),
    uniqueIndex("orgs_root_key")
      .on(t.tenantId)
      .where(sql`parent_id is null and status = 'active'`),
    uniqueIndex("orgs_identifier_key")
      .on(t.tenantId, t.identifier)
      .where(sql`status = 'active' and identifier is not null`),
    index("orgs_parent_idx").on(t.tenantId, t.parentId),
    index("orgs_delta_idx").on(t.tenantId, t.dateLastModified),
    ...isolation(),
    pgPolicy("p_select", {
      for: "select",
      to: [roles.app, roles.worker, roles.cellIo, roles.retention],
      using: sql`true`,
    }),
    pgPolicy("p_insert", {
      for: "insert",
      to: [roles.worker, roles.cellIo],
      withCheck: sql`true`,
    }),
    pgPolicy("p_update", {
      for: "update",
      to: [roles.worker, roles.cellIo],
      using: sql`true`,
      withCheck: sql`true`,
    }),
    pgPolicy("p_insert_app", {
      for: "insert",
      to: roles.app,
      withCheck: sql`type = 'department'`,
    }),
    pgPolicy("p_update_app", {
      for: "update",
      to: roles.app,
      using: sql`true`,
      withCheck: sql`type = 'department' or status = 'active'`,
    }),
    pgPolicy("p_site_select", {
      for: "select",
      to: roles.site,
      using: sql`status = 'active' and lifecycle = 'active'`,
    }),
    integrationRead(),
  ],
);

export const orgFeatures = core.table.withRLS(
  "org_features",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    feature: text("feature").notNull(),
    enabled: boolean("enabled").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("org_features", t.tenantId, t.id),
    ...baseConstraints("org_features", t, tenants),
    fk("org_features", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck("org_features", "feature", sql`feature ~ '^[a-z][a-z0-9_]{1,39}$'`),
    uniqueIndex("org_features_key")
      .on(t.tenantId, t.orgId, t.feature)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
