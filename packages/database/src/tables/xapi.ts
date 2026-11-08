import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  baseConstraints,
  ck,
  core,
  deleteExpired,
  entityColumns,
  entityProfile,
  eraseAndDelete,
  erasureOf,
  fk,
  instant,
  pk,
  tenantColumns,
} from "./conventions";
import { users } from "./people";
import { orgs, tenants } from "./tenancy";

/**
 * A school's own learning record store, which its learning is sent to as
 * xAPI statements as it happens: the store's address, the key it gave the
 * school and its secret, kept sealed, and whether sending is on.
 */
export const xapiStores = core.table.withRLS(
  "xapi_stores",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    endpoint: text("endpoint").notNull(),
    username: text("username").notNull(),
    sealedSecret: text("sealed_secret"),
    enabled: boolean("enabled").notNull().default(false),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("xapi_stores", t.tenantId, t.id),
    ...baseConstraints("xapi_stores", t, tenants),
    fk("xapi_stores", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck(
      "xapi_stores",
      "endpoint",
      sql`endpoint like 'https://%/' and char_length(endpoint) <= 500`,
    ),
    ck("xapi_stores", "username", sql`char_length(username) between 1 and 200`),
    ck(
      "xapi_stores",
      "sealed_secret",
      sql`char_length(coalesce(sealed_secret, '')) <= 2000`,
    ),
    ck("xapi_stores", "enabled", sql`not enabled or sealed_secret is not null`),
    uniqueIndex("xapi_stores_org_key")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

export type XapiSendState = "queued" | "sending" | "sent" | "failed";

/**
 * A statement waiting to go to a school's record store, or gone: queued as
 * the learning happens, taken by the sender for a while, and kept once sent
 * without its body until the purge deletes it. One the store refused, or
 * that kept failing, stays failed with the store's reason. A student's
 * statements go when they are erased.
 */
export const xapiStatements = core.table.withRLS(
  "xapi_statements",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    statementId: uuid("statement_id").notNull(),
    studentUserId: uuid("student_user_id").notNull(),
    statement: jsonb("statement").$type<Record<string, unknown>>(),
    state: text("state").$type<XapiSendState>().notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    dueAt: instant("due_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    leasedUntil: instant("leased_until"),
    sentAt: instant("sent_at"),
    error: text("error"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("xapi_statements", t.tenantId, t.id),
    ...baseConstraints("xapi_statements", t, tenants),
    fk("xapi_statements", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "xapi_statements",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "xapi_statements",
      "state",
      sql`state in ('queued', 'sending', 'sent', 'failed')`,
    ),
    ck("xapi_statements", "attempts", sql`attempts between 0 and 20`),
    ck("xapi_statements", "error", sql`char_length(error) <= 500`),
    ck(
      "xapi_statements",
      "statement",
      sql`(state = 'sent' or statement is not null)
        and (statement is null or (jsonb_typeof(statement) = 'object' and octet_length(statement::text) <= 65536))`,
    ),
    ck(
      "xapi_statements",
      "lease",
      sql`(state = 'sending') = (leased_until is not null)`,
    ),
    ck(
      "xapi_statements",
      "sent",
      sql`(state = 'sent') = (sent_at is not null)`,
    ),
    uniqueIndex("xapi_statements_key")
      .on(t.tenantId, t.orgId, t.statementId)
      .where(sql`status = 'active'`),
    index("xapi_statements_queue_idx")
      .on(t.tenantId, t.dueAt)
      .where(sql`status = 'active' and state in ('queued', 'sending')`),
    index("xapi_statements_student_idx").on(t.tenantId, t.studentUserId),
    index("xapi_statements_sent_idx")
      .on(t.tenantId, t.sentAt)
      .where(sql`state = 'sent'`),
    ...entityProfile(),
    ...eraseAndDelete(erasureOf("student_user_id")),
    // SENT_STATEMENT_DAYS in the domain; the store never asks for less.
    ...deleteExpired(
      sql`state = 'sent' and sent_at < statement_timestamp() - interval '30 days'`,
    ),
  ],
);
