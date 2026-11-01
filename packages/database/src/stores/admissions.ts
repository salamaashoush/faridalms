import type {
  AdmissionQuestion,
  ApplicationEntryKind,
  ApplicationForm,
  ApplicationListQuery,
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

import { LIVE_STATES } from "@faridalms/domain/admissions";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { escapeLike, isoOf, textArray, uuidArray } from "./sql";

type Tx = CellTransaction;
interface Org {
  tenantId: string;
  orgId: string;
}

export interface FormRow {
  id: string;
  version: number;
  nameEn: string;
  nameAr: string;
  questions: AdmissionQuestion[];
  /** The latest published version, or null while the form was never published. */
  published: { id: string; number: number; at: string } | null;
  /** Whether the questions differ from the published version. */
  changed: boolean;
  intakes: number;
}

/** A school's application forms, each with its latest published version. */
export async function formsOf(
  tx: Tx,
  input: Org & { id?: string },
): Promise<FormRow[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    name_en: string;
    name_ar: string;
    questions: AdmissionQuestion[];
    published_id: string | null;
    published_number: number | null;
    published_at: string | null;
    changed: boolean;
    intakes: number;
  }>(sql`
    select f.id, f.version, f.name_en, f.name_ar, f.questions,
      p.id as published_id, p.number as published_number,
      case when p.id is null then null else ${isoOf(sql`p.created_at`)} end as published_at,
      (p.id is null or p.questions <> f.questions or p.name_en <> f.name_en or p.name_ar <> f.name_ar)
        as changed,
      (select count(*)::int from core.admission_intakes i
        where i.tenant_id = f.tenant_id and i.form_id = f.id and i.status = 'active') as intakes
    from core.admission_forms f
    left join lateral (
      select v.id, v.number, v.created_at, v.questions, v.name_en, v.name_ar
      from core.admission_form_versions v
      where v.tenant_id = f.tenant_id and v.form_id = f.id
      order by v.number desc limit 1
    ) p on true
    where f.tenant_id = ${input.tenantId}::uuid and f.org_id = ${input.orgId}::uuid
      and f.status = 'active' and (${input.id ?? null}::uuid is null or f.id = ${input.id ?? null}::uuid)
    order by f.created_at, f.id`);
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    questions: row.questions,
    published:
      row.published_id && row.published_number !== null && row.published_at
        ? {
            id: row.published_id,
            number: row.published_number,
            at: row.published_at,
          }
        : null,
    changed: row.changed,
    intakes: row.intakes,
  }));
}

export async function insertForm(
  tx: Tx,
  input: Org & {
    nameEn: string;
    nameAr: string;
    questions: AdmissionQuestion[];
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.admission_forms (tenant_id, org_id, name_en, name_ar, questions)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.nameEn}, ${input.nameAr},
      ${JSON.stringify(input.questions)}::text::jsonb)
    returning id, version`);
  if (!row) throw new Error("The form was not created");
  return row;
}

/** Null when another edit won. */
export async function updateForm(
  tx: Tx,
  input: Org & {
    id: string;
    expectedVersion: number;
    nameEn: string;
    nameAr: string;
    questions: AdmissionQuestion[];
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.admission_forms
    set name_en = ${input.nameEn}, name_ar = ${input.nameAr},
      questions = ${JSON.stringify(input.questions)}::text::jsonb
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

/**
 * Publishes a form as it stands: a new numbered version, never changed
 * after. Locks the form, so two publishes at once number in turn.
 */
export async function publishForm(
  tx: Tx,
  input: Org & { id: string; expectedVersion: number; userId: string | null },
): Promise<{ id: string; number: number } | null> {
  const [row] = await tx.execute<{ id: string; number: number }>(sql`
    with form as (
      select f.id, f.name_en, f.name_ar, f.questions from core.admission_forms f
      where f.tenant_id = ${input.tenantId}::uuid and f.org_id = ${input.orgId}::uuid
        and f.id = ${input.id}::uuid and f.version = ${input.expectedVersion} and f.status = 'active'
      for update
    )
    insert into core.admission_form_versions (tenant_id, org_id, form_id, number, name_en, name_ar,
      questions, published_by_user_id)
    select ${input.tenantId}::uuid, ${input.orgId}::uuid, form.id,
      coalesce((select max(v.number) from core.admission_form_versions v
        where v.tenant_id = ${input.tenantId}::uuid and v.form_id = form.id), 0) + 1,
      form.name_en, form.name_ar, form.questions, ${input.userId}::uuid
    from form
    returning id, number`);
  return row ?? null;
}

export interface FormVersion {
  id: string;
  formId: string;
  number: number;
  nameEn: string;
  nameAr: string;
  questions: AdmissionQuestion[];
}

export async function formVersionById(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<FormVersion | null> {
  const [row] = await tx.execute<{
    id: string;
    form_id: string;
    number: number;
    name_en: string;
    name_ar: string;
    questions: AdmissionQuestion[];
  }>(sql`
    select id, form_id, number, name_en, name_ar, questions from core.admission_form_versions
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid`);
  return row
    ? {
        id: row.id,
        formId: row.form_id,
        number: row.number,
        nameEn: row.name_en,
        nameAr: row.name_ar,
        questions: row.questions,
      }
    : null;
}

export interface IntakeRow {
  id: string;
  version: number;
  schoolYearId: string;
  yearTitleEn: string | null;
  yearTitleAr: string | null;
  yearStartsOn: string;
  entryYear: number;
  gradeId: string;
  gradeMeaning: string | null;
  gradeEn: string | null;
  gradeAr: string | null;
  gradeOrder: number;
  opensOn: string;
  closesOn: string;
  capacity: number;
  formId: string;
  formNameEn: string;
  formNameAr: string;
  /** The form's latest published version, which new applications are answered against. */
  formVersionId: string | null;
  checklist: ChecklistItem[];
  currency: Currency;
  fees: Fee[];
  decisionsOn: string | null;
  offerDays: number;
  ageCutoffOn: string;
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
  priorities: PriorityRule[];
  /** Applications sent and not ended, and drafts still open. */
  live: number;
  drafts: number;
}

const intakeColumns = sql`i.id, i.version, i.school_year_id, y.title_en as year_title_en,
  y.title_ar as year_title_ar, lower(y.span)::text as year_starts_on,
  extract(year from lower(y.span))::int as entry_year,
  i.grade_level_descriptor_id as grade_id, g.system_meaning as grade_meaning,
  coalesce(o.label_en, g.label_en) as grade_en, coalesce(o.label_ar, g.label_ar) as grade_ar,
  coalesce(o.sort_order, g.sort_order) as grade_order,
  i.opens_on::text as opens_on, i.closes_on::text as closes_on, i.capacity, i.form_id,
  f.name_en as form_name_en, f.name_ar as form_name_ar,
  (select v.id from core.admission_form_versions v where v.tenant_id = i.tenant_id
    and v.form_id = i.form_id order by v.number desc limit 1) as form_version_id,
  i.checklist, i.currency, i.fees, i.decisions_on::text as decisions_on, i.offer_days,
  i.age_cutoff_on::text as age_cutoff_on, i.min_age_months, i.max_age_months, i.priorities,
  (select count(*)::int from core.admission_applications a where a.tenant_id = i.tenant_id
    and a.intake_id = i.id and a.status = 'active' and a.state = any(${textArray(LIVE_STATES)})) as live,
  (select count(*)::int from core.admission_applications a where a.tenant_id = i.tenant_id
    and a.intake_id = i.id and a.status = 'active' and a.state = 'draft') as drafts`;

const intakeJoins = sql`
  from core.admission_intakes i
  join core.academic_sessions y on y.tenant_id = i.tenant_id and y.id = i.school_year_id
  join core.descriptors g on g.tenant_id = i.tenant_id and g.id = i.grade_level_descriptor_id
  left join lateral (
    select x.label_en, x.label_ar, x.sort_order from core.descriptor_overrides x
    where x.tenant_id = i.tenant_id and x.descriptor_id = g.id and x.org_id = i.org_id
      and x.status = 'active' limit 1
  ) o on true
  join core.admission_forms f on f.tenant_id = i.tenant_id and f.id = i.form_id`;

type IntakeRecord = {
  id: string;
  version: number;
  school_year_id: string;
  year_title_en: string | null;
  year_title_ar: string | null;
  year_starts_on: string;
  entry_year: number;
  grade_id: string;
  grade_meaning: string | null;
  grade_en: string | null;
  grade_ar: string | null;
  grade_order: number;
  opens_on: string;
  closes_on: string;
  capacity: number;
  form_id: string;
  form_name_en: string;
  form_name_ar: string;
  form_version_id: string | null;
  checklist: ChecklistItem[];
  currency: Currency;
  fees: Fee[];
  decisions_on: string | null;
  offer_days: number;
  age_cutoff_on: string;
  min_age_months: number | null;
  max_age_months: number | null;
  priorities: PriorityRule[];
  live: number;
  drafts: number;
};

const intakeOf = (row: IntakeRecord): IntakeRow => ({
  id: row.id,
  version: row.version,
  schoolYearId: row.school_year_id,
  yearTitleEn: row.year_title_en,
  yearTitleAr: row.year_title_ar,
  yearStartsOn: row.year_starts_on,
  entryYear: row.entry_year,
  gradeId: row.grade_id,
  gradeMeaning: row.grade_meaning,
  gradeEn: row.grade_en,
  gradeAr: row.grade_ar,
  gradeOrder: row.grade_order,
  opensOn: row.opens_on,
  closesOn: row.closes_on,
  capacity: row.capacity,
  formId: row.form_id,
  formNameEn: row.form_name_en,
  formNameAr: row.form_name_ar,
  formVersionId: row.form_version_id,
  checklist: row.checklist,
  currency: row.currency,
  fees: row.fees,
  decisionsOn: row.decisions_on,
  offerDays: row.offer_days,
  ageCutoffOn: row.age_cutoff_on,
  minAgeMonths: row.min_age_months,
  maxAgeMonths: row.max_age_months,
  priorities: row.priorities,
  live: row.live,
  drafts: row.drafts,
});

/** A school's intakes, by year of entry and then grade; one year's, or all. */
export async function intakesOf(
  tx: Tx,
  input: Org & { yearId?: string | null; id?: string; openOn?: string },
): Promise<IntakeRow[]> {
  const rows = await tx.execute<IntakeRecord>(sql`
    select ${intakeColumns} ${intakeJoins}
    where i.tenant_id = ${input.tenantId}::uuid and i.org_id = ${input.orgId}::uuid
      and i.status = 'active'
      and (${input.yearId ?? null}::uuid is null or i.school_year_id = ${input.yearId ?? null}::uuid)
      and (${input.id ?? null}::uuid is null or i.id = ${input.id ?? null}::uuid)
      and (${input.openOn ?? null}::date is null
        or ${input.openOn ?? null}::date between i.opens_on and i.closes_on)
    order by lower(y.span), coalesce(o.sort_order, g.sort_order), i.id`);
  return rows.map(intakeOf);
}

export interface IntakeFields {
  schoolYearId: string;
  gradeId: string;
  opensOn: string;
  closesOn: string;
  capacity: number;
  formId: string;
  checklist: ChecklistItem[];
  currency: Currency;
  fees: Fee[];
  decisionsOn: string | null;
  offerDays: number;
  ageCutoffOn: string;
  minAgeMonths: number | null;
  maxAgeMonths: number | null;
  priorities: PriorityRule[];
}

export async function insertIntake(
  tx: Tx,
  input: Org & IntakeFields,
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.admission_intakes (tenant_id, org_id, school_year_id, grade_level_descriptor_id,
      opens_on, closes_on, capacity, form_id, checklist, currency, fees, decisions_on, offer_days,
      age_cutoff_on, min_age_months, max_age_months, priorities)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.schoolYearId}::uuid,
      ${input.gradeId}::uuid, ${input.opensOn}::date, ${input.closesOn}::date, ${input.capacity},
      ${input.formId}::uuid, ${JSON.stringify(input.checklist)}::text::jsonb, ${input.currency},
      ${JSON.stringify(input.fees)}::text::jsonb, ${input.decisionsOn}::date, ${input.offerDays},
      ${input.ageCutoffOn}::date, ${input.minAgeMonths}, ${input.maxAgeMonths},
      ${textArray(input.priorities)})
    returning id, version`);
  if (!row) throw new Error("The intake was not created");
  return row;
}

/** Null when another edit won. The year and grade of an intake never change. */
export async function updateIntake(
  tx: Tx,
  input: Org & { id: string; expectedVersion: number } & Omit<
      IntakeFields,
      "schoolYearId" | "gradeId"
    >,
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.admission_intakes
    set opens_on = ${input.opensOn}::date, closes_on = ${input.closesOn}::date,
      capacity = ${input.capacity}, form_id = ${input.formId}::uuid,
      checklist = ${JSON.stringify(input.checklist)}::text::jsonb, currency = ${input.currency},
      fees = ${JSON.stringify(input.fees)}::text::jsonb, decisions_on = ${input.decisionsOn}::date,
      offer_days = ${input.offerDays}, age_cutoff_on = ${input.ageCutoffOn}::date,
      min_age_months = ${input.minAgeMonths}, max_age_months = ${input.maxAgeMonths},
      priorities = ${textArray(input.priorities)}
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

export interface ApplicationRow {
  id: string;
  version: number;
  intakeId: string;
  formVersionId: string;
  familyUserId: string;
  applicantUserId: string;
  enquiryId: string | null;
  state: ApplicationState;
  stateChangedAt: string;
  exitReason: string | null;
  reference: string | null;
  locale: "en" | "ar";
  form: ApplicationForm;
  answers: EnquiryAnswer[];
  additionalNeeds: boolean;
  priorities: PriorityRule[];
  matches: Partial<ApplicationMatches> & { documentHolders?: string[] };
  submittedAt: string | null;
  createdAt: string;
  applicant: {
    nameEn: string | null;
    nameAr: string | null;
    birthDate: string | null;
    sexId: string | null;
  };
  family: { nameEn: string | null; nameAr: string | null };
}

const applicationColumns = sql`a.id, a.version, a.intake_id, a.form_version_id, a.family_user_id,
  a.applicant_user_id, a.enquiry_id, a.state, ${isoOf(sql`a.state_changed_at`)} as state_changed_at,
  a.exit_reason, a.reference, a.locale, a.form, a.answers, a.additional_needs, a.priorities, a.matches,
  case when a.submitted_at is null then null else ${isoOf(sql`a.submitted_at`)} end as submitted_at,
  ${isoOf(sql`a.created_at`)} as created_at,
  c.full_name_en as applicant_en, c.full_name_ar as applicant_ar,
  c.birth_date::text as applicant_birth_date, c.sex_descriptor_id as applicant_sex_id,
  p.full_name_en as family_en, p.full_name_ar as family_ar`;

const applicationJoins = sql`
  from core.admission_applications a
  join core.users c on c.tenant_id = a.tenant_id and c.id = a.applicant_user_id
  join core.users p on p.tenant_id = a.tenant_id and p.id = a.family_user_id`;

type ApplicationRecord = {
  id: string;
  version: number;
  intake_id: string;
  form_version_id: string;
  family_user_id: string;
  applicant_user_id: string;
  enquiry_id: string | null;
  state: ApplicationState;
  state_changed_at: string;
  exit_reason: string | null;
  reference: string | null;
  locale: "en" | "ar";
  form: ApplicationForm;
  answers: EnquiryAnswer[];
  additional_needs: boolean;
  priorities: PriorityRule[];
  matches: ApplicationRow["matches"];
  submitted_at: string | null;
  created_at: string;
  applicant_en: string | null;
  applicant_ar: string | null;
  applicant_birth_date: string | null;
  applicant_sex_id: string | null;
  family_en: string | null;
  family_ar: string | null;
};

const applicationOf = (row: ApplicationRecord): ApplicationRow => ({
  id: row.id,
  version: row.version,
  intakeId: row.intake_id,
  formVersionId: row.form_version_id,
  familyUserId: row.family_user_id,
  applicantUserId: row.applicant_user_id,
  enquiryId: row.enquiry_id,
  state: row.state,
  stateChangedAt: row.state_changed_at,
  exitReason: row.exit_reason,
  reference: row.reference,
  locale: row.locale,
  form: row.form,
  answers: Array.isArray(row.answers) ? row.answers : [],
  additionalNeeds: row.additional_needs,
  priorities: row.priorities,
  matches: row.matches,
  submittedAt: row.submitted_at,
  createdAt: row.created_at,
  applicant: {
    nameEn: row.applicant_en,
    nameAr: row.applicant_ar,
    birthDate: row.applicant_birth_date,
    sexId: row.applicant_sex_id,
  },
  family: { nameEn: row.family_en, nameAr: row.family_ar },
});

/** One application of a school; with `familyUserId`, only if that person made it. */
export async function applicationById(
  tx: Tx,
  input: Org & { id: string; familyUserId?: string },
): Promise<ApplicationRow | null> {
  const [row] = await tx.execute<ApplicationRecord>(sql`
    select ${applicationColumns} ${applicationJoins}
    where a.tenant_id = ${input.tenantId}::uuid and a.org_id = ${input.orgId}::uuid
      and a.id = ${input.id}::uuid and a.status = 'active'
      and (${input.familyUserId ?? null}::uuid is null or a.family_user_id = ${input.familyUserId ?? null}::uuid)`);
  return row ? applicationOf(row) : null;
}

/** Every application a family member made at the school, newest first. */
export async function applicationsOfFamily(
  tx: Tx,
  input: Org & { familyUserId: string },
): Promise<ApplicationRow[]> {
  const rows = await tx.execute<ApplicationRecord>(sql`
    select ${applicationColumns} ${applicationJoins}
    where a.tenant_id = ${input.tenantId}::uuid and a.org_id = ${input.orgId}::uuid
      and a.family_user_id = ${input.familyUserId}::uuid and a.status = 'active'
    order by a.created_at desc, a.id desc`);
  return rows.map(applicationOf);
}

/** Whether a person is a child a family member has applied for, so their own records are theirs to fill in. */
export async function appliedFor(
  tx: Tx,
  input: Org & { familyUserId: string; applicantUserId: string },
): Promise<boolean> {
  const [row] = await tx.execute<{ found: boolean }>(sql`
    select exists (
      select 1 from core.admission_applications
      where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
        and family_user_id = ${input.familyUserId}::uuid
        and applicant_user_id = ${input.applicantUserId}::uuid and status = 'active'
    ) as found`);
  return row?.found ?? false;
}

export async function insertApplication(
  tx: Tx,
  input: Org & {
    intakeId: string;
    formVersionId: string;
    familyUserId: string;
    applicantUserId: string;
    locale: "en" | "ar";
    form: ApplicationForm;
    checklist: readonly ChecklistItem[];
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.admission_applications (tenant_id, org_id, intake_id, form_version_id,
      family_user_id, applicant_user_id, locale, form)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.intakeId}::uuid,
      ${input.formVersionId}::uuid, ${input.familyUserId}::uuid, ${input.applicantUserId}::uuid,
      ${input.locale}, ${JSON.stringify(input.form)}::text::jsonb)
    returning id, version`);
  if (!row) throw new Error("The application was not created");
  if (input.checklist.length > 0)
    await tx.execute(sql`
      insert into core.admission_items (tenant_id, org_id, application_id, item_key, kind, label_en,
        label_ar, required, position)
      select ${input.tenantId}::uuid, ${input.orgId}::uuid, ${row.id}::uuid, (item->>'key')::uuid,
        item->>'kind', item->>'labelEn', item->>'labelAr', (item->>'required')::boolean,
        (ordinality - 1)::smallint
      from jsonb_array_elements(${JSON.stringify(input.checklist)}::text::jsonb) with ordinality as t(item, ordinality)`);
  return row;
}

/** A draft's words as the family last saved them; null when another save won or it was sent. */
export async function saveDraftForm(
  tx: Tx,
  input: Org & {
    id: string;
    expectedVersion: number;
    form: ApplicationForm;
    additionalNeeds: boolean;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.admission_applications
    set form = ${JSON.stringify(input.form)}::text::jsonb, additional_needs = ${input.additionalNeeds}
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and version = ${input.expectedVersion} and status = 'active'
      and state = 'draft'
    returning version`);
  return row?.version ?? null;
}

/** People the office may know an applicant by, kept for when it is sent; never read by the family. */
export async function noteDocumentHolders(
  tx: Tx,
  input: Org & { id: string; holders: readonly string[] },
) {
  await tx.execute(sql`
    update core.admission_applications
    set matches = jsonb_set(matches, '{documentHolders}', ${JSON.stringify(input.holders)}::text::jsonb)
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid`);
}

/**
 * The next application number of a school for a year of entry. Takes a lock
 * on the school's numbering, so two sent at once never share one.
 */
export async function nextReferenceCount(
  tx: Tx,
  input: Org & { prefix: string },
): Promise<number> {
  await tx.execute(
    sql`select app.lock(${`admission_reference:${input.orgId}:${input.prefix}`})`,
  );
  const [row] = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from core.admission_applications
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and reference like ${`${input.prefix}-%`}`);
  return (row?.n ?? 0) + 1;
}

/** Sends a draft: its answers as checked, its number, and what matching found. Null when it changed. */
export async function markSubmitted(
  tx: Tx,
  input: Org & {
    id: string;
    expectedVersion: number;
    reference: string;
    locale: "en" | "ar";
    answers: EnquiryAnswer[];
    matches: ApplicationMatches;
    priorities: PriorityRule[];
    additionalNeeds: boolean;
    enquiryId: string | null;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.admission_applications
    set state = 'submitted', state_changed_at = statement_timestamp(),
      submitted_at = statement_timestamp(), reference = ${input.reference}, locale = ${input.locale},
      answers = ${JSON.stringify(input.answers)}::text::jsonb,
      matches = ${JSON.stringify(input.matches)}::text::jsonb,
      priorities = ${textArray(input.priorities)}, additional_needs = ${input.additionalNeeds},
      enquiry_id = ${input.enquiryId}::uuid
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and version = ${input.expectedVersion} and status = 'active'
      and state = 'draft'
    returning version`);
  return row?.version ?? null;
}

/** Moves an application on; null when it changed meanwhile. */
export async function setApplicationState(
  tx: Tx,
  input: Org & {
    id: string;
    expectedVersion: number;
    from: ApplicationState;
    state: ApplicationState;
    exitReason: string | null;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.admission_applications
    set state = ${input.state}, exit_reason = ${input.exitReason},
      state_changed_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and version = ${input.expectedVersion} and status = 'active'
      and state = ${input.from}
    returning version`);
  return row?.version ?? null;
}

export interface ApplicationListRow {
  id: string;
  version: number;
  reference: string | null;
  state: ApplicationState;
  stateChangedAt: string;
  submittedAt: string | null;
  intakeId: string;
  gradeEn: string | null;
  gradeAr: string | null;
  applicantEn: string | null;
  applicantAr: string | null;
  birthDate: string | null;
  familyEn: string | null;
  familyAr: string | null;
  priorities: PriorityRule[];
  /** Required checklist steps not yet verified or waived. */
  outstanding: number;
}

export interface ApplicationList {
  rows: ApplicationListRow[];
  total: number;
  counts: Record<ApplicationState, number>;
}

/**
 * Applications of a school for the office: one intake or all of a year,
 * in one state, live ones or all, narrowed by words in the child's or the
 * family's name or the number; most recently sent first, drafts last.
 */
export async function listApplications(
  tx: Tx,
  input: Org & {
    query: ApplicationListQuery;
    yearId: string | null;
    limit: number;
    offset: number;
  },
): Promise<ApplicationList> {
  const { query } = input;
  const q = query.q ? `%${escapeLike(query.q)}%` : null;
  const narrowed = sql`a.tenant_id = ${input.tenantId}::uuid and a.org_id = ${input.orgId}::uuid
    and a.status = 'active'
    and (${query.intake || null}::uuid is null or a.intake_id = ${query.intake || null}::uuid)
    and (${input.yearId}::uuid is null or i.school_year_id = ${input.yearId}::uuid)
    and (${q}::text is null or c.full_name_en ilike ${q} or c.full_name_ar ilike ${q}
      or p.full_name_en ilike ${q} or p.full_name_ar ilike ${q} or a.reference ilike ${q})`;
  const from = sql`from core.admission_applications a
    join core.admission_intakes i on i.tenant_id = a.tenant_id and i.id = a.intake_id
    join core.users c on c.tenant_id = a.tenant_id and c.id = a.applicant_user_id
    join core.users p on p.tenant_id = a.tenant_id and p.id = a.family_user_id`;
  const counted = await tx.execute<{ state: ApplicationState; n: number }>(sql`
    select a.state, count(*)::int as n ${from} where ${narrowed} group by a.state`);
  const counts = Object.fromEntries(
    counted.map((row) => [row.state, row.n]),
  ) as Record<ApplicationState, number>;
  const inView = (state: string) =>
    query.state === "all" ||
    (query.state === "live"
      ? (LIVE_STATES as readonly string[]).includes(state)
      : query.state === state);
  const total = counted
    .filter((row) => inView(row.state))
    .reduce((sum, row) => sum + row.n, 0);
  const inState =
    query.state === "all"
      ? sql``
      : sql`and a.state = any(${textArray(
          query.state === "live" ? LIVE_STATES : [query.state],
        )})`;
  const rows = await tx.execute<{
    id: string;
    version: number;
    reference: string | null;
    state: ApplicationState;
    state_changed_at: string;
    submitted_at: string | null;
    intake_id: string;
    grade_en: string | null;
    grade_ar: string | null;
    applicant_en: string | null;
    applicant_ar: string | null;
    birth_date: string | null;
    family_en: string | null;
    family_ar: string | null;
    priorities: PriorityRule[];
    outstanding: number;
  }>(sql`
    select a.id, a.version, a.reference, a.state, ${isoOf(sql`a.state_changed_at`)} as state_changed_at,
      case when a.submitted_at is null then null else ${isoOf(sql`a.submitted_at`)} end as submitted_at,
      a.intake_id, coalesce(o.label_en, g.label_en) as grade_en, coalesce(o.label_ar, g.label_ar) as grade_ar,
      c.full_name_en as applicant_en, c.full_name_ar as applicant_ar, c.birth_date::text as birth_date,
      p.full_name_en as family_en, p.full_name_ar as family_ar, a.priorities,
      (select count(*)::int from core.admission_items t where t.tenant_id = a.tenant_id
        and t.application_id = a.id and t.status = 'active' and t.required
        and t.state not in ('verified', 'waived')) as outstanding
    ${from}
    join core.descriptors g on g.tenant_id = i.tenant_id and g.id = i.grade_level_descriptor_id
    left join lateral (
      select x.label_en, x.label_ar from core.descriptor_overrides x
      where x.tenant_id = i.tenant_id and x.descriptor_id = g.id and x.org_id = i.org_id
        and x.status = 'active' limit 1
    ) o on true
    where ${narrowed} ${inState}
    order by a.submitted_at desc nulls last, a.created_at desc, a.id desc
    limit ${input.limit} offset ${input.offset}`);
  return {
    total,
    counts,
    rows: rows.map((row) => ({
      id: row.id,
      version: row.version,
      reference: row.reference,
      state: row.state,
      stateChangedAt: row.state_changed_at,
      submittedAt: row.submitted_at,
      intakeId: row.intake_id,
      gradeEn: row.grade_en,
      gradeAr: row.grade_ar,
      applicantEn: row.applicant_en,
      applicantAr: row.applicant_ar,
      birthDate: row.birth_date,
      familyEn: row.family_en,
      familyAr: row.family_ar,
      priorities: row.priorities,
      outstanding: row.outstanding,
    })),
  };
}

export interface ItemRow {
  id: string;
  version: number;
  itemKey: string;
  kind: ChecklistKind;
  labelEn: string;
  labelAr: string;
  required: boolean;
  state: ItemState;
  stateChangedAt: string;
}

export async function itemsOf(
  tx: Tx,
  input: { tenantId: string; applicationIds: readonly string[] },
): Promise<(ItemRow & { applicationId: string })[]> {
  if (input.applicationIds.length === 0) return [];
  const rows = await tx.execute<{
    id: string;
    version: number;
    application_id: string;
    item_key: string;
    kind: ChecklistKind;
    label_en: string;
    label_ar: string;
    required: boolean;
    state: ItemState;
    state_changed_at: string;
  }>(sql`
    select id, version, application_id, item_key, kind, label_en, label_ar, required, state,
      ${isoOf(sql`state_changed_at`)} as state_changed_at
    from core.admission_items
    where tenant_id = ${input.tenantId}::uuid and application_id = any(${uuidArray(input.applicationIds)})
      and status = 'active'
    order by position, id`);
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    applicationId: row.application_id,
    itemKey: row.item_key,
    kind: row.kind,
    labelEn: row.label_en,
    labelAr: row.label_ar,
    required: row.required,
    state: row.state,
    stateChangedAt: row.state_changed_at,
  }));
}

/** Moves a checklist step; `from` guards against a move made meanwhile. */
export async function setItemState(
  tx: Tx,
  input: {
    tenantId: string;
    applicationId: string;
    id: string;
    expectedVersion?: number;
    from: readonly ItemState[];
    state: ItemState;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.admission_items
    set state = ${input.state}, state_changed_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and application_id = ${input.applicationId}::uuid
      and id = ${input.id}::uuid and status = 'active' and state = any(${textArray(input.from)})
      and (${input.expectedVersion ?? null}::int is null or version = ${input.expectedVersion ?? null}::int)
    returning version`);
  return row?.version ?? null;
}

export interface ApplicationEntry {
  id: string;
  kind: ApplicationEntryKind;
  body: string;
  details: Record<string, string | boolean | null>;
  author: { id: string; nameEn: string | null; nameAr: string | null } | null;
  createdAt: string;
}

export async function insertApplicationEntry(
  tx: Tx,
  input: Org & {
    applicationId: string;
    kind: ApplicationEntryKind;
    body: string;
    details?: Record<string, string | boolean | null>;
    authorUserId: string | null;
  },
): Promise<{ id: string; createdAt: string }> {
  const [row] = await tx.execute<{ id: string; created_at: string }>(sql`
    insert into core.admission_entries (tenant_id, org_id, application_id, kind, body, details,
      author_user_id)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.applicationId}::uuid, ${input.kind},
      ${input.body}, ${JSON.stringify(input.details ?? {})}::text::jsonb, ${input.authorUserId}::uuid)
    returning id, ${isoOf(sql`created_at`)} as created_at`);
  if (!row) throw new Error("The entry was not recorded");
  return { id: row.id, createdAt: row.created_at };
}

export async function applicationEntries(
  tx: Tx,
  input: { tenantId: string; applicationId: string },
): Promise<ApplicationEntry[]> {
  const rows = await tx.execute<{
    id: string;
    kind: ApplicationEntryKind;
    body: string;
    details: ApplicationEntry["details"];
    author_id: string | null;
    author_en: string | null;
    author_ar: string | null;
    created_at: string;
  }>(sql`
    select n.id, n.kind, n.body, n.details, n.author_user_id as author_id,
      u.full_name_en as author_en, u.full_name_ar as author_ar,
      ${isoOf(sql`n.created_at`)} as created_at
    from core.admission_entries n
    left join core.users u on u.tenant_id = n.tenant_id and u.id = n.author_user_id
    where n.tenant_id = ${input.tenantId}::uuid and n.application_id = ${input.applicationId}::uuid
    order by n.created_at, n.id`);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    body: row.body,
    details: row.details,
    author: row.author_id
      ? { id: row.author_id, nameEn: row.author_en, nameAr: row.author_ar }
      : null,
    createdAt: row.created_at,
  }));
}

/**
 * The family's most recent open enquiry at the school, by the address or
 * number they applied with, which the application is the outcome of.
 */
export async function enquiryToConvert(
  tx: Tx,
  input: Org & { email: string; phone: string },
): Promise<{ id: string; version: number; state: string } | null> {
  if (!input.email && !input.phone) return null;
  const [row] = await tx.execute<{
    id: string;
    version: number;
    state: string;
  }>(sql`
    select id, version, state from core.site_enquiries
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid and status = 'active'
      and state in ('open', 'in_progress') and applicant_user_id is null
      and ((${input.email} <> '' and lower(email) = lower(${input.email}))
        or (${input.phone} <> '' and phone = ${input.phone}))
    order by created_at desc limit 1`);
  return row ?? null;
}

/** Links an enquiry to the family and child it became and marks it converted. */
export async function convertEnquiry(
  tx: Tx,
  input: Org & {
    id: string;
    expectedVersion: number;
    familyUserId: string;
    applicantUserId: string;
  },
): Promise<boolean> {
  const rows = await tx.execute(sql`
    update core.site_enquiries
    set state = 'converted', state_changed_at = statement_timestamp(), closed_reason = null,
      family_user_id = ${input.familyUserId}::uuid, applicant_user_id = ${input.applicantUserId}::uuid
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and version = ${input.expectedVersion} and status = 'active'
    returning id`);
  return rows.length > 0;
}

/**
 * Current students who share a parent with any of the people given: the
 * brothers and sisters an applicant would join.
 */
export async function currentChildrenOf(
  tx: Tx,
  input: Org & { parentIds: readonly string[]; today: string },
): Promise<{ id: string; nameEn: string | null; nameAr: string | null }[]> {
  if (input.parentIds.length === 0) return [];
  const rows = await tx.execute<{
    id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
  }>(sql`
    select distinct u.id, u.full_name_en, u.full_name_ar
    from core.user_relationships r
    join core.users u on u.tenant_id = r.tenant_id and u.id = r.student_user_id and u.status = 'active'
    join core.user_roles s on s.tenant_id = r.tenant_id and s.user_id = r.student_user_id
      and s.role = 'student' and s.status = 'active' and s.org_id = ${input.orgId}::uuid
      and s.valid_during @> ${input.today}::date
    where r.tenant_id = ${input.tenantId}::uuid and r.related_user_id = any(${uuidArray(input.parentIds)})
      and r.status = 'active' and r.valid_during @> ${input.today}::date
      and r.relation_meaning in ('mother', 'father', 'step_parent', 'guardian', 'unspecified')
    limit 10`);
  return rows.map((row) => ({
    id: row.id,
    nameEn: row.full_name_en,
    nameAr: row.full_name_ar,
  }));
}

/** Whether any of the people holds a current staff role at the school. */
export async function holdsStaffRole(
  tx: Tx,
  input: Org & {
    userIds: readonly string[];
    today: string;
    roles: readonly string[];
  },
): Promise<boolean> {
  if (input.userIds.length === 0) return false;
  const [row] = await tx.execute<{ found: boolean }>(sql`
    select exists (
      select 1 from core.user_roles
      where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
        and user_id = any(${uuidArray(input.userIds)}) and status = 'active'
        and role = any(${textArray(input.roles)}) and valid_during @> ${input.today}::date
    ) as found`);
  return row?.found ?? false;
}

/**
 * Opens the applying family's role at the school from today, unless one is
 * held already. Answers whether it opened one.
 */
export async function openApplicantRole(
  tx: Tx,
  input: Org & { userId: string; today: string },
): Promise<boolean> {
  const rows = await tx.execute(sql`
    insert into core.user_roles (tenant_id, user_id, org_id, org_type, role, valid_during, source)
    select ${input.tenantId}::uuid, ${input.userId}::uuid, ${input.orgId}::uuid, 'school',
      'applicant_family', daterange(${input.today}::date, null, '[)'), 'derived'
    where not exists (
      select 1 from core.user_roles
      where tenant_id = ${input.tenantId}::uuid and user_id = ${input.userId}::uuid
        and org_id = ${input.orgId}::uuid and role = 'applicant_family' and status = 'active'
        and (upper_inf(valid_during) or upper(valid_during) > ${input.today}::date))
    returning id`);
  return rows.length > 0;
}

/**
 * Children who applied and never came, whose every application ended
 * unsuccessfully: the people the school's retention period reaches, each
 * counted from the latest closing day of the intakes they applied to.
 */
export async function unsuccessfulApplicants(
  tx: Tx,
  input: Org,
): Promise<
  {
    userId: string;
    fullNameEn: string | null;
    fullNameAr: string | null;
    birthDate: string | null;
    closedOn: string;
  }[]
> {
  const rows = await tx.execute<{
    user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    birth_date: string | null;
    closed_on: string;
  }>(sql`
    select u.id as user_id, u.full_name_en, u.full_name_ar, u.birth_date::text as birth_date,
      max(i.closes_on)::text as closed_on
    from core.admission_applications a
    join core.admission_intakes i on i.tenant_id = a.tenant_id and i.id = a.intake_id
    join core.users u on u.tenant_id = a.tenant_id and u.id = a.applicant_user_id
      and u.status = 'active' and u.erased_at is null
    where a.tenant_id = ${input.tenantId}::uuid and a.org_id = ${input.orgId}::uuid
      and a.status = 'active'
      and not exists (select 1 from core.user_roles r where r.tenant_id = a.tenant_id
        and r.user_id = a.applicant_user_id and r.status = 'active')
    group by u.tenant_id, u.id
    having bool_and(a.state in ('declined_by_school', 'withdrawn', 'offer_declined', 'offer_expired'))
    order by max(i.closes_on), u.id`);
  return rows.map((row) => ({
    userId: row.user_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    birthDate: row.birth_date,
    closedOn: row.closed_on,
  }));
}

/** The application a checklist step belongs to, and who made it. */
export async function itemHolder(
  tx: Tx,
  input: { tenantId: string; itemId: string },
): Promise<{
  applicationId: string;
  familyUserId: string;
  orgId: string;
} | null> {
  const [row] = await tx.execute<{
    application_id: string;
    family_user_id: string;
    org_id: string;
  }>(sql`
    select t.application_id, a.family_user_id, a.org_id
    from core.admission_items t
    join core.admission_applications a on a.tenant_id = t.tenant_id and a.id = t.application_id
      and a.status = 'active'
    where t.tenant_id = ${input.tenantId}::uuid and t.id = ${input.itemId}::uuid and t.status = 'active'`);
  return row
    ? {
        applicationId: row.application_id,
        familyUserId: row.family_user_id,
        orgId: row.org_id,
      }
    : null;
}

/**
 * Who a sign-in name is kept for, and the state of their account: a family
 * that registered and has not yet used the link, or anyone else.
 */
export async function holderOfName(
  tx: Tx,
  input: { tenantId: string; loginName: string },
): Promise<{ userId: string; accountState: string | null } | null> {
  const [row] = await tx.execute<{ user_id: string; state: string | null }>(sql`
    select u.id as user_id, a.state
    from core.users u
    left join core.accounts a on a.tenant_id = u.tenant_id and a.user_id = u.id and a.status = 'active'
    where u.tenant_id = ${input.tenantId}::uuid and u.username = ${input.loginName}
      and u.status = 'active'`);
  return row ? { userId: row.user_id, accountState: row.state } : null;
}

/** Names a family on the open enquiries they made with an address, before any applicant; answers which. */
export async function linkEnquiriesToFamily(
  tx: Tx,
  input: Org & { email: string; familyUserId: string },
): Promise<string[]> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.site_enquiries set family_user_id = ${input.familyUserId}::uuid
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and status = 'active' and family_user_id is null and email <> ''
      and lower(email) = lower(${input.email}) and state in ('open', 'in_progress')
    returning id`);
  return rows.map((row) => row.id);
}
