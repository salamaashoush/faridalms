import type { AuProgress, Cmi5LaunchMode } from "@faridalms/domain/cmi5";
import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { index, jsonb, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  eraseAndDelete,
  erasureOf,
  fk,
  instant,
  pk,
  tenantColumns,
} from "./conventions";
import { lessons } from "./learning";
import { users } from "./people";
import { orgs, tenants } from "./tenancy";

/**
 * A person's way through a course package placed in a lesson, cmi5's
 * registration: where each AU stands from the statements it sent, and
 * when the whole course was satisfied.
 */
export const cmi5Registrations = core.table.withRLS(
  "cmi5_registrations",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    lessonId: uuid("lesson_id").notNull(),
    packageId: uuid("package_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    progress: jsonb("progress")
      .$type<Record<string, AuProgress>>()
      .notNull()
      .default({}),
    satisfiedAt: instant("satisfied_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("cmi5_registrations", t.tenantId, t.id),
    ...baseConstraints("cmi5_registrations", t, tenants),
    fk("cmi5_registrations", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "cmi5_registrations",
      [t.tenantId, t.lessonId],
      [lessons.tenantId, lessons.id],
    ),
    fk(
      "cmi5_registrations",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "cmi5_registrations",
      "progress",
      sql`jsonb_typeof(progress) = 'object' and octet_length(progress::text) <= 65536`,
    ),
    uniqueIndex("cmi5_registrations_key")
      .on(t.tenantId, t.lessonId, t.packageId, t.studentUserId)
      .where(sql`status = 'active'`),
    index("cmi5_registrations_student_idx").on(t.tenantId, t.studentUserId),
    ...entityProfile(),
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);

/**
 * One launch of an AU, cmi5's session: the activity id and launch the
 * school gave it, the mode it was launched in, whether its fetch address
 * was used, the cmi5 verbs it has sent, and when it ended, by terminating
 * or by being abandoned.
 */
export const cmi5Sessions = core.table.withRLS(
  "cmi5_sessions",
  {
    ...tenantColumns(),
    registrationId: uuid("registration_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    auId: text("au_id").notNull(),
    activityId: text("activity_id").notNull(),
    launchMode: text("launch_mode")
      .$type<Cmi5LaunchMode>()
      .notNull()
      .default("Normal"),
    launchedAt: instant("launched_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    fetchedAt: instant("fetched_at"),
    lastAt: instant("last_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    verbs: jsonb("verbs").$type<string[]>().notNull().default([]),
    endedAt: instant("ended_at"),
    ending: text("ending"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("cmi5_sessions", t.tenantId, t.id),
    ...baseConstraints("cmi5_sessions", t, tenants),
    fk(
      "cmi5_sessions",
      [t.tenantId, t.registrationId],
      [cmi5Registrations.tenantId, cmi5Registrations.id],
    ),
    fk(
      "cmi5_sessions",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "cmi5_sessions",
      "ids",
      sql`char_length(au_id) between 1 and 500 and char_length(activity_id) between 1 and 2000`,
    ),
    ck(
      "cmi5_sessions",
      "launch_mode",
      sql`launch_mode in ('Normal', 'Browse', 'Review')`,
    ),
    ck(
      "cmi5_sessions",
      "verbs",
      sql`jsonb_typeof(verbs) = 'array' and jsonb_array_length(verbs) <= 20`,
    ),
    ck(
      "cmi5_sessions",
      "ending",
      sql`(ended_at is null) = (ending is null)
        and (ending is null or ending in ('terminated', 'abandoned'))`,
    ),
    index("cmi5_sessions_open_idx")
      .on(t.tenantId, t.registrationId, t.auId)
      .where(sql`status = 'active' and ended_at is null`),
    index("cmi5_sessions_student_idx").on(t.tenantId, t.studentUserId),
    ...entityProfile(),
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);

/**
 * A document an AU keeps through xAPI's State resource, such as where the
 * student got to, and the launch data the school writes before each
 * launch, which an AU only reads.
 */
export const cmi5States = core.table.withRLS(
  "cmi5_states",
  {
    ...tenantColumns(),
    registrationId: uuid("registration_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    activityId: text("activity_id").notNull(),
    stateId: text("state_id").notNull(),
    contentType: text("content_type").notNull(),
    body: text("body").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("cmi5_states", t.tenantId, t.id),
    ...baseConstraints("cmi5_states", t, tenants),
    fk(
      "cmi5_states",
      [t.tenantId, t.registrationId],
      [cmi5Registrations.tenantId, cmi5Registrations.id],
    ),
    fk(
      "cmi5_states",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "cmi5_states",
      "fields",
      sql`char_length(activity_id) between 1 and 2000 and char_length(state_id) between 1 and 500
        and char_length(content_type) between 1 and 200 and octet_length(body) <= 65536`,
    ),
    uniqueIndex("cmi5_states_key")
      .on(t.tenantId, t.registrationId, t.activityId, t.stateId)
      .where(sql`status = 'active'`),
    index("cmi5_states_student_idx").on(t.tenantId, t.studentUserId),
    ...entityProfile(),
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);
