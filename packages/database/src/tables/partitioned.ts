import type { AttendanceMeaning } from "@faridalms/domain/attendance";

/**
 * Tables drizzle-kit cannot create: partitioned tables and the search index.
 * Their DDL lives only in custom migrations; these declarations give queries
 * their types. `drizzle.config.ts` does not list this module.
 */
import { sql } from "drizzle-orm";
import {
  bytea,
  date,
  integer,
  jsonb,
  pgSchema,
  smallint,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import { audit, core, instant, tsvector } from "./conventions";

export type ActorKind =
  | "user"
  | "system"
  | "integration"
  | "import"
  | "operator";

export const auditLog = audit.table("log", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id")
    .notNull()
    .default(sql`uuidv7()`),
  occurredAt: instant("occurred_at").notNull(),
  actorKind: text("actor_kind").$type<ActorKind>().notNull(),
  actorUserId: uuid("actor_user_id"),
  sessionId: uuid("session_id"),
  action: text("action").notNull(),
  outcome: text("outcome")
    .$type<"success" | "denied" | "failed">()
    .notNull()
    .default("success"),
  objectType: text("object_type").notNull(),
  objectId: uuid("object_id"),
  orgId: uuid("org_id"),
  subjectUserId: uuid("subject_user_id"),
  studentUserId: uuid("student_user_id"),
  requestId: text("request_id"),
  details: jsonb("details")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'`),
  payloadDigest: bytea("payload_digest"),
  rowHash: bytea("row_hash").notNull(),
});

export const auditPayloads = audit.table("payloads", {
  tenantId: uuid("tenant_id").notNull(),
  eventId: uuid("event_id").notNull(),
  occurredAt: instant("occurred_at").notNull(),
  subjectUserId: uuid("subject_user_id"),
  salt: bytea("salt").notNull(),
  before: jsonb("before").$type<Record<string, unknown> | null>(),
  after: jsonb("after").$type<Record<string, unknown> | null>(),
});

export const activityEvents = core.table("activity_events", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id")
    .notNull()
    .default(sql`uuidv7()`),
  occurredAt: instant("occurred_at")
    .notNull()
    .default(sql`statement_timestamp()`),
  actorUserId: uuid("actor_user_id").notNull(),
  verb: text("verb").notNull(),
  objectType: text("object_type").notNull(),
  objectId: uuid("object_id").notNull(),
  orgId: uuid("org_id"),
  contextType: text("context_type"),
  contextId: uuid("context_id"),
  sessionId: uuid("session_id"),
  result: jsonb("result").$type<Record<string, unknown>>(),
});

/**
 * Ed-Fi's student section attendance event: one student's mark in one
 * register, partitioned by the day it was taken.
 */
export const attendanceEvents = core.table("attendance_events", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id")
    .notNull()
    .default(sql`uuidv7()`),
  takenOn: date("taken_on", { mode: "string" }).notNull(),
  registerId: uuid("register_id").notNull(),
  studentUserId: uuid("student_user_id").notNull(),
  categoryDescriptorId: uuid("category_descriptor_id").notNull(),
  categoryMeaning: text("category_meaning")
    .$type<AttendanceMeaning>()
    .notNull(),
  reasonDescriptorId: uuid("reason_descriptor_id"),
  minutes: smallint("minutes"),
  note: text("note"),
  recordedByUserId: uuid("recorded_by_user_id").notNull(),
  status: text("status").notNull().default("active"),
  dateLastModified: instant("date_last_modified")
    .notNull()
    .default(sql`statement_timestamp()`),
  version: integer("version").notNull().default(1),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'`),
  createdAt: instant("created_at")
    .notNull()
    .default(sql`statement_timestamp()`),
});

const search = pgSchema("search").existing();

export const searchEntries = search.table("entries", {
  tenantId: uuid("tenant_id").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  resultType: text("result_type").notNull(),
  resultId: uuid("result_id").notNull(),
  orgIds: uuid("org_ids").array().notNull(),
  nameNorm: text("name_norm"),
  textVector: tsvector("text_vector"),
});
