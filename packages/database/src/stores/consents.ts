import type {
  ConsentDecision,
  ConsentMethod,
} from "@faridalms/domain/consents";

import { PHOTO_MEANINGS } from "@faridalms/domain/consents";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { isoOf, textArray, uuidArray } from "./sql";

type Tx = CellTransaction;

/** One version of the words a school asks a family to agree to for a purpose. */
export interface ConsentForm {
  id: string;
  version: number;
  purposeId: string;
  versionLabel: string;
  locale: "ar" | "en";
  documentId: string;
  publishedAt: string | null;
}

const formColumns = sql`n.id, n.version, n.purpose_descriptor_id, n.version_label, n.locale,
  n.document_id, ${isoOf(sql`n.published_at`)} as published_at`;

type FormRow = {
  id: string;
  version: number;
  purpose_descriptor_id: string;
  version_label: string;
  locale: "ar" | "en";
  document_id: string;
  published_at: string | null;
};

const formOf = (row: FormRow): ConsentForm => ({
  id: row.id,
  version: row.version,
  purposeId: row.purpose_descriptor_id,
  versionLabel: row.version_label,
  locale: row.locale,
  documentId: row.document_id,
  publishedAt: row.published_at,
});

/**
 * The school's consent forms: every draft, and the latest published version
 * of each purpose, which is the one families are asked to answer.
 */
export async function formsOf(
  tx: Tx,
  input: { tenantId: string; schoolId: string },
): Promise<{ drafts: ConsentForm[]; published: ConsentForm[] }> {
  const rows = await tx.execute<FormRow & { latest: boolean }>(sql`
    select ${formColumns},
      n.published_at is not null and n.published_at = max(n.published_at)
        over (partition by n.purpose_descriptor_id) as latest
    from core.privacy_notices n
    where n.tenant_id = ${input.tenantId}::uuid and n.org_id = ${input.schoolId}::uuid
      and n.kind = 'consent_text' and n.status = 'active'`);
  return {
    drafts: rows.filter((row) => row.published_at === null).map(formOf),
    published: rows.filter((row) => row.latest).map(formOf),
  };
}

export async function formById(
  tx: Tx,
  input: { tenantId: string; schoolId: string; id: string },
): Promise<ConsentForm | null> {
  const [row] = await tx.execute<FormRow>(sql`
    select ${formColumns} from core.privacy_notices n
    where n.tenant_id = ${input.tenantId}::uuid and n.id = ${input.id}::uuid
      and n.org_id = ${input.schoolId}::uuid and n.kind = 'consent_text' and n.status = 'active'`);
  return row ? formOf(row) : null;
}

/** The label a new draft of a purpose's form takes, and the published version it replaces. */
export async function nextVersionLabel(
  tx: Tx,
  input: { tenantId: string; schoolId: string; purposeId: string },
): Promise<{ label: string; supersedesId: string | null }> {
  const [row] = await tx.execute<{ count: number; latest: string | null }>(sql`
    select count(*)::int as count, (array_agg(n.id order by n.published_at desc))[1] as latest
    from core.privacy_notices n
    where n.tenant_id = ${input.tenantId}::uuid and n.org_id = ${input.schoolId}::uuid
      and n.kind = 'consent_text' and n.purpose_descriptor_id = ${input.purposeId}::uuid
      and n.status = 'active' and n.published_at is not null`);
  return {
    label: String((row?.count ?? 0) + 1),
    supersedesId: row?.latest ?? null,
  };
}

export async function insertForm(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    id: string;
    purposeId: string;
    locale: "ar" | "en";
    versionLabel: string;
    documentId: string;
    supersedesId: string | null;
  },
): Promise<number> {
  const [row] = await tx.execute<{ version: number }>(sql`
    insert into core.privacy_notices (tenant_id, id, kind, purpose_descriptor_id, org_id, locale,
      version_label, document_id, supersedes_id)
    values (${input.tenantId}::uuid, ${input.id}::uuid, 'consent_text', ${input.purposeId}::uuid,
      ${input.schoolId}::uuid, ${input.locale}, ${input.versionLabel}, ${input.documentId}::uuid,
      ${input.supersedesId}::uuid)
    returning version`);
  if (!row) throw new Error("consent form was not created");
  return row.version;
}

/** Changes a draft's language; a published form never changes. Null when another edit won. */
export async function updateDraft(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    locale: "ar" | "en";
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.privacy_notices set locale = ${input.locale}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active' and published_at is null
    returning version`);
  return row?.version ?? null;
}

/**
 * Publishes a draft and freezes its words, so every answer given to it keeps
 * pointing at exactly what the family read.
 */
export async function publishForm(
  tx: Tx,
  input: { tenantId: string; id: string; expectedVersion: number },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.privacy_notices set published_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active' and published_at is null
    returning version`);
  if (!row) return null;
  await tx.execute(sql`
    update core.documents set frozen_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and host_type = 'privacy_notice'
      and host_id = ${input.id}::uuid and status = 'active' and frozen_at is null`);
  return row.version;
}

export async function discardDraft(
  tx: Tx,
  input: { tenantId: string; id: string; expectedVersion: number },
): Promise<boolean> {
  const rows = await tx.execute(sql`
    update core.privacy_notices set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active' and published_at is null
    returning id`);
  if (rows.length === 0) return false;
  await tx.execute(sql`
    update core.documents set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and host_type = 'privacy_notice'
      and host_id = ${input.id}::uuid and status = 'active'`);
  return true;
}

const enrolled = (input: {
  tenantId: string;
  schoolId: string;
  today: string;
}) =>
  sql`select y.student_user_id from core.student_school_years y
    where y.tenant_id = ${input.tenantId}::uuid and y.org_id = ${input.schoolId}::uuid
      and y.status = 'active' and y.valid_during @> ${input.today}::date`;

/** How the students at school today have answered each purpose. */
export async function answerCounts(
  tx: Tx,
  input: { tenantId: string; schoolId: string; today: string },
): Promise<
  {
    purposeId: string;
    granted: number;
    refused: number;
  }[]
> {
  const rows = await tx.execute<{
    purpose_descriptor_id: string;
    granted: number;
    refused: number;
  }>(sql`
    select c.purpose_descriptor_id,
      count(*) filter (where c.decision = 'granted')::int as granted,
      count(*) filter (where c.decision <> 'granted')::int as refused
    from core.current_consents c
    where c.tenant_id = ${input.tenantId}::uuid
      and c.subject_user_id in (${enrolled(input)})
    group by c.purpose_descriptor_id`);
  return rows.map((row) => ({
    purposeId: row.purpose_descriptor_id,
    granted: row.granted,
    refused: row.refused,
  }));
}

/** One answer in the register, newest first. */
export interface ConsentAnswer {
  id: string;
  purposeId: string;
  decision: ConsentDecision;
  noticeId: string | null;
  versionLabel: string | null;
  capacity: "self" | "guardian" | "school_on_behalf";
  method: ConsentMethod;
  givenOn: string;
  recordedAt: string;
  refreshDueOn: string | null;
  note: string | null;
  evidenceFileId: string | null;
  givenBy: { id: string; nameEn: string | null; nameAr: string | null } | null;
  recordedBy: { nameEn: string | null; nameAr: string | null } | null;
}

/** Every answer given for a student, newest first; the first per purpose is the one in force. */
export async function answersFor(
  tx: Tx,
  input: { tenantId: string; studentId: string },
): Promise<ConsentAnswer[]> {
  const rows = await tx.execute<{
    id: string;
    purpose_descriptor_id: string;
    decision: ConsentDecision;
    notice_id: string | null;
    version_label: string | null;
    capacity: ConsentAnswer["capacity"];
    method: ConsentMethod;
    given_on: string;
    recorded_at: string;
    refresh_due_on: string | null;
    note: string | null;
    evidence_file_id: string | null;
    given_by_id: string | null;
    given_en: string | null;
    given_ar: string | null;
    recorded_en: string | null;
    recorded_ar: string | null;
    recorded: boolean;
  }>(sql`
    select c.id, c.purpose_descriptor_id, c.decision, c.notice_id, n.version_label, c.capacity,
      c.method, lower(c.valid_during)::text as given_on, ${isoOf(sql`c.created_at`)} as recorded_at,
      c.refresh_due_on::text as refresh_due_on, c.note, c.evidence_file_id,
      g.id as given_by_id, g.full_name_en as given_en, g.full_name_ar as given_ar,
      r.full_name_en as recorded_en, r.full_name_ar as recorded_ar,
      r.id is not null and r.id is distinct from g.id as recorded
    from core.consent_records c
    left join core.privacy_notices n on n.tenant_id = c.tenant_id and n.id = c.notice_id
    left join core.users g on g.tenant_id = c.tenant_id and g.id = c.given_by_user_id
    left join core.users r on r.tenant_id = c.tenant_id and r.id = c.recorded_by_user_id
    where c.tenant_id = ${input.tenantId}::uuid and c.subject_user_id = ${input.studentId}::uuid
    order by c.created_at desc, c.id desc`);
  return rows.map((row) => ({
    id: row.id,
    purposeId: row.purpose_descriptor_id,
    decision: row.decision,
    noticeId: row.notice_id,
    versionLabel: row.version_label,
    capacity: row.capacity,
    method: row.method,
    givenOn: row.given_on,
    recordedAt: row.recorded_at,
    refreshDueOn: row.refresh_due_on,
    note: row.note,
    evidenceFileId: row.evidence_file_id,
    givenBy: row.given_by_id
      ? { id: row.given_by_id, nameEn: row.given_en, nameAr: row.given_ar }
      : null,
    recordedBy: row.recorded
      ? { nameEn: row.recorded_en, nameAr: row.recorded_ar }
      : null,
  }));
}

/** The answers in force for several students, for a family's list of their children. */
export async function currentAnswers(
  tx: Tx,
  input: { tenantId: string; studentIds: readonly string[] },
): Promise<
  {
    studentId: string;
    purposeId: string;
    decision: ConsentDecision;
    noticeId: string | null;
    givenOn: string;
    refreshDueOn: string | null;
    givenById: string | null;
    givenByEn: string | null;
    givenByAr: string | null;
  }[]
> {
  if (input.studentIds.length === 0) return [];
  const rows = await tx.execute<{
    subject_user_id: string;
    purpose_descriptor_id: string;
    decision: ConsentDecision;
    notice_id: string | null;
    given_on: string;
    refresh_due_on: string | null;
    given_by_user_id: string | null;
    given_en: string | null;
    given_ar: string | null;
  }>(sql`
    select c.subject_user_id, c.purpose_descriptor_id, c.decision, c.notice_id,
      lower(c.valid_during)::text as given_on, c.refresh_due_on::text as refresh_due_on,
      c.given_by_user_id, g.full_name_en as given_en, g.full_name_ar as given_ar
    from core.current_consents c
    left join core.users g on g.tenant_id = c.tenant_id and g.id = c.given_by_user_id
    where c.tenant_id = ${input.tenantId}::uuid
      and c.subject_user_id = any(${uuidArray(input.studentIds)})`);
  return rows.map((row) => ({
    studentId: row.subject_user_id,
    purposeId: row.purpose_descriptor_id,
    decision: row.decision,
    noticeId: row.notice_id,
    givenOn: row.given_on,
    refreshDueOn: row.refresh_due_on,
    givenById: row.given_by_user_id,
    givenByEn: row.given_en,
    givenByAr: row.given_ar,
  }));
}

export async function insertAnswer(
  tx: Tx,
  input: {
    tenantId: string;
    studentId: string;
    purposeId: string;
    decision: ConsentDecision;
    noticeId: string | null;
    givenById: string;
    relationshipId: string;
    method: ConsentMethod;
    evidenceFileId: string | null;
    recordedById: string;
    givenOn: string;
    ageAtDecision: number | null;
    refreshDueOn: string | null;
    note: string | null;
  },
): Promise<string> {
  const written = input.method !== "verbal_recorded";
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.consent_records (tenant_id, subject_user_id, purpose_descriptor_id, decision,
      notice_id, given_by_user_id, capacity, relationship_id, legal_basis, explicit, written, method,
      evidence_file_id, recorded_by_user_id, valid_during, subject_age_at_decision, refresh_due_on, note)
    values (${input.tenantId}::uuid, ${input.studentId}::uuid, ${input.purposeId}::uuid,
      ${input.decision}, ${input.noticeId}::uuid, ${input.givenById}::uuid, 'guardian',
      ${input.relationshipId}::uuid, 'consent', true, ${written}, ${input.method},
      ${input.evidenceFileId}::uuid, ${input.recordedById}::uuid,
      daterange(${input.givenOn}::date, null, '[)'), ${input.ageAtDecision},
      ${input.refreshDueOn}::date, ${input.note})
    returning id`);
  if (!row) throw new Error("consent was not recorded");
  return row.id;
}

/** The adults who may answer for a student today: confirmed legal guardians with full rights. */
export async function answerersOf(
  tx: Tx,
  input: { tenantId: string; studentIds: readonly string[]; today: string },
): Promise<
  {
    relationshipId: string;
    studentId: string;
    userId: string;
    nameEn: string | null;
    nameAr: string | null;
    /** Whether the school may ask them in the portal: `app.guardian_permits` for contact. */
    contactable: boolean;
  }[]
> {
  if (input.studentIds.length === 0) return [];
  const rows = await tx.execute<{
    id: string;
    student_user_id: string;
    related_user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    contactable: boolean;
  }>(sql`
    select r.id, r.student_user_id, r.related_user_id, u.full_name_en, u.full_name_ar,
           app.guardian_permits(r, ${input.today}::date, 'contact') as contactable
    from core.user_relationships r
    join core.users u on u.tenant_id = r.tenant_id and u.id = r.related_user_id and u.status = 'active'
    where r.tenant_id = ${input.tenantId}::uuid and r.student_user_id = any(${uuidArray(input.studentIds)})
      and r.status = 'active' and r.valid_during @> ${input.today}::date
      and r.legal_guardian and r.verified_at is not null and r.educational_rights = 'full'
    order by r.contact_priority nulls last, u.full_name_en, u.full_name_ar`);
  return rows.map((row) => ({
    relationshipId: row.id,
    studentId: row.student_user_id,
    userId: row.related_user_id,
    nameEn: row.full_name_en,
    nameAr: row.full_name_ar,
    contactable: row.contactable,
  }));
}

/** Every student at school today, for asking their families when a form goes out. */
export async function enrolledStudents(
  tx: Tx,
  input: { tenantId: string; schoolId: string; today: string },
): Promise<string[]> {
  const rows = await tx.execute<{ student_user_id: string }>(sql`
    select distinct student_user_id from (${enrolled(input)}) s`);
  return rows.map((row) => row.student_user_id);
}

/**
 * The students among these whose family said no to their picture being
 * shown, for whom staff should not take or use photos.
 */
export async function photoRefusals(
  tx: Tx,
  input: { tenantId: string; studentIds: readonly string[] },
): Promise<Set<string>> {
  if (input.studentIds.length === 0) return new Set();
  const rows = await tx.execute<{ subject_user_id: string }>(sql`
    select distinct c.subject_user_id from core.current_consents c
    join core.descriptors d on d.tenant_id = c.tenant_id and d.id = c.purpose_descriptor_id
    where c.tenant_id = ${input.tenantId}::uuid
      and c.subject_user_id = any(${uuidArray(input.studentIds)})
      and d.system_meaning = any(${textArray(PHOTO_MEANINGS)}) and c.decision <> 'granted'`);
  return new Set(rows.map((row) => row.subject_user_id));
}
