import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  index,
  numeric,
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
  pk,
  tenantColumns,
} from "./conventions";
import { descriptors } from "./descriptors";
import { gradeScales } from "./grading";
import { orgs, tenants } from "./tenancy";

/**
 * A programme a school runs, such as the IB Diploma or IGCSE: the grade
 * levels it covers and the scale its classes grade on. Two can share a
 * grade level.
 */
export const programmes = core.table.withRLS(
  "programmes",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    titleEn: text("title_en"),
    titleAr: text("title_ar"),
    gradeScaleId: uuid("grade_scale_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("programmes", t.tenantId, t.id),
    ...baseConstraints("programmes", t, tenants),
    fk("programmes", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "programmes",
      [t.tenantId, t.gradeScaleId],
      [gradeScales.tenantId, gradeScales.id],
    ),
    ck("programmes", "title_en", sql`char_length(title_en) between 1 and 120`),
    ck("programmes", "title_ar", sql`char_length(title_ar) between 1 and 120`),
    ck("programmes", "title", sql`num_nonnulls(title_en, title_ar) >= 1`),
    index("programmes_org_idx")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

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

/**
 * How a programme weighs its work in a term grade, such as Coursework 40,
 * Tests 40 and Homework 20. Work set in its classes picks one.
 */
export const programmeCategories = core.table.withRLS(
  "programme_categories",
  {
    ...tenantColumns(),
    programmeId: uuid("programme_id").notNull(),
    titleEn: text("title_en"),
    titleAr: text("title_ar"),
    weight: numeric("weight", {
      precision: 5,
      scale: 2,
      mode: "number",
    }).notNull(),
    position: smallint("position").notNull().default(0),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("programme_categories", t.tenantId, t.id),
    ...baseConstraints("programme_categories", t, tenants),
    fk(
      "programme_categories",
      [t.tenantId, t.programmeId],
      [programmes.tenantId, programmes.id],
    ),
    ck("programme_categories", "weight", sql`weight > 0 and weight <= 100`),
    ck(
      "programme_categories",
      "title_en",
      sql`char_length(title_en) between 1 and 60`,
    ),
    ck(
      "programme_categories",
      "title_ar",
      sql`char_length(title_ar) between 1 and 60`,
    ),
    ck(
      "programme_categories",
      "title",
      sql`num_nonnulls(title_en, title_ar) >= 1`,
    ),
    index("programme_categories_programme_idx")
      .on(t.tenantId, t.programmeId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
