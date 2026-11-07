import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { index, jsonb, text, uuid } from "drizzle-orm/pg-core";

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
} from "./conventions";
import { documents } from "./documents";
import { users } from "./people";
import { tenants } from "./tenancy";

/**
 * A conversation among the people who write a document, about a passage of
 * it or a whole block. It points into the document by block id and offset
 * and is never part of it, so readers, prints, exports and versions never
 * carry it. `part` names which of the page's editors it belongs to, such as
 * a translation beside the original. The quote is the passage as it read
 * when the thread began, so a thread whose words were deleted still says
 * what it was about.
 */
export const documentThreads = core.table.withRLS(
  "document_threads",
  {
    ...tenantColumns(),
    documentId: uuid("document_id").notNull(),
    part: text("part").notNull().default("body"),
    anchor: jsonb("anchor").$type<Record<string, unknown>>().notNull(),
    quote: text("quote").notNull().default(""),
    authorUserId: uuid("author_user_id").notNull(),
    resolvedAt: instant("resolved_at"),
    resolvedByUserId: uuid("resolved_by_user_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("document_threads", t.tenantId, t.id),
    ...baseConstraints("document_threads", t, tenants),
    fk(
      "document_threads",
      [t.tenantId, t.documentId],
      [documents.tenantId, documents.id],
    ),
    fk(
      "document_threads",
      [t.tenantId, t.authorUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "document_threads",
      [t.tenantId, t.resolvedByUserId],
      [users.tenantId, users.id],
    ),
    ck("document_threads", "part", sql`part ~ '^[a-z][a-z0-9_-]{0,39}$'`),
    ck("document_threads", "anchor", sql`jsonb_typeof(anchor) = 'object'`),
    ck("document_threads", "quote", sql`char_length(quote) <= 280`),
    ck(
      "document_threads",
      "resolved",
      sql`(resolved_at is null) = (resolved_by_user_id is null)`,
    ),
    index("document_threads_document_idx")
      .on(t.tenantId, t.documentId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * One comment in a thread, the first starting it. The people it mentions
 * are told once, when it is written or when an edit first names them.
 */
export const documentComments = core.table.withRLS(
  "document_comments",
  {
    ...tenantColumns(),
    threadId: uuid("thread_id").notNull(),
    authorUserId: uuid("author_user_id").notNull(),
    body: text("body").notNull(),
    mentionedUserIds: uuid("mentioned_user_ids")
      .array()
      .notNull()
      .default(sql`'{}'`),
    editedAt: instant("edited_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("document_comments", t.tenantId, t.id),
    ...baseConstraints("document_comments", t, tenants),
    fk(
      "document_comments",
      [t.tenantId, t.threadId],
      [documentThreads.tenantId, documentThreads.id],
    ),
    fk(
      "document_comments",
      [t.tenantId, t.authorUserId],
      [users.tenantId, users.id],
    ),
    ck("document_comments", "body", sql`char_length(body) between 1 and 2000`),
    ck(
      "document_comments",
      "mentions",
      sql`cardinality(mentioned_user_ids) <= 10`,
    ),
    index("document_comments_thread_idx")
      .on(t.tenantId, t.threadId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
