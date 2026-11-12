import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { index, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import {
  baseConstraints,
  core,
  entityColumns,
  entityProfile,
  fk,
  pk,
  tenantColumns,
} from "./conventions";
import { descriptors } from "./descriptors";
import { programmes } from "./programmes";
import { tenants } from "./tenancy";

/**
 * A grade level a programme covers: a class of that grade with no
 * programme of its own follows the one programme covering its grade.
 */
export const programmeGradeLevels = core.table.withRLS(
  "programme_grade_levels",
  {
    ...tenantColumns(),
    programmeId: uuid("programme_id").notNull(),
    gradeLevelDescriptorId: uuid("grade_level_descriptor_id").notNull(),
    gradeLevelNs: text("grade_level_ns")
      .notNull()
      .generatedAlwaysAs(sql`'grade_level'`),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("programme_grade_levels", t.tenantId, t.id),
    ...baseConstraints("programme_grade_levels", t, tenants),
    fk(
      "programme_grade_levels",
      [t.tenantId, t.programmeId],
      [programmes.tenantId, programmes.id],
    ),
    fk(
      "programme_grade_levels",
      [t.tenantId, t.gradeLevelDescriptorId, t.gradeLevelNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    uniqueIndex("programme_grade_levels_key")
      .on(t.tenantId, t.programmeId, t.gradeLevelDescriptorId)
      .where(sql`status = 'active'`),
    index("programme_grade_levels_level_idx")
      .on(t.tenantId, t.gradeLevelDescriptorId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
