import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  baseConstraints,
  ck,
  core,
  daterange,
  entityColumns,
  entityProfile,
  fk,
  pk,
  tenantColumns,
  uq,
} from "./conventions";
import { orgs, tenants } from "./tenancy";

export const descriptors = core.table.withRLS(
  "descriptors",
  {
    ...tenantColumns(),
    namespace: text("namespace").notNull(),
    codeValue: text("code_value").notNull(),
    labelEn: text("label_en"),
    labelAr: text("label_ar"),
    descriptionEn: text("description_en"),
    descriptionAr: text("description_ar"),
    systemMeaning: text("system_meaning"),
    orgId: uuid("org_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    color: text("color"),
    icon: text("icon"),
    effectiveDuring: daterange("effective_during")
      .notNull()
      .default(sql`'(,)'`),
    priorDescriptorId: uuid("prior_descriptor_id"),
    onerosterToken: text("oneroster_token"),
    edfiUri: text("edfi_uri"),
    seeded: boolean("seeded").notNull().default(false),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("descriptors", t.tenantId, t.id),
    uq("descriptors", t.tenantId, t.id, t.namespace),
    uq("descriptors", t.tenantId, t.id, t.namespace, t.systemMeaning),
    ...baseConstraints("descriptors", t, tenants),
    fk("descriptors", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "descriptors",
      [t.tenantId, t.priorDescriptorId, t.namespace],
      [t.tenantId, t.id, t.namespace],
    ),
    ck("descriptors", "namespace", sql`namespace ~ '^[a-z][a-z0-9_]{1,62}$'`),
    ck(
      "descriptors",
      "code_value",
      sql`char_length(code_value) between 1 and 50 and strpos(code_value, '#') = 0`,
    ),
    ck("descriptors", "label_en", sql`char_length(label_en) between 1 and 75`),
    ck("descriptors", "label_ar", sql`char_length(label_ar) between 1 and 75`),
    ck(
      "descriptors",
      "description_en",
      sql`char_length(description_en) between 1 and 500`,
    ),
    ck(
      "descriptors",
      "description_ar",
      sql`char_length(description_ar) between 1 and 500`,
    ),
    ck(
      "descriptors",
      "system_meaning",
      sql`system_meaning ~ '^[a-z][a-z0-9_]{0,62}$'`,
    ),
    ck("descriptors", "color", sql`color ~ '^#[0-9a-f]{6}$'`),
    ck("descriptors", "icon", sql`icon ~ '^[a-z0-9-]{1,40}$'`),
    ck(
      "descriptors",
      "oneroster_token",
      sql`oneroster_token ~ '^(ext:)?[A-Za-z0-9._-]{1,60}$'`,
    ),
    ck("descriptors", "edfi_uri", sql`char_length(edfi_uri) between 1 and 306`),
    ck("descriptors", "label", sql`num_nonnulls(label_en, label_ar) >= 1`),
    ck(
      "descriptors",
      "seeded_meaning",
      sql`not seeded or (system_meaning is not null and org_id is null)`,
    ),
    ck(
      "descriptors",
      "seeded_status",
      sql`not (seeded and status = 'tobedeleted')`,
    ),
    ck(
      "descriptors",
      "relation_token",
      sql`namespace <> 'relation' or oneroster_token is not distinct from (case system_meaning when 'mother' then 'parent' when 'father' then 'parent' when 'guardian' then 'guardian' when 'step_parent' then 'relative' when 'grandparent' then 'relative' when 'sibling' then 'relative' when 'other_relative' then 'relative' end)`,
    ),
    index("descriptors_namespace_idx").on(t.tenantId, t.namespace, t.sortOrder),
    ...entityProfile({ integration: true }),
  ],
);

export const descriptorOverrides = core.table.withRLS(
  "descriptor_overrides",
  {
    ...tenantColumns(),
    descriptorId: uuid("descriptor_id").notNull(),
    orgId: uuid("org_id").notNull(),
    labelEn: text("label_en"),
    labelAr: text("label_ar"),
    descriptionEn: text("description_en"),
    descriptionAr: text("description_ar"),
    sortOrder: integer("sort_order"),
    color: text("color"),
    icon: text("icon"),
    effectiveDuring: daterange("effective_during"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("descriptor_overrides", t.tenantId, t.id),
    ...baseConstraints("descriptor_overrides", t, tenants),
    fk(
      "descriptor_overrides",
      [t.tenantId, t.descriptorId],
      [descriptors.tenantId, descriptors.id],
    ),
    fk("descriptor_overrides", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck(
      "descriptor_overrides",
      "label_en",
      sql`char_length(label_en) between 1 and 75`,
    ),
    ck(
      "descriptor_overrides",
      "label_ar",
      sql`char_length(label_ar) between 1 and 75`,
    ),
    ck(
      "descriptor_overrides",
      "description_en",
      sql`char_length(description_en) between 1 and 500`,
    ),
    ck(
      "descriptor_overrides",
      "description_ar",
      sql`char_length(description_ar) between 1 and 500`,
    ),
    ck("descriptor_overrides", "color", sql`color ~ '^#[0-9a-f]{6}$'`),
    ck("descriptor_overrides", "icon", sql`icon ~ '^[a-z0-9-]{1,40}$'`),
    ck(
      "descriptor_overrides",
      "content",
      sql`num_nonnulls(label_en, label_ar, description_en, description_ar, sort_order, color, icon, effective_during) >= 1`,
    ),
    uniqueIndex("descriptor_overrides_key")
      .on(t.tenantId, t.descriptorId, t.orgId)
      .where(sql`status = 'active'`),
    ...entityProfile({ integration: true }),
  ],
);
