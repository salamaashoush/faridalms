import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { uniqueIndex, uuid } from "drizzle-orm/pg-core";

import {
  baseConstraints,
  core,
  entityColumns,
  entityProfile,
  fk,
  pk,
  tenantColumns,
} from "./conventions";
import { assignments } from "./coursework";
import { learningModules } from "./learning";
import { tenants } from "./tenancy";

/**
 * A discussion a teacher put in a module, beside its lessons. A module's
 * discussion is one discussion across every class the module is set for: a
 * part per class, each an assignment of that class, sharing `discussion_group`,
 * the id of the part made first. The part's class and status follow the
 * assignment, so the link stays true while e-learning is off.
 */
export const moduleDiscussions = core.table.withRLS(
  "module_discussions",
  {
    ...tenantColumns(),
    assignmentId: uuid("assignment_id").notNull(),
    classId: uuid("class_id").notNull(),
    moduleId: uuid("module_id").notNull(),
    discussionGroup: uuid("discussion_group").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("module_discussions", t.tenantId, t.id),
    ...baseConstraints("module_discussions", t, tenants),
    fk(
      "module_discussions",
      [t.tenantId, t.assignmentId, t.classId, t.status],
      [
        assignments.tenantId,
        assignments.id,
        assignments.classId,
        assignments.status,
      ],
    ).onUpdate("cascade"),
    fk(
      "module_discussions",
      [t.tenantId, t.moduleId],
      [learningModules.tenantId, learningModules.id],
    ),
    uniqueIndex("module_discussions_assignment_key")
      .on(t.tenantId, t.assignmentId)
      .where(sql`status = 'active'`),
    uniqueIndex("module_discussions_class_key")
      .on(t.tenantId, t.discussionGroup, t.classId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
