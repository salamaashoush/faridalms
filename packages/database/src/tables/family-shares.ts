import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { index, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
import { submissionAttempts } from "./coursework";
import { users } from "./people";
import { tenants } from "./tenancy";

/**
 * A piece of handed-in work a teacher has shared with the student's family.
 * Families see only status and returned results otherwise; sharing is a
 * deliberate choice per piece, and can be taken back.
 */
export const familyShares = core.table.withRLS(
  "family_shares",
  {
    ...tenantColumns(),
    attemptId: uuid("attempt_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    sharedByUserId: uuid("shared_by_user_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("family_shares", t.tenantId, t.id),
    ...baseConstraints("family_shares", t, tenants),
    fk(
      "family_shares",
      [t.tenantId, t.attemptId],
      [submissionAttempts.tenantId, submissionAttempts.id],
    ),
    fk(
      "family_shares",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "family_shares",
      [t.tenantId, t.sharedByUserId],
      [users.tenantId, users.id],
    ),
    uniqueIndex("family_shares_key")
      .on(t.tenantId, t.attemptId)
      .where(sql`status = 'active'`),
    index("family_shares_student_idx")
      .on(t.tenantId, t.studentUserId)
      .where(sql`status = 'active'`),
    ...eraseAndDelete(
      sql`${erasureOf("student_user_id")} or ${erasureOf("shared_by_user_id")}`,
    ),
    ...entityProfile(),
  ],
);
