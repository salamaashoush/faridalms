import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { index, pgPolicy, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { admissionIntakes } from "./admissions";
import {
  baseConstraints,
  core,
  entityColumns,
  entityProfile,
  fk,
  pk,
  roles,
  tenantColumns,
} from "./conventions";
import { descriptors } from "./descriptors";
import { tenants } from "./tenancy";

/** The grade or level an intake admits into. */
export const intakeGrades = core.table.withRLS(
  "intake_grades",
  {
    ...tenantColumns(),
    intakeId: uuid("intake_id").notNull(),
    gradeLevelDescriptorId: uuid("grade_level_descriptor_id").notNull(),
    gradeLevelNs: text("grade_level_ns")
      .notNull()
      .generatedAlwaysAs(sql`'grade_level'`),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("intake_grades", t.tenantId, t.id),
    ...baseConstraints("intake_grades", t, tenants),
    fk(
      "intake_grades",
      [t.tenantId, t.intakeId],
      [admissionIntakes.tenantId, admissionIntakes.id],
    ),
    fk(
      "intake_grades",
      [t.tenantId, t.gradeLevelDescriptorId, t.gradeLevelNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    uniqueIndex("intake_grades_intake_key")
      .on(t.tenantId, t.intakeId)
      .where(sql`status = 'active'`),
    index("intake_grades_grade_idx")
      .on(t.tenantId, t.gradeLevelDescriptorId)
      .where(sql`status = 'active'`),
    pgPolicy("p_site_select", {
      for: "select",
      to: roles.site,
      using: sql`status = 'active'`,
    }),
    ...entityProfile(),
  ],
);
