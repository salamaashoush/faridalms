import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { smallint, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  fk,
  pk,
  tenantColumns,
} from "./conventions";
import { orgs, tenants } from "./tenancy";

export type StudentRetention = "years_after_leaving" | "until_age";

/**
 * How long a school keeps the records of people who have left. A school
 * without a row, or with a rule left empty, is never asked to destroy them.
 */
export const retentionSettings = core.table.withRLS(
  "retention_settings",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    studentRule: text("student_rule").$type<StudentRetention>(),
    studentValue: smallint("student_value"),
    staffYears: smallint("staff_years"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("retention_settings", t.tenantId, t.id),
    ...baseConstraints("retention_settings", t, tenants),
    fk("retention_settings", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck(
      "retention_settings",
      "student_rule",
      sql`student_rule in ('years_after_leaving', 'until_age')`,
    ),
    ck(
      "retention_settings",
      "student_value",
      sql`(student_rule is null) = (student_value is null) and (student_rule <> 'years_after_leaving' or student_value between 1 and 100) and (student_rule <> 'until_age' or student_value between 18 and 100)`,
    ),
    ck("retention_settings", "staff_years", sql`staff_years between 1 and 100`),
    uniqueIndex("retention_settings_org_key")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
