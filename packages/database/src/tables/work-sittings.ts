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
import { submissions } from "./coursework";
import { standardSittings } from "./standards";
import { tenants } from "./tenancy";

/** The work a student handed in that a sitting is: one sitting a submission. */
export const workSittings = core.table.withRLS(
  "work_sittings",
  {
    ...tenantColumns(),
    sittingId: uuid("sitting_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    kind: text("kind")
      .notNull()
      .generatedAlwaysAs(sql`'work'`),
    submissionId: uuid("submission_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("work_sittings", t.tenantId, t.id),
    ...baseConstraints("work_sittings", t, tenants),
    fk(
      "work_sittings",
      [t.tenantId, t.sittingId, t.studentUserId, t.kind],
      [
        standardSittings.tenantId,
        standardSittings.id,
        standardSittings.studentUserId,
        standardSittings.kind,
      ],
    ),
    // The work is the same student's as the sitting.
    fk(
      "work_sittings",
      [t.tenantId, t.submissionId, t.studentUserId],
      [submissions.tenantId, submissions.id, submissions.studentUserId],
    ),
    uniqueIndex("work_sittings_sitting_key")
      .on(t.tenantId, t.sittingId)
      .where(sql`status = 'active'`),
    uniqueIndex("work_sittings_key")
      .on(t.tenantId, t.submissionId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    ...eraseAndDelete(erasureOf("student_user_id")),
  ],
);
