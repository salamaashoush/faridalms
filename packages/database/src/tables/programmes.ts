import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
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
import { gradeScales } from "./grading";
import { classes } from "./teaching";
import { orgs, tenants } from "./tenancy";

/**
 * A programme a school runs, such as the IB Diploma or IGCSE, and the
 * scale its classes grade on.
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

/**
 * What a class grades by: the programme it follows and a scale of its own.
 * A programme the school chose for the class is `programme_chosen`; one a
 * module derived for it (by its grade, say) is not, and is derived again
 * when what it came from changes. A class with neither has no row.
 */
export const classGrading = core.table.withRLS(
  "class_grading",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    classId: uuid("class_id").notNull(),
    programmeId: uuid("programme_id"),
    programmeChosen: boolean("programme_chosen").notNull().default(true),
    gradeScaleId: uuid("grade_scale_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("class_grading", t.tenantId, t.id),
    ...baseConstraints("class_grading", t, tenants),
    fk(
      "class_grading",
      [t.tenantId, t.classId, t.orgId],
      [classes.tenantId, classes.id, classes.orgId],
    ),
    fk(
      "class_grading",
      [t.tenantId, t.programmeId],
      [programmes.tenantId, programmes.id],
    ),
    fk(
      "class_grading",
      [t.tenantId, t.gradeScaleId],
      [gradeScales.tenantId, gradeScales.id],
    ),
    ck(
      "class_grading",
      "chosen",
      sql`num_nonnulls(programme_id, grade_scale_id) >= 1`,
    ),
    ck(
      "class_grading",
      "programme_chosen",
      sql`programme_chosen or programme_id is not null`,
    ),
    uniqueIndex("class_grading_class_key")
      .on(t.tenantId, t.classId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
