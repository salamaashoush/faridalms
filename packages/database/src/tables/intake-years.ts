import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { index, pgPolicy, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { admissionIntakes } from "./admissions";
import { academicSessions } from "./calendar";
import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  fk,
  pk,
  roles,
  tenantColumns,
} from "./conventions";
import { tenants } from "./tenancy";

/** The school year an intake admits into. */
export const intakeYears = core.table.withRLS(
  "intake_years",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    intakeId: uuid("intake_id").notNull(),
    schoolYearId: uuid("school_year_id").notNull(),
    schoolYearType: text("school_year_type").notNull().default("school_year"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("intake_years", t.tenantId, t.id),
    ...baseConstraints("intake_years", t, tenants),
    fk(
      "intake_years",
      [t.tenantId, t.intakeId, t.orgId],
      [admissionIntakes.tenantId, admissionIntakes.id, admissionIntakes.orgId],
    ),
    fk(
      "intake_years",
      [t.tenantId, t.schoolYearId, t.schoolYearType, t.schoolYearId, t.orgId],
      [
        academicSessions.tenantId,
        academicSessions.id,
        academicSessions.type,
        academicSessions.schoolYearId,
        academicSessions.orgId,
      ],
    ),
    ck(
      "intake_years",
      "school_year_type",
      sql`school_year_type = 'school_year'`,
    ),
    uniqueIndex("intake_years_intake_key")
      .on(t.tenantId, t.intakeId)
      .where(sql`status = 'active'`),
    index("intake_years_year_idx")
      .on(t.tenantId, t.schoolYearId)
      .where(sql`status = 'active'`),
    pgPolicy("p_site_select", {
      for: "select",
      to: roles.site,
      using: sql`status = 'active'`,
    }),
    ...entityProfile(),
  ],
);
