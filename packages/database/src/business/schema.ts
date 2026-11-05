import type { OperatorRole } from "@faridalms/domain/operators";

import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const instant = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () =>
  instant("created_at")
    .notNull()
    .default(sql`statement_timestamp()`);

/**
 * The company's own people who run the console, by the opaque id the
 * console derives from their identity provider. The first to sign in when
 * none exists is the owner; anyone after holds no role until an owner gives
 * them one.
 */
export const operators = pgTable(
  "operators",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email"),
    roles: text("roles").$type<OperatorRole>().array().notNull(),
    state: text("state")
      .$type<"active" | "disabled">()
      .notNull()
      .default("active"),
    createdAt: createdAt(),
    lastSignedInAt: instant("last_signed_in_at"),
  },
  () => [
    check(
      "operators_roles_check",
      sql`cardinality(roles) <= 4 and roles <@ array['owner', 'sales', 'support', 'finance']::text[]`,
    ),
    check("operators_state_check", sql`state in ('active', 'disabled')`),
    check("operators_name_check", sql`char_length(name) between 1 and 200`),
  ],
);

/**
 * Every business action, appended and never changed: who, what, on which
 * record, the record before and after, and why.
 */
export const businessEvents = pgTable(
  "business_events",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuidv7()`),
    occurredAt: instant("occurred_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    operatorId: text("operator_id").notNull(),
    action: text("action").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason"),
  },
  (t) => [
    check("business_events_action_check", sql`action ~ '^[a-z_]+\\.[a-z_]+$'`),
    check(
      "business_events_reason_check",
      sql`reason is null or char_length(reason) between 1 and 500`,
    ),
    index("business_events_subject_idx").on(t.subjectType, t.subjectId),
    index("business_events_occurred_idx").on(t.occurredAt),
  ],
);
