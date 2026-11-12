import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  date,
  index,
  jsonb,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  baseConstraints,
  ck,
  core,
  daterange,
  entityColumns,
  entityProfile,
  erase,
  erasureOf,
  fk,
  pk,
  range,
  tenantColumns,
} from "./conventions";
import { descriptors } from "./descriptors";
import { users } from "./people";
import { importRuns } from "./records";
import { orgs, tenants } from "./tenancy";

export const NATURAL_ROLES = [
  "student",
  "teacher",
  "aide",
  "counselor",
  "principal",
  "site_administrator",
  "district_administrator",
  "system_administrator",
  "proctor",
  "staff",
  "parent",
  "guardian",
  "relative",
  "applicant_family",
  "applicant",
] as const;
export type NaturalRole = (typeof NATURAL_ROLES)[number];

export const userRoles = core.table.withRLS(
  "user_roles",
  {
    ...tenantColumns(),
    userId: uuid("user_id").notNull(),
    orgId: uuid("org_id").notNull(),
    orgType: text("org_type").notNull(),
    role: text("role").$type<NaturalRole>().notNull(),
    validDuring: daterange("valid_during").notNull(),
    source: text("source")
      .$type<
        "manual" | "import" | "sis" | "oneroster" | "sso_jit" | "derived"
      >()
      .notNull(),
    positionDescriptorId: uuid("position_descriptor_id"),
    positionNs: text("position_ns")
      .notNull()
      .generatedAlwaysAs(sql`'staff_position'`),
    titleEn: text("title_en"),
    titleAr: text("title_ar"),
    importRunId: uuid("import_run_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("user_roles", t.tenantId, t.id),
    ...baseConstraints("user_roles", t, tenants),
    fk("user_roles", [t.tenantId, t.userId], [users.tenantId, users.id]),
    fk(
      "user_roles",
      [t.tenantId, t.orgId, t.orgType],
      [orgs.tenantId, orgs.id, orgs.type],
    ),
    fk(
      "user_roles",
      [t.tenantId, t.positionDescriptorId, t.positionNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "user_roles",
      [t.tenantId, t.importRunId],
      [importRuns.tenantId, importRuns.id],
    ),
    ck(
      "user_roles",
      "role",
      sql`role in ('student', 'teacher', 'aide', 'counselor', 'principal', 'site_administrator', 'district_administrator', 'system_administrator', 'proctor', 'staff', 'parent', 'guardian', 'relative', 'applicant_family', 'applicant')`,
    ),
    ck(
      "user_roles",
      "source",
      sql`source in ('manual', 'import', 'sis', 'oneroster', 'sso_jit', 'derived')`,
    ),
    ck("user_roles", "title_en", sql`char_length(title_en) between 1 and 100`),
    ck("user_roles", "title_ar", sql`char_length(title_ar) between 1 and 100`),
    ck("user_roles", "valid_during", range.started("valid_during")),
    ck(
      "user_roles",
      "org_type",
      sql`role = 'system_administrator' or (role = 'district_administrator' and org_type = 'school_group') or (role not in ('district_administrator', 'system_administrator') and org_type = 'school')`,
    ),
    index("user_roles_org_role_idx")
      .on(t.tenantId, t.orgId, t.role)
      .where(sql`status = 'active'`),
    index("user_roles_user_idx")
      .on(t.tenantId, t.userId)
      .where(sql`status = 'active'`),
    index("user_roles_delta_idx").on(t.tenantId, t.dateLastModified),
    ...entityProfile({ integration: true }),
    ...erase(erasureOf("user_id")),
  ],
);

/** What leaving the school ended, as it stood, so a return gives back exactly that. */
export interface DepartureEnded {
  /**
   * The student role, and the day after its last before the student left
   * (null ran on); one only to begin later was dropped whole.
   */
  role: { id: string; until: string | null; dropped: boolean } | null;
  /** Class enrollments cut short on the leaving day, each with its end before. */
  enrollments: { id: string; until: string | null }[];
  /** Enrollments that were to begin after and were dropped. */
  dropped: string[];
  /** What each module ended with the departure, by module, for it to give back. */
  parts: Record<string, unknown>;
}

/**
 * A student leaving the school: the day they are no longer one, which their
 * student role ends on, and the day the record closes to them and their
 * family, which may be later so they read the last reports. What leaving
 * ended is kept so a return restores it. One stands at a time; a return
 * tombstones it.
 */
export const studentDepartures = core.table.withRLS(
  "student_departures",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    orgType: text("org_type").notNull().default("school"),
    studentUserId: uuid("student_user_id").notNull(),
    /** The first day the student is not at the school. */
    leftOn: date("left_on", { mode: "string" }).notNull(),
    /** The first day the student and their family no longer read the record. */
    accessEndsOn: date("access_ends_on", { mode: "string" }).notNull(),
    ended: jsonb("ended").$type<DepartureEnded>().notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("student_departures", t.tenantId, t.id),
    ...baseConstraints("student_departures", t, tenants),
    fk(
      "student_departures",
      [t.tenantId, t.orgId, t.orgType],
      [orgs.tenantId, orgs.id, orgs.type],
    ),
    fk(
      "student_departures",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    ck("student_departures", "org_type", sql`org_type = 'school'`),
    ck("student_departures", "access", sql`access_ends_on >= left_on`),
    ck(
      "student_departures",
      "ended",
      sql`jsonb_typeof(ended) = 'object' and octet_length(ended::text) <= 262144`,
    ),
    uniqueIndex("student_departures_student_key")
      .on(t.tenantId, t.orgId, t.studentUserId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    ...erase(erasureOf("student_user_id")),
  ],
);
