import type {
  ApplicationEntryKind,
  ApplicationForm,
  ApplicationMatches,
  ApplicationState,
  ChecklistItem,
  ChecklistKind,
  Currency,
  Decision,
  EventKind,
  EventOutcome,
  Fee,
  ItemState,
  LetterKind,
  IntakeLetters,
  PriorityRule,
} from "@faridalms/domain/admissions";
import type { ContentDocument } from "@faridalms/domain/content";
import type { FormAnswer } from "@faridalms/domain/questions";
import type { ContentLocale } from "@faridalms/domain/translations";
import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgPolicy,
  smallint,
  text,
  time,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  baseConstraints,
  ck,
  core,
  entityColumns,
  entityProfile,
  erase,
  erasureOf,
  fk,
  instant,
  ledgerProfile,
  pk,
  roles,
  tenantColumns,
  uq,
} from "./conventions";
import { users } from "./people";
import { siteEnquiries } from "./site";
import { orgs, tenants } from "./tenancy";

/**
 * An application form a school asks families to fill in beside the fixed
 * blocks: its name and the school's questions as the office is editing
 * them, a document of question blocks in its first language with its
 * translation beside it. Families only ever see a published version.
 */
export const admissionForms = core.table.withRLS(
  "admission_forms",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    nameEn: text("name_en").notNull().default(""),
    nameAr: text("name_ar").notNull().default(""),
    primaryLocale: text("primary_locale")
      .$type<ContentLocale>()
      .notNull()
      .default("en"),
    body: jsonb("body").$type<ContentDocument>().notNull(),
    translation: jsonb("translation").$type<ContentDocument>(),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("admission_forms", t.tenantId, t.id),
    ...baseConstraints("admission_forms", t, tenants),
    fk("admission_forms", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    ck(
      "admission_forms",
      "names",
      sql`(name_en <> '' or name_ar <> '') and char_length(name_en) <= 120 and char_length(name_ar) <= 120`,
    ),
    ck(
      "admission_forms",
      "primary_locale",
      sql`primary_locale in ('en', 'ar')`,
    ),
    ck(
      "admission_forms",
      "body",
      sql`jsonb_typeof(body) = 'object' and octet_length(body::text) <= 262144`,
    ),
    ck(
      "admission_forms",
      "translation",
      sql`translation is null or (jsonb_typeof(translation) = 'object' and octet_length(translation::text) <= 262144)`,
    ),
    index("admission_forms_org_idx")
      .on(t.tenantId, t.orgId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * A form as published, never changed after: applications are answered
 * against the version that was current when they were started.
 */
export const admissionFormVersions = core.table.withRLS(
  "admission_form_versions",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    formId: uuid("form_id").notNull(),
    number: smallint("number").notNull(),
    nameEn: text("name_en").notNull(),
    nameAr: text("name_ar").notNull(),
    primaryLocale: text("primary_locale").$type<ContentLocale>().notNull(),
    body: jsonb("body").$type<ContentDocument>().notNull(),
    translation: jsonb("translation").$type<ContentDocument>(),
    publishedByUserId: uuid("published_by_user_id"),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`statement_timestamp()`),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("admission_form_versions", t.tenantId, t.id),
    fk("admission_form_versions", [t.tenantId], [tenants.tenantId]),
    fk(
      "admission_form_versions",
      [t.tenantId, t.orgId],
      [orgs.tenantId, orgs.id],
    ),
    fk(
      "admission_form_versions",
      [t.tenantId, t.formId],
      [admissionForms.tenantId, admissionForms.id],
    ),
    fk(
      "admission_form_versions",
      [t.tenantId, t.publishedByUserId],
      [users.tenantId, users.id],
    ),
    uq("admission_form_versions", t.tenantId, t.formId, t.number),
    ck("admission_form_versions", "number", sql`number > 0`),
    ck(
      "admission_form_versions",
      "primary_locale",
      sql`primary_locale in ('en', 'ar')`,
    ),
    ck(
      "admission_form_versions",
      "body",
      sql`jsonb_typeof(body) = 'object' and octet_length(body::text) <= 262144`,
    ),
    ck(
      "admission_form_versions",
      "translation",
      sql`translation is null or (jsonb_typeof(translation) = 'object' and octet_length(translation::text) <= 262144)`,
    ),
    ...ledgerProfile(),
  ],
);

/**
 * One school's admission of learners who start on one day: its name, when
 * families may apply, how many places there are, the form and checklist
 * they meet, what it costs, when decisions go out and how long an offer
 * stands, the day and range ages are counted by, and the order of
 * preference.
 */
export const admissionIntakes = core.table.withRLS(
  "admission_intakes",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    titleEn: text("title_en"),
    titleAr: text("title_ar"),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    opensOn: date("opens_on", { mode: "string" }).notNull(),
    closesOn: date("closes_on", { mode: "string" }).notNull(),
    capacity: integer("capacity").notNull(),
    formId: uuid("form_id").notNull(),
    checklist: jsonb("checklist")
      .$type<ChecklistItem[]>()
      .notNull()
      .default(sql`'[]'`),
    currency: text("currency").$type<Currency>().notNull(),
    fees: jsonb("fees")
      .$type<Fee[]>()
      .notNull()
      .default(sql`'[]'`),
    decisionsOn: date("decisions_on", { mode: "string" }),
    offerDays: smallint("offer_days").notNull(),
    ageCutoffOn: date("age_cutoff_on", { mode: "string" }).notNull(),
    minAgeMonths: smallint("min_age_months"),
    maxAgeMonths: smallint("max_age_months"),
    priorities: text("priorities")
      .array()
      .$type<PriorityRule[]>()
      .notNull()
      .default(sql`'{}'`),
    letters: jsonb("letters")
      .$type<IntakeLetters>()
      .notNull()
      .default(sql`'{}'`),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("admission_intakes", t.tenantId, t.id),
    uq("admission_intakes", t.tenantId, t.id, t.orgId),
    ck(
      "admission_intakes",
      "letters",
      sql`jsonb_typeof(letters) = 'object' and octet_length(letters::text) <= 4096`,
    ),
    ...baseConstraints("admission_intakes", t, tenants),
    fk(
      "admission_intakes",
      [t.tenantId, t.formId],
      [admissionForms.tenantId, admissionForms.id],
    ),
    ck(
      "admission_intakes",
      "title_en",
      sql`char_length(title_en) between 1 and 120`,
    ),
    ck(
      "admission_intakes",
      "title_ar",
      sql`char_length(title_ar) between 1 and 120`,
    ),
    ck(
      "admission_intakes",
      "title",
      sql`num_nonnulls(title_en, title_ar) >= 1`,
    ),
    ck("admission_intakes", "window", sql`opens_on <= closes_on`),
    ck("admission_intakes", "capacity", sql`capacity between 1 and 5000`),
    ck(
      "admission_intakes",
      "checklist",
      sql`jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 20`,
    ),
    ck(
      "admission_intakes",
      "currency",
      sql`currency in ('EGP', 'USD', 'EUR', 'GBP', 'AED', 'SAR')`,
    ),
    ck(
      "admission_intakes",
      "fees",
      sql`jsonb_typeof(fees) = 'array' and jsonb_array_length(fees) <= 5`,
    ),
    ck("admission_intakes", "offer_days", sql`offer_days between 1 and 120`),
    ck(
      "admission_intakes",
      "ages",
      sql`(min_age_months is null or min_age_months between 0 and 300)
        and (max_age_months is null or max_age_months between 0 and 300)
        and (min_age_months is null or max_age_months is null or min_age_months <= max_age_months)`,
    ),
    ck(
      "admission_intakes",
      "priorities",
      sql`priorities <@ array['sibling', 'staff_child', 'returning_student', 'additional_needs']`,
    ),
    index("admission_intakes_window_idx")
      .on(t.tenantId, t.orgId, t.opensOn, t.closesOn)
      .where(sql`status = 'active'`),
    // The website lists the intakes families may apply to, with their dates
    // and fees; never their places, forms or how they rank.
    pgPolicy("p_site_select", {
      for: "select",
      to: roles.site,
      using: sql`status = 'active'`,
    }),
    ...entityProfile(),
  ],
);

/**
 * One applicant's application to one intake, filed by the account that
 * holds it: the applicant's own, or someone's who applies for them. The
 * applicant is a person from the first save; the schools before and the
 * school's questions stay in `form` until it is sent, when the answers are
 * checked and kept as the filer read them, and the people the office may
 * already know are found.
 */
export const admissionApplications = core.table.withRLS(
  "admission_applications",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    intakeId: uuid("intake_id").notNull(),
    formVersionId: uuid("form_version_id").notNull(),
    filedByUserId: uuid("filed_by_user_id").notNull(),
    applicantUserId: uuid("applicant_user_id").notNull(),
    enquiryId: uuid("enquiry_id"),
    state: text("state").$type<ApplicationState>().notNull().default("draft"),
    stateChangedAt: instant("state_changed_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    exitReason: text("exit_reason"),
    reference: text("reference"),
    locale: text("locale").$type<"en" | "ar">().notNull(),
    form: jsonb("form").$type<ApplicationForm>().notNull(),
    answers: jsonb("answers")
      .$type<FormAnswer[]>()
      .notNull()
      .default(sql`'[]'`),
    additionalNeeds: boolean("additional_needs").notNull().default(false),
    priorities: text("priorities")
      .array()
      .$type<PriorityRule[]>()
      .notNull()
      .default(sql`'{}'`),
    matches: jsonb("matches")
      .$type<ApplicationMatches>()
      .notNull()
      .default(sql`'{}'`),
    submittedAt: instant("submitted_at"),
    /** What the office decided, kept after it is released for the record and the reports. */
    decision: text("decision").$type<Decision>(),
    decidedAt: instant("decided_at"),
    decidedByUserId: uuid("decided_by_user_id"),
    /** When the family was told: by hand, or on the intake's day. */
    releasedAt: instant("released_at"),
    /** The last day an open offer may be accepted. */
    offerExpiresOn: date("offer_expires_on", { mode: "string" }),
    /** When the family accepted or declined the offer. */
    answeredAt: instant("answered_at"),
    /** The student the applicant became: the applicant, or the school's own student they were found to be. */
    studentUserId: uuid("student_user_id"),
    /** The application of an earlier year this one was deferred from. */
    deferredFromId: uuid("deferred_from_id"),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("admission_applications", t.tenantId, t.id),
    ...baseConstraints("admission_applications", t, tenants),
    fk(
      "admission_applications",
      [t.tenantId, t.orgId],
      [orgs.tenantId, orgs.id],
    ),
    fk(
      "admission_applications",
      [t.tenantId, t.intakeId],
      [admissionIntakes.tenantId, admissionIntakes.id],
    ),
    fk(
      "admission_applications",
      [t.tenantId, t.formVersionId],
      [admissionFormVersions.tenantId, admissionFormVersions.id],
    ),
    fk(
      "admission_applications",
      [t.tenantId, t.filedByUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "admission_applications",
      [t.tenantId, t.applicantUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "admission_applications",
      [t.tenantId, t.enquiryId],
      [siteEnquiries.tenantId, siteEnquiries.id],
    ),
    fk(
      "admission_applications",
      [t.tenantId, t.decidedByUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "admission_applications",
      [t.tenantId, t.studentUserId],
      [users.tenantId, users.id],
    ),
    fk(
      "admission_applications",
      [t.tenantId, t.deferredFromId],
      [t.tenantId, t.id],
    ),
    ck(
      "admission_applications",
      "decision",
      sql`decision in ('offer', 'waitlist', 'decline')`,
    ),
    ck(
      "admission_applications",
      "decided",
      sql`(state <> 'decided' or (decision is not null and released_at is null))
        and (decision is null) = (decided_at is null)`,
    ),
    ck(
      "admission_applications",
      "offered",
      sql`state <> 'offered' or offer_expires_on is not null`,
    ),
    ck(
      "admission_applications",
      "enrolled",
      sql`(state = 'enrolled') = (student_user_id is not null)`,
    ),
    ck(
      "admission_applications",
      "state",
      sql`state in ('draft', 'submitted', 'in_review', 'decided', 'offered', 'accepted', 'enrolled', 'waitlisted', 'declined_by_school', 'withdrawn', 'offer_declined', 'offer_expired', 'deferred')`,
    ),
    ck(
      "admission_applications",
      "exit_reason",
      sql`char_length(exit_reason) between 1 and 40`,
    ),
    ck(
      "admission_applications",
      "reference",
      sql`reference ~ '^[0-9]{4}-[0-9]{4,6}$'`,
    ),
    ck("admission_applications", "locale", sql`locale in ('en', 'ar')`),
    ck(
      "admission_applications",
      "form",
      sql`jsonb_typeof(form) = 'object' and octet_length(form::text) <= 131072`,
    ),
    ck(
      "admission_applications",
      "answers",
      sql`jsonb_typeof(answers) = 'array' and octet_length(answers::text) <= 262144`,
    ),
    ck(
      "admission_applications",
      "matches",
      sql`jsonb_typeof(matches) = 'object' and octet_length(matches::text) <= 16384`,
    ),
    ck(
      "admission_applications",
      "priorities",
      sql`priorities <@ array['sibling', 'staff_child', 'returning_student', 'additional_needs']`,
    ),
    ck(
      "admission_applications",
      "sent",
      sql`(state = 'draft' or (state = 'withdrawn' and submitted_at is null)) = (submitted_at is null)
        and (submitted_at is null) = (reference is null)`,
    ),
    uniqueIndex("admission_applications_applicant_key")
      .on(t.tenantId, t.intakeId, t.applicantUserId)
      .where(sql`status = 'active' and state <> 'withdrawn'`),
    uniqueIndex("admission_applications_reference_key")
      .on(t.tenantId, t.orgId, t.reference)
      .where(sql`reference is not null`),
    index("admission_applications_intake_idx")
      .on(t.tenantId, t.intakeId, t.state)
      .where(sql`status = 'active'`),
    index("admission_applications_filer_idx")
      .on(t.tenantId, t.filedByUserId)
      .where(sql`status = 'active'`),
    index("admission_applications_applicant_idx")
      .on(t.tenantId, t.applicantUserId)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    ...erase(erasureOf("applicant_user_id")),
  ],
);

/**
 * A step of an application's checklist, copied from its intake's template
 * when the application starts, so changing the template later changes no
 * application already made. A document step holds the files the family
 * uploaded for it.
 */
export const admissionItems = core.table.withRLS(
  "admission_items",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    applicationId: uuid("application_id").notNull(),
    itemKey: uuid("item_key").notNull(),
    kind: text("kind").$type<ChecklistKind>().notNull(),
    labelEn: text("label_en").notNull(),
    labelAr: text("label_ar").notNull(),
    required: boolean("required").notNull(),
    position: smallint("position").notNull(),
    state: text("state").$type<ItemState>().notNull().default("pending"),
    stateChangedAt: instant("state_changed_at")
      .notNull()
      .default(sql`statement_timestamp()`),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("admission_items", t.tenantId, t.id),
    ...baseConstraints("admission_items", t, tenants),
    fk("admission_items", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "admission_items",
      [t.tenantId, t.applicationId],
      [admissionApplications.tenantId, admissionApplications.id],
    ),
    ck(
      "admission_items",
      "kind",
      sql`kind in ('document', 'assessment', 'interview', 'fee', 'reference')`,
    ),
    ck(
      "admission_items",
      "labels",
      sql`(label_en <> '' or label_ar <> '') and char_length(label_en) <= 120 and char_length(label_ar) <= 120`,
    ),
    ck("admission_items", "position", sql`position between 0 and 99`),
    ck(
      "admission_items",
      "state",
      sql`state in ('pending', 'received', 'verified', 'waived', 'rejected')`,
    ),
    uniqueIndex("admission_items_key")
      .on(t.tenantId, t.applicationId, t.itemKey)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * An application's history, oldest first: the office's notes, each change
 * of state and each checklist step checked. Entries are never edited.
 */
export const admissionEntries = core.table.withRLS(
  "admission_entries",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    applicationId: uuid("application_id").notNull(),
    kind: text("kind").$type<ApplicationEntryKind>().notNull(),
    body: text("body").notNull().default(""),
    details: jsonb("details")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'`),
    authorUserId: uuid("author_user_id"),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`statement_timestamp()`),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("admission_entries", t.tenantId, t.id),
    fk("admission_entries", [t.tenantId], [tenants.tenantId]),
    fk("admission_entries", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "admission_entries",
      [t.tenantId, t.applicationId],
      [admissionApplications.tenantId, admissionApplications.id],
    ),
    fk(
      "admission_entries",
      [t.tenantId, t.authorUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "admission_entries",
      "kind",
      sql`kind in ('note', 'state', 'item', 'event')`,
    ),
    ck("admission_entries", "body", sql`char_length(body) <= 4000`),
    ck(
      "admission_entries",
      "details",
      sql`jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4096`,
    ),
    index("admission_entries_application_idx").on(
      t.tenantId,
      t.applicationId,
      t.createdAt,
    ),
    ...ledgerProfile(),
  ],
);

/**
 * A letter an application's family received: an offer, a place on the
 * waiting list, a refusal, a welcome. Its words are the document hosted as
 * `admission_letter`, written from the school's template in the family's
 * language and frozen as sent.
 */
export const admissionLetters = core.table.withRLS(
  "admission_letters",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    applicationId: uuid("application_id").notNull(),
    kind: text("kind").$type<LetterKind>().notNull(),
    locale: text("locale").$type<"en" | "ar">().notNull(),
    title: text("title").notNull(),
    /** The template it was written from, while the school keeps it. */
    templateId: uuid("template_id"),
    sentByUserId: uuid("sent_by_user_id"),
    createdAt: instant("created_at")
      .notNull()
      .default(sql`statement_timestamp()`),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("admission_letters", t.tenantId, t.id),
    fk("admission_letters", [t.tenantId], [tenants.tenantId]),
    fk("admission_letters", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "admission_letters",
      [t.tenantId, t.applicationId],
      [admissionApplications.tenantId, admissionApplications.id],
    ),
    fk(
      "admission_letters",
      [t.tenantId, t.sentByUserId],
      [users.tenantId, users.id],
    ),
    ck(
      "admission_letters",
      "kind",
      sql`kind in ('offer', 'waitlist', 'decline', 'welcome')`,
    ),
    ck("admission_letters", "locale", sql`locale in ('en', 'ar')`),
    ck("admission_letters", "title", sql`char_length(title) between 1 and 200`),
    index("admission_letters_application_idx").on(
      t.tenantId,
      t.applicationId,
      t.createdAt,
    ),
    ...ledgerProfile(),
  ],
);

/**
 * A tour, assessment or interview booked for an application: its day and
 * hours on the school's clock, where, the staff who attend, and what came
 * of it. One booked for an assessment or interview step settles that step
 * once attended.
 */
export const admissionEvents = core.table.withRLS(
  "admission_events",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    applicationId: uuid("application_id").notNull(),
    itemId: uuid("item_id"),
    kind: text("kind").$type<EventKind>().notNull(),
    startsOn: date("starts_on", { mode: "string" }).notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    location: text("location").notNull().default(""),
    attendeeUserIds: uuid("attendee_user_ids")
      .array()
      .notNull()
      .default(sql`'{}'`),
    outcome: text("outcome")
      .$type<EventOutcome>()
      .notNull()
      .default("scheduled"),
    result: text("result").notNull().default(""),
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("admission_events", t.tenantId, t.id),
    ...baseConstraints("admission_events", t, tenants),
    fk("admission_events", [t.tenantId, t.orgId], [orgs.tenantId, orgs.id]),
    fk(
      "admission_events",
      [t.tenantId, t.applicationId],
      [admissionApplications.tenantId, admissionApplications.id],
    ),
    fk(
      "admission_events",
      [t.tenantId, t.itemId],
      [admissionItems.tenantId, admissionItems.id],
    ),
    ck(
      "admission_events",
      "kind",
      sql`kind in ('tour', 'assessment', 'interview')`,
    ),
    ck(
      "admission_events",
      "outcome",
      sql`outcome in ('scheduled', 'attended', 'missed', 'cancelled')`,
    ),
    ck("admission_events", "times", sql`start_time < end_time`),
    ck("admission_events", "location", sql`char_length(location) <= 200`),
    ck("admission_events", "result", sql`char_length(result) <= 2000`),
    ck(
      "admission_events",
      "attendees",
      sql`cardinality(attendee_user_ids) <= 10`,
    ),
    index("admission_events_application_idx")
      .on(t.tenantId, t.applicationId, t.startsOn)
      .where(sql`status = 'active'`),
    index("admission_events_day_idx")
      .on(t.tenantId, t.orgId, t.startsOn)
      .where(sql`status = 'active'`),
    ...entityProfile(),
    ...erase(
      sql`exists (select 1 from core.admission_applications a
        where a.tenant_id = admission_events.tenant_id and a.id = admission_events.application_id
          and app.erasure_approved(a.tenant_id, a.applicant_user_id))`,
    ),
  ],
);
