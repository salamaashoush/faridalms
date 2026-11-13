import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
import { tenants } from "./tenancy";

/** A class for young children, and through it the children who learn in it. */
export const youngClasses = core.table.withRLS(
  "young_classes",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    classId: uuid("class_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("young_classes", t.tenantId, t.id),
    ...baseConstraints("young_classes", t, tenants),
    fk(
      "young_classes",
      [t.tenantId, t.classId, t.orgId],
      [classes.tenantId, classes.id, classes.orgId],
    ),
    uniqueIndex("young_classes_class_key")
      .on(t.tenantId, t.classId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
