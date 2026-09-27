import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { index, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  fk,
  instant,
  pk,
  tenantColumns,
  uq,
} from "./conventions";
import { users } from "./people";
import { orgs, tenants } from "./tenancy";

export type ThreadKind = "direct" | "group" | "family";
export type ThreadRole = "owner" | "member";

/**
 * A conversation. `family` threads are one staff member with a child's
 * guardians, about that child; `direct` is two people; `group` is several
 * people a staff member gathered, and can gain or lose members.
 */
export const messageThreads = core.table.withRLS(
  "message_threads",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    kind: text("kind").$type<ThreadKind>().notNull(),
    subject: text("subject"),
    studentUserId: uuid("student_user_id"),
    createdByUserId: uuid("created_by_user_id").notNull(),
    lastMessageAt: instant("last_message_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("message_threads", t.tenantId, t.id),
    ...baseConstraints("message_threads", t, tenants),
    fk("message_threads", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "message_threads",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "message_threads",
      [t.tenantId, t.createdByUserId],
      [users.tenantId, users.id],
    ),
    ck("message_threads", "kind", sql`kind in ('direct', 'group', 'family')`),
    ck(
      "message_threads",
      "subject",
      sql`char_length(subject) between 1 and 200`,
    ),
    ck(
      "message_threads",
      "student",
      sql`(kind = 'family') = (student_user_id is not null)`,
    ),
    index("message_threads_org_idx")
      .on(t.tenantId, t.orgId, t.lastMessageAt)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * Who is in a thread and how far they have read. A member who leaves keeps
 * the row with `left_at`, so what they wrote still names them.
 */
export const threadMembers = core.table.withRLS(
  "thread_members",
  {
    ...tenantColumns(),
    threadId: uuid("thread_id").notNull(),
    userId: uuid("user_id").notNull(),
    role: text("role").$type<ThreadRole>().notNull().default("member"),
    joinedAt: instant("joined_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    leftAt: instant("left_at"),
    lastReadAt: instant("last_read_at"),
    draft: text("draft"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("thread_members", t.tenantId, t.id),
    ...baseConstraints("thread_members", t, tenants),
    fk(
      "thread_members",
      [t.tenantId, t.threadId],
      [messageThreads.tenantId, messageThreads.id],
    ),
    fk("thread_members", [t.tenantId, t.userId], [users.tenantId, users.id]),
    ck("thread_members", "role", sql`role in ('owner', 'member')`),
    ck("thread_members", "draft", sql`char_length(draft) <= 5000`),
    ck(
      "thread_members",
      "left_at",
      sql`left_at is null or left_at >= joined_at`,
    ),
    uniqueIndex("thread_members_key")
      .on(t.tenantId, t.threadId, t.userId)
      .where(sql`status = 'active' and left_at is null`),
    index("thread_members_user_idx")
      .on(t.tenantId, t.userId)
      .where(sql`status = 'active' and left_at is null`),
    ...entityProfile(),
  ],
);

export const messages = core.table.withRLS(
  "messages",
  {
    ...tenantColumns(),
    threadId: uuid("thread_id").notNull(),
    authorUserId: uuid("author_user_id").notNull(),
    body: text("body").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("messages", t.tenantId, t.id),
    uq("messages", t.tenantId, t.id, t.threadId),
    ...baseConstraints("messages", t, tenants),
    fk(
      "messages",
      [t.tenantId, t.threadId],
      [messageThreads.tenantId, messageThreads.id],
    ),
    fk("messages", [t.tenantId, t.authorUserId], [users.tenantId, users.id]),
    ck("messages", "body", sql`char_length(body) between 1 and 5000`),
    index("messages_thread_idx")
      .on(t.tenantId, t.threadId, t.createdAt)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
