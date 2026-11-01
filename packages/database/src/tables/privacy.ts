import type {
  BreachLaw,
  BreachRisk,
  RequestKind,
  RequestLaw,
  RequestOutcome,
  RequestRelation,
  RequestTopic,
  StudentRetention,
} from "@faridalms/domain/privacy";
import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  smallint,
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
 * How long a school keeps the records of people who have left. A school
 * without a row, or with a rule left empty, is never asked to destroy them.
 */
export const retentionSettings = core.table.withRLS(
  "retention_settings",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    studentRule: text("student_rule").$type<StudentRetention>(),
    studentValue: smallint("student_value"),
    staffYears: smallint("staff_years"),
    applicantMonths: smallint("applicant_months"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("retention_settings", t.tenantId, t.id),
    ...baseConstraints("retention_settings", t, tenants),
    fk("retention_settings", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck(
      "retention_settings",
      "student_rule",
      sql`student_rule in ('years_after_leaving', 'until_age')`,
    ),
    ck(
      "retention_settings",
      "student_value",
      sql`(student_rule is null) = (student_value is null) and (student_rule <> 'years_after_leaving' or student_value between 1 and 100) and (student_rule <> 'until_age' or student_value between 18 and 100)`,
    ),
    ck("retention_settings", "staff_years", sql`staff_years between 1 and 100`),
    ck(
      "retention_settings",
      "applicant_months",
      sql`applicant_months between 1 and 120`,
    ),
    uniqueIndex("retention_settings_org_key")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * A request about a person's records: to see them, correct them, erase them
 * or object to their use, with the deadline its law sets. While it is open
 * nothing about the person may be erased.
 */
export const recordsRequests = core.table.withRLS(
  "records_requests",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    subjectUserId: uuid("subject_user_id").notNull(),
    requestedBy: text("requested_by").notNull(),
    relation: text("relation").$type<RequestRelation>().notNull(),
    kind: text("kind").$type<RequestKind>().notNull(),
    law: text("law").$type<RequestLaw>().notNull(),
    receivedOn: date("received_on", { mode: "string" }).notNull(),
    /** When the clock starts: proof of identity or the fee, else receipt. */
    clockFrom: date("clock_from", { mode: "string" }).notNull(),
    dueOn: date("due_on", { mode: "string" }).notNull(),
    extendedTo: date("extended_to", { mode: "string" }),
    extensionReason: text("extension_reason"),
    details: text("details"),
    /** The system that answers the request with the change it carries; null when the office answers it. */
    topic: text("topic").$type<RequestTopic>(),
    outcome: text("outcome").$type<RequestOutcome>(),
    closedAt: instant("closed_at"),
    closedByUserId: uuid("closed_by_user_id"),
    outcomeNote: text("outcome_note"),
    loggedByUserId: uuid("logged_by_user_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("records_requests", t.tenantId, t.id),
    ...baseConstraints("records_requests", t, tenants),
    fk("records_requests", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "records_requests",
      [t.tenantId, t.subjectUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "records_requests",
      [t.tenantId, t.closedByUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "records_requests",
      [t.tenantId, t.loggedByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "records_requests",
      "requested_by",
      sql`char_length(requested_by) between 1 and 120`,
    ),
    ck(
      "records_requests",
      "relation",
      sql`relation in ('self', 'parent', 'representative', 'authority')`,
    ),
    ck(
      "records_requests",
      "kind",
      sql`kind in ('access', 'correction', 'erasure', 'objection')`,
    ),
    ck(
      "records_requests",
      "law",
      sql`law in ('uk_gdpr', 'england_record', 'ferpa', 'egypt', 'other')`,
    ),
    ck(
      "records_requests",
      "dates",
      sql`clock_from >= received_on and due_on >= clock_from and (extended_to is null or extended_to > due_on)`,
    ),
    ck(
      "records_requests",
      "extension",
      sql`(extended_to is null) = (extension_reason is null) and (extended_to is null or law = 'uk_gdpr')`,
    ),
    ck(
      "records_requests",
      "extension_reason",
      sql`char_length(extension_reason) between 1 and 500`,
    ),
    ck("records_requests", "details", sql`char_length(details) <= 2000`),
    ck(
      "records_requests",
      "topic",
      sql`topic is null or (topic in ('health') and kind = 'correction')`,
    ),
    ck(
      "records_requests",
      "outcome",
      sql`outcome in ('completed', 'refused', 'withdrawn')`,
    ),
    ck(
      "records_requests",
      "closed",
      sql`(outcome is null) = (closed_at is null) and (outcome is null) = (closed_by_user_id is null) and (outcome is null) = (outcome_note is null)`,
    ),
    ck(
      "records_requests",
      "outcome_note",
      sql`char_length(outcome_note) between 1 and 1000`,
    ),
    index("records_requests_open_idx")
      .on(t.tenantId, t.orgId, t.dueOn)
      .where(sql`status = 'active' and outcome is null`),
    index("records_requests_subject_idx")
      .on(t.tenantId, t.subjectUserId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * A personal data breach the school knows of: what happened, who was told
 * and when, and what was done. Every breach is kept, reported or not (UK
 * GDPR Art. 33(5); Egypt keeps a breach register).
 */
export const breaches = core.table.withRLS(
  "breaches",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    /** When the school became aware: the regulator's 72 hours start here. */
    discoveredAt: instant("discovered_at").notNull(),
    law: text("law").$type<BreachLaw>().notNull(),
    risk: text("risk").$type<BreachRisk>().notNull(),
    peopleAffected: integer("people_affected"),
    regulatorNotifiedAt: instant("regulator_notified_at"),
    regulatorReference: text("regulator_reference"),
    /** Why the regulator was not told, when it was not. */
    regulatorReason: text("regulator_reason"),
    peopleNotifiedAt: instant("people_notified_at"),
    peopleReason: text("people_reason"),
    actions: text("actions"),
    closedAt: instant("closed_at"),
    closedByUserId: uuid("closed_by_user_id"),
    loggedByUserId: uuid("logged_by_user_id").notNull(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("breaches", t.tenantId, t.id),
    ...baseConstraints("breaches", t, tenants),
    fk("breaches", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk("breaches", [t.tenantId, t.closedByUserId], [users.tenantId, users.id]),
    fk("breaches", [t.tenantId, t.loggedByUserId], [users.tenantId, users.id]),
    ck("breaches", "title", sql`char_length(title) between 1 and 120`),
    ck(
      "breaches",
      "description",
      sql`char_length(description) between 1 and 4000`,
    ),
    ck("breaches", "law", sql`law in ('uk_gdpr', 'egypt', 'other')`),
    ck("breaches", "risk", sql`risk in ('unlikely', 'risk', 'high')`),
    ck(
      "breaches",
      "people_affected",
      sql`people_affected between 0 and 10000000`,
    ),
    ck(
      "breaches",
      "regulator",
      sql`num_nonnulls(regulator_notified_at, regulator_reason) <= 1 and (regulator_reference is null or regulator_notified_at is not null)`,
    ),
    ck(
      "breaches",
      "people",
      sql`num_nonnulls(people_notified_at, people_reason) <= 1`,
    ),
    ck(
      "breaches",
      "notes",
      sql`char_length(regulator_reference) between 1 and 120 and char_length(regulator_reason) between 1 and 1000 and char_length(people_reason) between 1 and 1000 and char_length(actions) between 1 and 4000`,
    ),
    ck(
      "breaches",
      "closed",
      sql`(closed_at is null) = (closed_by_user_id is null) and (closed_at is null or (actions is not null and num_nonnulls(regulator_notified_at, regulator_reason) = 1 and num_nonnulls(people_notified_at, people_reason) = 1))`,
    ),
    index("breaches_org_idx")
      .on(t.tenantId, t.orgId, t.discoveredAt)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);
