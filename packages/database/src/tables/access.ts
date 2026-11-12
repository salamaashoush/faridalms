import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { boolean, index, text, uuid } from "drizzle-orm/pg-core";

import {
  baseConstraints,
  ck,
  core,
  daterange,
  entityColumns,
  entityProfile,
  eraseAndDelete,
  erasureOf,
  fk,
  pk,
  range,
  tenantColumns,
} from "./conventions";
import { users } from "./people";
import { orgs, tenants } from "./tenancy";

export const BUILTIN_ACCESS_ROLES = [
  "site_administrator",
  "district_administrator",
  "system_administrator",
  "principal",
  "teacher",
  "aide",
  "counselor",
  "proctor",
  "staff",
  "student",
  "family",
  "admissions_officer",
  "applicant_family",
  "applicant",
] as const;
export type BuiltinAccessRole = (typeof BUILTIN_ACCESS_ROLES)[number];

export const accessRoles = core.table.withRLS(
  "access_roles",
  {
    ...tenantColumns(),
    orgId: uuid("org_id"),
    builtinKey: text("builtin_key").$type<BuiltinAccessRole>(),
    nameEn: text("name_en"),
    nameAr: text("name_ar"),
    descriptionEn: text("description_en"),
    descriptionAr: text("description_ar"),
    capabilities: text("capabilities").array().notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("access_roles", t.tenantId, t.id),
    ...baseConstraints("access_roles", t, tenants),
    fk("access_roles", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck(
      "access_roles",
      "builtin_key",
      sql`builtin_key in ('site_administrator', 'district_administrator', 'system_administrator', 'principal', 'teacher', 'aide', 'counselor', 'proctor', 'staff', 'student', 'family', 'admissions_officer', 'applicant_family', 'applicant')`,
    ),
    ck("access_roles", "name_en", sql`char_length(name_en) between 1 and 80`),
    ck("access_roles", "name_ar", sql`char_length(name_ar) between 1 and 80`),
    ck(
      "access_roles",
      "description_en",
      sql`char_length(description_en) between 1 and 500`,
    ),
    ck(
      "access_roles",
      "description_ar",
      sql`char_length(description_ar) between 1 and 500`,
    ),
    ck(
      "access_roles",
      "capabilities",
      sql`array_to_string(capabilities, ',') ~ '^([a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*(,[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*)*)?$'`,
    ),
    ck("access_roles", "name", sql`num_nonnulls(name_en, name_ar) >= 1`),
    ...entityProfile(),
  ],
);

export const accessRoleAssignments = core.table.withRLS(
  "access_role_assignments",
  {
    ...tenantColumns(),
    userId: uuid("user_id").notNull(),
    accessRoleId: uuid("access_role_id").notNull(),
    orgId: uuid("org_id").notNull(),
    validDuring: daterange("valid_during").notNull(),
    replacesBuiltin: boolean("replaces_builtin").notNull().default(false),
    grantedByUserId: uuid("granted_by_user_id"),
    reason: text("reason"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("access_role_assignments", t.tenantId, t.id),
    ...baseConstraints("access_role_assignments", t, tenants),
    fk(
      "access_role_assignments",
      [t.tenantId, t.userId],
      [users.tenantId, users.id],
    ),
    fk(
      "access_role_assignments",
      [t.tenantId, t.accessRoleId],
      [accessRoles.tenantId, accessRoles.id],
    ),
    fk(
      "access_role_assignments",
      [t.tenantId, t.orgId],
      [orgs.tenantId, orgs.id],
    ),
    fk(
      "access_role_assignments",
      [t.tenantId, t.grantedByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "access_role_assignments",
      "reason",
      sql`char_length(reason) between 1 and 500`,
    ),
    ck(
      "access_role_assignments",
      "valid_during",
      range.started("valid_during"),
    ),
    index("access_role_assignments_user_idx")
      .on(t.tenantId, t.userId)
      .where(sql`status = 'active'`),
    index("access_role_assignments_role_idx")
      .on(t.tenantId, t.accessRoleId)
      .where(sql`status = 'active'`),
    ...eraseAndDelete(erasureOf("user_id")),
    ...entityProfile(),
  ],
);
