import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import { boolean, date, index, text, time, uuid } from "drizzle-orm/pg-core";

import type { AudienceScope } from "./announcements";

import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  fk,
  pk,
  tenantColumns,
} from "./conventions";
import { descriptors } from "./descriptors";
import { users } from "./people";
import { classes } from "./teaching";
import { orgs, tenants } from "./tenancy";

export type EventCategory =
  | "general"
  | "meeting"
  | "trip"
  | "performance"
  | "sport"
  | "exam"
  | "celebration";

/**
 * Something people attend: a trip, a parents' evening, a match. Days the
 * school is closed are the school calendar's `calendar_dates`, not events.
 * Dates and times are the school's wall clock, so an event keeps its hour
 * across a daylight-saving change. Its description is the document hosted as
 * `calendar_event`.
 */
export const calendarEvents = core.table.withRLS(
  "calendar_events",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    title: text("title").notNull(),
    category: text("category").$type<EventCategory>().notNull(),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    endsOn: date("ends_on", { mode: "string" }).notNull(),
    /** Both empty for an all-day event. */
    startTime: time("start_time"),
    endTime: time("end_time"),
    location: text("location"),
    /** The date is not confirmed yet; shown as "to be confirmed". */
    provisional: boolean("provisional").notNull().default(false),
    cancelled: boolean("cancelled").notNull().default(false),
    authorUserId: uuid("author_user_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("calendar_events", t.tenantId, t.id),
    ...baseConstraints("calendar_events", t, tenants),
    fk("calendar_events", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "calendar_events",
      [t.tenantId, t.authorUserId],
      [users.tenantId, users.id],
    ),
    ck("calendar_events", "title", sql`char_length(title) between 1 and 200`),
    ck(
      "calendar_events",
      "category",
      sql`category in ('general', 'meeting', 'trip', 'performance', 'sport', 'exam', 'celebration')`,
    ),
    ck(
      "calendar_events",
      "location",
      sql`location is null or char_length(location) between 1 and 200`,
    ),
    ck("calendar_events", "ends_on", sql`ends_on >= starts_on`),
    ck(
      "calendar_events",
      "times",
      sql`(start_time is null) = (end_time is null)
        and (start_time is null or ends_on > starts_on or end_time > start_time)`,
    ),
    index("calendar_events_org_idx")
      .on(t.tenantId, t.orgId, t.startsOn, t.endsOn)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

export const calendarEventAudiences = core.table.withRLS(
  "calendar_event_audiences",
  {
    ...tenantColumns(),
    eventId: uuid("event_id").notNull(),
    scope: text("scope").$type<AudienceScope>().notNull(),
    classId: uuid("class_id"),
    gradeDescriptorId: uuid("grade_descriptor_id"),
    gradeNs: text("grade_ns").notNull().default("grade_level"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("calendar_event_audiences", t.tenantId, t.id),
    ...baseConstraints("calendar_event_audiences", t, tenants),
    fk(
      "calendar_event_audiences",
      [t.tenantId, t.eventId],
      [calendarEvents.tenantId, calendarEvents.id],
    ),
    fk(
      "calendar_event_audiences",
      [t.tenantId, t.classId],
      [classes.tenantId, classes.id],
    ),
    fk(
      "calendar_event_audiences",
      [t.tenantId, t.gradeDescriptorId, t.gradeNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    ck(
      "calendar_event_audiences",
      "scope",
      sql`scope in ('school', 'staff', 'families', 'students', 'class', 'grade')`,
    ),
    ck("calendar_event_audiences", "grade_ns", sql`grade_ns = 'grade_level'`),
    ck(
      "calendar_event_audiences",
      "target",
      sql`(scope = 'class') = (class_id is not null) and (scope = 'grade') = (grade_descriptor_id is not null)`,
    ),
    index("calendar_event_audiences_event_idx")
      .on(t.tenantId, t.eventId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
