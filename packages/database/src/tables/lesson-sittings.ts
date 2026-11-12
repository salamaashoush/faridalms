import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import {
  baseConstraints,
  core,
  entityColumns,
  entityProfile,
  eraseAndDelete,
  erasureOf,
  fk,
  pk,
  tenantColumns,
} from "./conventions";
import { lessons } from "./learning";
import { standardSittings } from "./standards";
import { tenants } from "./tenancy";

/** The lesson a student's sitting is: one sitting a lesson and student. */
export const lessonSittings = core.table.withRLS(
  "lesson_sittings",
  {
    ...tenantColumns(),
    sittingId: uuid("sitting_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    kind: text("kind")
      .notNull()
      .generatedAlwaysAs(sql`'lesson'`),
    lessonId: uuid("lesson_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("lesson_sittings", t.tenantId, t.id),
    ...baseConstraints("lesson_sittings", t, tenants),
    fk(
      "lesson_sittings",
      [t.tenantId, t.sittingId, t.studentUserId, t.kind],
      [
        standardSittings.tenantId,
        standardSittings.id,
        standardSittings.studentUserId,
        standardSittings.kind,
      ],
    ),
    fk(
      "lesson_sittings",
      [t.tenantId, t.lessonId],
      [lessons.tenantId, lessons.id],
    ),
    uniqueIndex("lesson_sittings_sitting_key")
      .on(t.tenantId, t.sittingId)
      .where(sql`status = 'active'`),
    uniqueIndex("lesson_sittings_key")
      .on(t.tenantId, t.lessonId, t.studentUserId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);
