import type { GradeBand, GradeDisplay } from "@faridalms/domain/grading";
import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { date, index, jsonb, text, uuid } from "drizzle-orm/pg-core";

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
import { users } from "./people";
import { orgs, tenants } from "./tenancy";

/**
 * A school's way of turning scores into grades, such as IGCSE A* to G or
 * the IB's 1 to 7. Its bands live in versions, so a change applies to new
 * grades while grades already given keep the bands they were given under.
 */
export const gradeScales = core.table.withRLS(
  "grade_scales",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    titleEn: text("title_en"),
    titleAr: text("title_ar"),
    display: text("display").$type<GradeDisplay>().notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("grade_scales", t.tenantId, t.id),
    ...baseConstraints("grade_scales", t, tenants),
    fk("grade_scales", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck("grade_scales", "display", sql`display in ('grade', 'grade_score')`),
    ck(
      "grade_scales",
      "title_en",
      sql`char_length(title_en) between 1 and 120`,
    ),
    ck(
      "grade_scales",
      "title_ar",
      sql`char_length(title_ar) between 1 and 120`,
    ),
    ck("grade_scales", "title", sql`num_nonnulls(title_en, title_ar) >= 1`),
    index("grade_scales_org_idx")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * A scale's bands from a date. Versions are never changed, only added, so
 * the grade a stored version gives a stored score never moves.
 */
export const gradeScaleVersions = core.table.withRLS(
  "grade_scale_versions",
  {
    ...tenantColumns(),
    scaleId: uuid("scale_id").notNull(),
    effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
    bands: jsonb("bands").$type<GradeBand[]>().notNull(),
    reason: text("reason"),
    createdByUserId: uuid("created_by_user_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("grade_scale_versions", t.tenantId, t.id),
    ...baseConstraints("grade_scale_versions", t, tenants),
    fk(
      "grade_scale_versions",
      [t.tenantId, t.scaleId],
      [gradeScales.tenantId, gradeScales.id],
    ),
    fk(
      "grade_scale_versions",
      [t.tenantId, t.createdByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "grade_scale_versions",
      "bands",
      sql`jsonb_typeof(bands) = 'array' and jsonb_array_length(bands) between 2 and 20`,
    ),
    ck(
      "grade_scale_versions",
      "reason",
      sql`char_length(reason) between 1 and 500`,
    ),
    index("grade_scale_versions_scale_idx")
      .on(t.tenantId, t.scaleId, t.effectiveFrom)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
