import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

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
import { users } from "./people";
import { orgs, tenants } from "./tenancy";

/**
 * Whether a school lets its teachers ask a language model for help with
 * what they write, which provider it chose, and how many requests a day it
 * allows. Off until the school turns it on; the provider's key belongs to
 * the deployment and is never kept here.
 */
export const assistantSettings = core.table.withRLS(
  "assistant_settings",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    provider: text("provider").notNull(),
    dailyLimit: integer("daily_limit").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("assistant_settings", t.tenantId, t.id),
    ...baseConstraints("assistant_settings", t, tenants),
    fk("assistant_settings", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck("assistant_settings", "provider", sql`provider in ('anthropic')`),
    ck(
      "assistant_settings",
      "daily_limit",
      sql`daily_limit between 1 and 10000`,
    ),
    uniqueIndex("assistant_settings_org_key")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * One request a teacher sent to the school's language model: who, for
 * which record, what kind, how much was sent and came back, through which
 * model, and how it ended. The words themselves are never kept. The day is
 * the school's, which its daily limit counts by.
 */
export const assistantRequests = core.table.withRLS(
  "assistant_requests",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    userId: uuid("user_id").notNull(),
    task: text("task").notNull(),
    hostType: text("host_type").notNull(),
    hostId: uuid("host_id").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    sentCharacters: integer("sent_characters").notNull(),
    receivedCharacters: integer("received_characters").notNull().default(0),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    outcome: text("outcome").notNull().default("running"),
    finishedAt: instant("finished_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("assistant_requests", t.tenantId, t.id),
    ...baseConstraints("assistant_requests", t, tenants),
    fk("assistant_requests", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "assistant_requests",
      [t.tenantId, t.userId],
      [users.tenantId, users.id],
    ),
    ck(
      "assistant_requests",
      "task",
      sql`task in ('questions', 'level', 'translate')`,
    ),
    ck(
      "assistant_requests",
      "host_type",
      sql`host_type in ('lesson', 'assignment')`,
    ),
    ck("assistant_requests", "provider", sql`provider in ('anthropic')`),
    ck(
      "assistant_requests",
      "model",
      sql`char_length(model) between 1 and 100`,
    ),
    ck(
      "assistant_requests",
      "counts",
      sql`sent_characters >= 0 and received_characters >= 0
        and coalesce(input_tokens, 0) >= 0 and coalesce(output_tokens, 0) >= 0`,
    ),
    ck(
      "assistant_requests",
      "outcome",
      sql`outcome in ('running', 'done', 'failed', 'cancelled')
        and (outcome = 'running') = (finished_at is null)`,
    ),
    index("assistant_requests_day_idx").on(t.tenantId, t.orgId, t.day),
    index("assistant_requests_host_idx").on(t.tenantId, t.hostType, t.hostId),
    ...entityProfile(),
  ],
);
