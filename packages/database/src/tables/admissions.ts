import type {
  AdmissionQuestion,
  ApplicationEntryKind,
  ApplicationForm,
  ApplicationMatches,
  ApplicationState,
  ChecklistItem,
  ChecklistKind,
  Currency,
  Fee,
  ItemState,
  PriorityRule,
} from "@faridalms/domain/admissions";
import type { EnquiryAnswer } from "@faridalms/domain/enquiries";
import type { PgTableExtraConfigValue } from "drizzle-orm/pg-core";

import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { academicSessions } from "./calendar";
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
  tenantColumns,
  uq,
} from "./conventions";
import { descriptors } from "./descriptors";
import { users } from "./people";
import { siteEnquiries } from "./site";
import { orgs, tenants } from "./tenancy";

/**
 * An application form a school asks families to fill in beside the fixed
 * blocks: its name and the school's questions as the office is editing
 * them. Families only ever see a published version.
 */
export const admissionForms = core.table.withRLS(
  "admission_forms",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    nameEn: text("name_en").notNull().default(""),
    nameAr: text("name_ar").notNull().default(""),
    questions: jsonb("questions")
      .$type<AdmissionQuestion[]>()
      .notNull()
      .default(sql`'[]'`),
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
      "questions",
      sql`jsonb_typeof(questions) = 'array' and octet_length(questions::text) <= 131072`,
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
    questions: jsonb("questions").$type<AdmissionQuestion[]>().notNull(),
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
      "questions",
      sql`jsonb_typeof(questions) = 'array' and octet_length(questions::text) <= 131072`,
    ),
    ...ledgerProfile(),
  ],
);

/**
 * One school's admission into one grade of one school year: when families
 * may apply, how many places there are, the form and checklist they meet,
 * what it costs, when decisions go out and how long an offer stands, the
 * day and range ages are counted by, and the order of preference.
 */
export const admissionIntakes = core.table.withRLS(
  "admission_intakes",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    schoolYearId: uuid("school_year_id").notNull(),
    schoolYearType: text("school_year_type").notNull().default("school_year"),
    gradeLevelDescriptorId: uuid("grade_level_descriptor_id").notNull(),
    gradeLevelNs: text("grade_level_ns")
      .notNull()
      .generatedAlwaysAs(sql`'grade_level'`),
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
    ...entityColumns(),
  },
  (t): PgTableExtraConfigValue[] => [
    pk("admission_intakes", t.tenantId, t.id),
    ...baseConstraints("admission_intakes", t, tenants),
    fk(
      "admission_intakes",
      [t.tenantId, t.schoolYearId, t.schoolYearType, t.schoolYearId, t.orgId],
      [
        academicSessions.tenantId,
        academicSessions.id,
        academicSessions.type,
        academicSessions.schoolYearId,
        academicSessions.orgId,
      ],
    ),
    fk(
      "admission_intakes",
      [t.tenantId, t.gradeLevelDescriptorId, t.gradeLevelNs],
      [descriptors.tenantId, descriptors.id, descriptors.namespace],
    ),
    fk(
      "admission_intakes",
      [t.tenantId, t.formId],
      [admissionForms.tenantId, admissionForms.id],
    ),
    ck(
      "admission_intakes",
      "school_year_type",
      sql`school_year_type = 'school_year'`,
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
    uniqueIndex("admission_intakes_grade_key")
      .on(t.tenantId, t.orgId, t.schoolYearId, t.gradeLevelDescriptorId)
      .where(sql`status = 'active'`),
    index("admission_intakes_window_idx")
      .on(t.tenantId, t.orgId, t.opensOn, t.closesOn)
      .where(sql`status = 'active'`),
    ...entityProfile(),
  ],
);

/**
 * One child's application to one intake, made by the family member who
 * holds the account. The child is a person from the first save; the other
 * guardian, the schools before and the school's questions stay in `form`
 * until it is sent, when the answers are checked and kept as the family
 * read them, and the people the office may already know are found.
 */
export const admissionApplications = core.table.withRLS(
  "admission_applications",
  {
    ...tenantColumns(),
    orgId: uuid("org_id").notNull(),
    intakeId: uuid("intake_id").notNull(),
    formVersionId: uuid("form_version_id").notNull(),
    familyUserId: uuid("family_user_id").notNull(),
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
      .$type<EnquiryAnswer[]>()
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
      [t.tenantId, t.familyUserId],
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
      sql`jsonb_typeof(form) = 'object' and octet_length(form::text) <= 65536`,
    ),
    ck(
      "admission_applications",
      "answers",
      sql`jsonb_typeof(answers) = 'array' and octet_length(answers::text) <= 98304`,
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
    index("admission_applications_family_idx")
      .on(t.tenantId, t.familyUserId)
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
    ck("admission_entries", "kind", sql`kind in ('note', 'state', 'item')`),
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
