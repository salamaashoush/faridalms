import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { boolean, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import {
  baseConstraints,
  core,
  entityColumns,
  entityProfile,
  fk,
  pk,
  tenantColumns,
} from "./conventions";
import { classes } from "./teaching";
import { orgs, tenants } from "./tenancy";

/** A school's gradebook rules; a school without a row uses the defaults. */
export const gradebookSettings = core.table.withRLS(
  "gradebook_settings",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    /** Whether a class whose teacher has not chosen shows learners their running grade. */
    runningShown: boolean("running_shown").notNull().default(false),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("gradebook_settings", t.tenantId, t.id),
    ...baseConstraints("gradebook_settings", t, tenants),
    fk("gradebook_settings", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    uniqueIndex("gradebook_settings_org_key")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * Whether a class shows its learners their running grade, as its teacher
 * chose or as the school's default stood when the default last changed.
 */
export const classRunningGrades = core.table.withRLS(
  "class_running_grades",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    classId: uuid("class_id").notNull(),
    shown: boolean("shown").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("class_running_grades", t.tenantId, t.id),
    ...baseConstraints("class_running_grades", t, tenants),
    fk(
      "class_running_grades",
      [t.tenantId, t.classId, t.orgId],
      [classes.tenantId, classes.id, classes.orgId],
    ),
    uniqueIndex("class_running_grades_class_key")
      .on(t.tenantId, t.classId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
