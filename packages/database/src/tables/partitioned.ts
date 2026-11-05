import type { AttendanceMeaning } from "@faridalms/domain/attendance";

/**
 * Tables drizzle-kit cannot create: partitioned tables and the search index.
 * Their DDL lives only in custom migrations; these declarations give queries
 * their types. The drizzle-kit config does not list this module.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
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

export type NotificationKind =
  | "announcement"
  | "urgent"
  | "news"
  | "message"
  | "absence"
  | "event"
  | "reminder"
  | "consent"
  | "mention"
  | "library"
  | "reply"
  | "enquiry"
  | "application"
  | "assignment"
  | "feedback"
  | "grades"
  | "correction"
  | "reenrolment";
export type DeliveryChannel = "email" | "sms";
export type DeliveryState = "pending" | "sent" | "failed" | "skipped";
export type DeliveryReason =
  | "preference_off"
  | "no_address"
  | "unreachable"
  | "no_provider"
  | "withdrawn"
  | "provider_error"
  | "gave_up";

export const notifications = core.table("notifications", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id")
    .notNull()
    .default(sql`uuidv7()`),
  createdAt: instant("created_at")
    .notNull()
    .default(sql`statement_timestamp()`),
  userId: uuid("user_id").notNull(),
  orgId: uuid("org_id").notNull(),
  kind: text("kind").$type<NotificationKind>().notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  actorUserId: uuid("actor_user_id"),
  params: jsonb("params")
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'`),
  needsAction: boolean("needs_action").notNull().default(false),
  readAt: instant("read_at"),
  actedAt: instant("acted_at"),
  status: text("status").notNull().default("active"),
});

export const notificationDeliveries = core.table("notification_deliveries", {
  tenantId: uuid("tenant_id").notNull(),
  id: uuid("id")
    .notNull()
    .default(sql`uuidv7()`),
  createdAt: instant("created_at")
    .notNull()
    .default(sql`statement_timestamp()`),
  // A delivery tells a person about a notification, or carries a message of
  // a conversation to an outside contact, who has no notifications.
  notificationId: uuid("notification_id"),
  notificationCreatedAt: instant("notification_created_at"),
  userId: uuid("user_id"),
  contactId: uuid("contact_id"),
  messageId: uuid("message_id"),
  // Or it is a sign-in link the school emailed, sent at once and logged.
  linkPurpose: text("link_purpose").$type<"invite" | "reset">(),
  orgId: uuid("org_id"),
  channel: text("channel").$type<DeliveryChannel>().notNull(),
  address: text("address"),
  locale: text("locale").$type<"ar" | "en">().notNull(),
  state: text("state").$type<DeliveryState>().notNull(),
  reason: text("reason").$type<DeliveryReason>(),
  dueAt: instant("due_at").notNull(),
  attempts: smallint("attempts").notNull().default(0),
  lastError: text("last_error"),
  receipt: text("receipt"),
  sentAt: instant("sent_at"),
  status: text("status").notNull().default("active"),
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
