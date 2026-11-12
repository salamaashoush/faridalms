import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { boolean, index, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { academicSessions } from "./calendar";
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
  uq,
} from "./conventions";
import { descriptors } from "./descriptors";
import { locations } from "./files";
import { gradeScales } from "./grading";
import { users } from "./people";
import { programmes } from "./programmes";
import { importRuns } from "./records";
import { orgs, tenants } from "./tenancy";

export type ClassType = "homeroom" | "scheduled";
export type EnrollmentRole =
  | "student"
  | "teacher"
  | "aide"
  | "proctor"
  | "administrator";

/** OneRoster courses: a subject a school teaches, optionally at one grade. */
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
    gradeLevelDescriptorId: uuid("grade_level_descriptor_id"),
    gradeLevelNs: text("grade_level_ns")
      .notNull()
      .generatedAlwaysAs(sql`'grade_level'`),
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
    fk(
      "courses",
      [t.tenantId, t.gradeLevelDescriptorId, t.gradeLevelNs],
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
 * OneRoster classes. A homeroom is the class a student belongs to for the
 * year; a scheduled class is a subject taught to one (Ed-Fi's section), whose
 * roster is its homeroom's, or its own when it has no homeroom.
 */
export const classes = core.table.withRLS(
  "classes",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    orgType: text("org_type").notNull().default("school"),
    schoolYearId: uuid("school_year_id").notNull(),
    schoolYearType: text("school_year_type").notNull().default("school_year"),
    classType: text("class_type").$type<ClassType>().notNull(),
    code: text("code").notNull(),
    titleEn: text("title_en"),
    titleAr: text("title_ar"),
    courseId: uuid("course_id"),
    homeroomClassId: uuid("homeroom_class_id"),
    homeroomClassType: text("homeroom_class_type")
      .notNull()
      .generatedAlwaysAs(sql`'homeroom'`),
    subjectDescriptorId: uuid("subject_descriptor_id"),
    subjectNs: text("subject_ns")
      .notNull()
      .generatedAlwaysAs(sql`'subject'`),
    gradeLevelDescriptorId: uuid("grade_level_descriptor_id"),
    gradeLevelNs: text("grade_level_ns")
      .notNull()
      .generatedAlwaysAs(sql`'grade_level'`),
    locationId: uuid("location_id"),
    /** Empty for the one programme covering the class's grade level. */
    programmeId: uuid("programme_id"),
    /** Empty to grade on the programme's scale. */
    gradeScaleId: uuid("grade_scale_id"),
    /**
     * Ticks and chimes as children answer in lessons; a teacher turns them
     * off for a room full of tablets. Recorded and read words still play.
     */
    lessonSounds: boolean("lesson_sounds").notNull().default(true),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("classes", t.tenantId, t.id),
    uq("classes", t.tenantId, t.id, t.classType, t.schoolYearId, t.orgId),
    uq("classes", t.tenantId, t.id, t.classType, t.schoolYearId),
    ...baseConstraints("classes", t, tenants),
    fk(
      "classes",
      [t.tenantId, t.orgId, t.orgType],
      [orgs.tenantId, orgs.id, orgs.type],
    ),
    fk(
      "classes",
      [t.tenantId, t.schoolYearId, t.schoolYearType, t.schoolYearId, t.orgId],
      [
        academicSessions.tenantId,
        academicSessions.id,
        academicSessions.type,
        academicSessions.schoolYearId,
        academicSessions.orgId,
      ],
    ),
    fk(
      "classes",
      [t.tenantId, t.courseId, t.orgId],
      [courses.tenantId, courses.id, courses.orgId],
    ),
    fk(
      "classes",
      [t.tenantId, t.homeroomClassId, t.homeroomClassType, t.schoolYearId],
      [t.tenantId, t.id, t.classType, t.schoolYearId],
    ),
    fk(
      "classes",
      [t.tenantId, t.subjectDescriptorId, t.subjectNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "classes",
      [t.tenantId, t.gradeLevelDescriptorId, t.gradeLevelNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "classes",
      [t.tenantId, t.locationId],
      [locations.tenantId, locations.id],
    ),
    fk(
      "classes",
      [t.tenantId, t.programmeId],
      [programmes.tenantId, programmes.id],
    ),
    fk(
      "classes",
      [t.tenantId, t.gradeScaleId],
      [gradeScales.tenantId, gradeScales.id],
    ),
    ck("classes", "org_type", sql`org_type = 'school'`),
    ck("classes", "school_year_type", sql`school_year_type = 'school_year'`),
    ck("classes", "class_type", sql`class_type in ('homeroom', 'scheduled')`),
    ck("classes", "code", sql`code ~ '^[A-Za-z0-9_.-]{1,40}$'`),
    ck("classes", "title_en", sql`char_length(title_en) between 1 and 120`),
    ck("classes", "title_ar", sql`char_length(title_ar) between 1 and 120`),
    ck("classes", "title", sql`num_nonnulls(title_en, title_ar) >= 1`),
    ck(
      "classes",
      "shape",
      sql`(class_type = 'homeroom' and homeroom_class_id is null and subject_descriptor_id is null) or (class_type = 'scheduled' and course_id is not null and subject_descriptor_id is not null)`,
    ),
    uniqueIndex("classes_code_key")
      .on(t.tenantId, t.orgId, t.schoolYearId, t.code)
      .where(sql`status = 'active'`),
    index("classes_year_idx")
      .on(t.tenantId, t.orgId, t.schoolYearId, t.classType)
      .where(sql`status = 'active'`),
    index("classes_homeroom_idx")
      .on(t.tenantId, t.homeroomClassId)
      .where(sql`status = 'active' and homeroom_class_id is not null`),
    index("classes_delta_idx").on(t.tenantId, t.dateLastModified),
    ...entityProfile({ integration: true }),
  ],
);

/**
 * OneRoster enrollments: who is in a class, in which role, and when. Dated
 * inside the class's school year, so a transfer ends one row and starts
 * another instead of rewriting either.
 */
export const enrollments = core.table.withRLS(
  "enrollments",
  {
    ...tenantColumns(),
    classId: uuid("class_id").notNull(),
    classType: text("class_type").$type<ClassType>().notNull(),
    schoolYearId: uuid("school_year_id").notNull(),
    schoolYearType: text("school_year_type").notNull().default("school_year"),
    orgId: uuid("org_id").notNull(),
    userId: uuid("user_id").notNull(),
    role: text("role").$type<EnrollmentRole>().notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    classroomPositionDescriptorId: uuid("classroom_position_descriptor_id"),
    classroomPositionNs: text("classroom_position_ns")
      .notNull()
      .generatedAlwaysAs(sql`'classroom_position'`),
    validDuring: daterange("valid_during").notNull(),
    source: text("source")
      .$type<"manual" | "import" | "sis" | "oneroster" | "rollover">()
      .notNull(),
    importRunId: uuid("import_run_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("enrollments", t.tenantId, t.id),
    ...baseConstraints("enrollments", t, tenants),
    fk(
      "enrollments",
      [t.tenantId, t.classId, t.classType, t.schoolYearId, t.orgId],
      [
        classes.tenantId,
        classes.id,
        classes.classType,
        classes.schoolYearId,
        classes.orgId,
      ],
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
      "school_year_type",
      sql`school_year_type = 'school_year'`,
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
      sql`source in ('manual', 'import', 'sis', 'oneroster', 'rollover')`,
    ),
    ck("enrollments", "valid_during", range.bounded("valid_during")),
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
