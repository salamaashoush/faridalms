import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
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
import { descriptors } from "./descriptors";
import { users } from "./people";
import { classes } from "./teaching";
import { orgs, tenants } from "./tenancy";

export type Urgency = "normal" | "important" | "urgent";
export type AnnouncementState =
  | "draft"
  | "scheduled"
  | "published"
  | "archived";
export type AudienceScope =
  | "school"
  | "staff"
  | "families"
  | "students"
  | "class"
  | "grade";

/**
 * A broadcast from the school. Its body is the document hosted as
 * `announcement`; who receives it is fixed when it goes out, so the delivery
 * report counts the people it reached.
 */
export const announcements = core.table.withRLS(
  "announcements",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    title: text("title").notNull(),
    urgency: text("urgency").$type<Urgency>().notNull().default("normal"),
    state: text("state").$type<AnnouncementState>().notNull().default("draft"),
    publishAt: instant("publish_at"),
    pinnedUntil: date("pinned_until", { mode: "string" }),
    expiresOn: date("expires_on", { mode: "string" }),
    requiresAck: boolean("requires_ack").notNull().default(false),
    ackDueOn: date("ack_due_on", { mode: "string" }),
    authorUserId: uuid("author_user_id").notNull(),
    /** The last time an edit was sent to recipients again rather than made quietly. */
    updateSentAt: instant("update_sent_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("announcements", t.tenantId, t.id),
    ...baseConstraints("announcements", t, tenants),
    fk("announcements", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "announcements",
      [t.tenantId, t.authorUserId],
      [users.tenantId, users.id],
    ),
    ck("announcements", "title", sql`char_length(title) between 1 and 200`),
    ck(
      "announcements",
      "urgency",
      sql`urgency in ('normal', 'important', 'urgent')`,
    ),
    ck(
      "announcements",
      "state",
      sql`state in ('draft', 'scheduled', 'published', 'archived')`,
    ),
    ck(
      "announcements",
      "publish_at",
      sql`(state in ('scheduled', 'published', 'archived')) = (publish_at is not null)`,
    ),
    ck("announcements", "ack_due_on", sql`ack_due_on is null or requires_ack`),
    index("announcements_org_idx")
      .on(t.tenantId, t.orgId, t.publishAt)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

export const announcementAudiences = core.table.withRLS(
  "announcement_audiences",
  {
    ...tenantColumns(),
    announcementId: uuid("announcement_id").notNull(),
    scope: text("scope").$type<AudienceScope>().notNull(),
    classId: uuid("class_id"),
    gradeDescriptorId: uuid("grade_descriptor_id"),
    gradeNs: text("grade_ns").notNull().default("grade_level"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("announcement_audiences", t.tenantId, t.id),
    ...baseConstraints("announcement_audiences", t, tenants),
    fk(
      "announcement_audiences",
      [t.tenantId, t.announcementId],
      [announcements.tenantId, announcements.id],
    ),
    fk(
      "announcement_audiences",
      [t.tenantId, t.classId],
      [classes.tenantId, classes.id],
    ),
    fk(
      "announcement_audiences",
      [t.tenantId, t.gradeDescriptorId, t.gradeNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    ck(
      "announcement_audiences",
      "scope",
      sql`scope in ('school', 'staff', 'families', 'students', 'class', 'grade')`,
    ),
    ck("announcement_audiences", "grade_ns", sql`grade_ns = 'grade_level'`),
    ck(
      "announcement_audiences",
      "target",
      sql`(scope = 'class') = (class_id is not null) and (scope = 'grade') = (grade_descriptor_id is not null)`,
    ),
    index("announcement_audiences_announcement_idx")
      .on(t.tenantId, t.announcementId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/** Who an announcement reached, and when they read and acknowledged it. */
export const announcementRecipients = core.table.withRLS(
  "announcement_recipients",
  {
    ...tenantColumns(),
    announcementId: uuid("announcement_id").notNull(),
    userId: uuid("user_id").notNull(),
    readAt: instant("read_at"),
    acknowledgedAt: instant("acknowledged_at"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("announcement_recipients", t.tenantId, t.id),
    ...baseConstraints("announcement_recipients", t, tenants),
    fk(
      "announcement_recipients",
      [t.tenantId, t.announcementId],
      [announcements.tenantId, announcements.id],
    ),
    fk(
      "announcement_recipients",
      [t.tenantId, t.userId],
      [users.tenantId, users.id],
    ),
    uniqueIndex("announcement_recipients_key")
      .on(t.tenantId, t.announcementId, t.userId)
      .where(sql`status = 'active'`),
    index("announcement_recipients_user_idx")
      .on(t.tenantId, t.userId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
