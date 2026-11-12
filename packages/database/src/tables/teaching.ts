import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { boolean, index, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import {
  baseConstraints,
  ck,
  core,
  daterange,
  entityColumns,
  entityProfile,
  erase,
  eraseAndDelete,
  erasureOf,
  fk,
  pk,
  range,
  tenantColumns,
  uq,
} from "./conventions";
import { descriptors } from "./descriptors";
import { locations } from "./files";
import { users } from "./people";
import { importRuns } from "./records";
import { orgs, tenants } from "./tenancy";

export type EnrollmentSource =
  | "manual"
  | "import"
  | "sis"
  | "oneroster"
  | "rollover"
  | "homeroom";
export type EnrollmentRole =
  | "student"
  | "teacher"
  | "aide"
  | "proctor"
  | "administrator";

/** OneRoster courses: a subject a school teaches. */
export const courses = core.table.withRLS(
  "courses",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    orgType: text("org_type").notNull().default("school"),
    code: text("code").notNull(),
    titleEn: text("title_en"),
    titleAr: text("title_ar"),
    subjectDescriptorId: uuid("subject_descriptor_id").notNull(),
    subjectNs: text("subject_ns")
      .notNull()
      .generatedAlwaysAs(sql`'subject'`),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("courses", t.tenantId, t.id),
    uq("courses", t.tenantId, t.id, t.orgId),
    ...baseConstraints("courses", t, tenants),
    fk(
      "courses",
      [t.tenantId, t.orgId, t.orgType],
      [orgs.tenantId, orgs.id, orgs.type],
    ),
    fk(
      "courses",
      [t.tenantId, t.subjectDescriptorId, t.subjectNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    ck("courses", "org_type", sql`org_type = 'school'`),
    ck("courses", "code", sql`code ~ '^[A-Za-z0-9_.-]{1,40}$'`),
    ck("courses", "title_en", sql`char_length(title_en) between 1 and 120`),
    ck("courses", "title_ar", sql`char_length(title_ar) between 1 and 120`),
    ck("courses", "title", sql`num_nonnulls(title_en, title_ar) >= 1`),
    uniqueIndex("courses_code_key")
      .on(t.tenantId, t.orgId, t.code)
      .where(sql`status = 'active'`),
    index("courses_delta_idx").on(t.tenantId, t.dateLastModified),
    ...entityProfile({ integration: true }),
  ],
);

/**
 * OneRoster classes: a group that is taught, over the dates it runs, open
 * at the end for a class that keeps enrolling. A course and a subject are
 * both optional; whoever is in the class is its enrollments.
 */
export const classes = core.table.withRLS(
  "classes",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    orgType: text("org_type").notNull().default("school"),
    code: text("code").notNull(),
    titleEn: text("title_en"),
    titleAr: text("title_ar"),
    runs: daterange("runs").notNull(),
    courseId: uuid("course_id"),
    subjectDescriptorId: uuid("subject_descriptor_id"),
    subjectNs: text("subject_ns")
      .notNull()
      .generatedAlwaysAs(sql`'subject'`),
    locationId: uuid("location_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("classes", t.tenantId, t.id),
    uq("classes", t.tenantId, t.id, t.orgId),
    ...baseConstraints("classes", t, tenants),
    fk(
      "classes",
      [t.tenantId, t.orgId, t.orgType],
      [orgs.tenantId, orgs.id, orgs.type],
    ),
    fk(
      "classes",
      [t.tenantId, t.courseId, t.orgId],
      [courses.tenantId, courses.id, courses.orgId],
    ),
    fk(
      "classes",
      [t.tenantId, t.subjectDescriptorId, t.subjectNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "classes",
      [t.tenantId, t.locationId],
      [locations.tenantId, locations.id],
    ),
    ck("classes", "org_type", sql`org_type = 'school'`),
    ck("classes", "code", sql`code ~ '^[A-Za-z0-9_.-]{1,40}$'`),
    ck("classes", "title_en", sql`char_length(title_en) between 1 and 120`),
    ck("classes", "title_ar", sql`char_length(title_ar) between 1 and 120`),
    ck("classes", "title", sql`num_nonnulls(title_en, title_ar) >= 1`),
    ck("classes", "runs", range.started("runs")),
    index("classes_school_idx")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active'`),
    index("classes_delta_idx").on(t.tenantId, t.dateLastModified),
    ...entityProfile({ integration: true }),
  ],
);

/**
 * OneRoster enrollments: who is in a class, in which role, and when. Dated
 * inside the days the class runs (`enrollments_tenant_id_active_class_id_valid_during_fkey`),
 * so a transfer ends one row and starts another instead of rewriting either.
 */
export const enrollments = core.table.withRLS(
  "enrollments",
  {
    ...tenantColumns(),
    classId: uuid("class_id").notNull(),
    orgId: uuid("org_id").notNull(),
    userId: uuid("user_id").notNull(),
    role: text("role").$type<EnrollmentRole>().notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    classroomPositionDescriptorId: uuid("classroom_position_descriptor_id"),
    classroomPositionNs: text("classroom_position_ns")
      .notNull()
      .generatedAlwaysAs(sql`'classroom_position'`),
    validDuring: daterange("valid_during").notNull(),
    source: text("source").$type<EnrollmentSource>().notNull(),
    importRunId: uuid("import_run_id"),
    ...entityColumns(),
    /**
     * The class while the enrollment is active: a tombstoned one keeps the
     * days it had, which may lie outside a class that later ended, so the
     * key holding enrollments inside their class passes it over.
     */
    activeClassId: uuid("active_class_id").generatedAlwaysAs(
      sql`case when status = 'active' then class_id end`,
    ),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("enrollments", t.tenantId, t.id),
    uq(
      "enrollments",
      t.tenantId,
      t.id,
      t.classId,
      t.userId,
      t.orgId,
      t.validDuring,
      t.status,
    ),
    ...baseConstraints("enrollments", t, tenants),
    fk(
      "enrollments",
      [t.tenantId, t.classId, t.orgId],
      [classes.tenantId, classes.id, classes.orgId],
    ),
    fk("enrollments", [t.tenantId, t.userId], [users.tenantId, users.id]),
    fk(
      "enrollments",
      [t.tenantId, t.classroomPositionDescriptorId, t.classroomPositionNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "enrollments",
      [t.tenantId, t.importRunId],
      [importRuns.tenantId, importRuns.id],
    ),
    ck(
      "enrollments",
      "role",
      sql`role in ('student', 'teacher', 'aide', 'proctor', 'administrator')`,
    ),
    ck("enrollments", "primary", sql`not is_primary or role = 'teacher'`),
    ck(
      "enrollments",
      "position",
      sql`classroom_position_descriptor_id is null or role in ('teacher', 'aide')`,
    ),
    ck(
      "enrollments",
      "source",
      sql`source in ('manual', 'import', 'sis', 'oneroster', 'rollover', 'homeroom')`,
    ),
    ck("enrollments", "valid_during", range.started("valid_during")),
    index("enrollments_class_idx")
      .on(t.tenantId, t.classId)
      .where(sql`status = 'active'`),
    index("enrollments_user_idx")
      .on(t.tenantId, t.userId)
      .where(sql`status = 'active'`),
    index("enrollments_delta_idx").on(t.tenantId, t.dateLastModified),
    ...entityProfile({ integration: true }),
    ...erase(erasureOf("user_id")),
  ],
);

/** A teacher's named set of students in one class, for giving work to some. */
export const classGroups = core.table.withRLS(
  "class_groups",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    classId: uuid("class_id").notNull(),
    titleEn: text("title_en"),
    titleAr: text("title_ar"),
    createdByUserId: uuid("created_by_user_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("class_groups", t.tenantId, t.id),
    ...baseConstraints("class_groups", t, tenants),
    fk(
      "class_groups",
      [t.tenantId, t.classId, t.orgId],
      [classes.tenantId, classes.id, classes.orgId],
    ),
    fk(
      "class_groups",
      [t.tenantId, t.createdByUserId],
      [users.tenantId, users.id],
    ),
    ck("class_groups", "title_en", sql`char_length(title_en) between 1 and 80`),
    ck("class_groups", "title_ar", sql`char_length(title_ar) between 1 and 80`),
    ck("class_groups", "title", sql`num_nonnulls(title_en, title_ar) >= 1`),
    index("class_groups_class_idx")
      .on(t.tenantId, t.classId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

export const classGroupMembers = core.table.withRLS(
  "class_group_members",
  {
    ...tenantColumns(),
    groupId: uuid("group_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("class_group_members", t.tenantId, t.id),
    ...baseConstraints("class_group_members", t, tenants),
    fk(
      "class_group_members",
      [t.tenantId, t.groupId],
      [classGroups.tenantId, classGroups.id],
    ),
    fk(
      "class_group_members",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    uniqueIndex("class_group_members_key")
      .on(t.tenantId, t.groupId, t.studentUserId)
      .where(sql`status = 'active'`),
    ...eraseAndDelete(erasureOf("student_user_id")),
    ...entityProfile(),
  ],
);
