import type { ErasureBasis } from "@faridalms/domain/privacy";
import type { SQL } from "drizzle-orm";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { erasureApprovals, erasureItems } from "../tables/documents";
import { uuidArray } from "./sql";

type Tx = CellTransaction;

/** What an erasure destroys beyond the person's own rows. */
export interface ErasurePlan {
  documents: string[];
  files: string[];
}

/**
 * The documents and files erasing a person takes with them: the drafts and
 * handed-in copies of their work, the files those hold, what they recorded,
 * drew or built to answer a lesson, their photo, and for an applicant the
 * letters their family was sent and the documents the application held. A file another record
 * still needs (published, kept as consent evidence, about someone else, or
 * placed in a document that is not being erased) stays.
 */
export async function erasurePlan(
  tx: Tx,
  input: { tenantId: string; subjectUserId: string },
): Promise<ErasurePlan> {
  const t = input.tenantId;
  const s = input.subjectUserId;
  const documents = await tx.execute<{ id: string }>(sql`
    select d.id from core.documents d
    where d.tenant_id = ${t}::uuid and d.status = 'active'
      and ((d.host_type = 'submission' and d.host_id in (
              select id from core.submissions where tenant_id = ${t}::uuid and student_user_id = ${s}::uuid))
        or (d.host_type = 'submission_attempt' and d.host_id in (
              select id from core.submission_attempts where tenant_id = ${t}::uuid and student_user_id = ${s}::uuid))
        or (d.host_type = 'admission_letter' and d.host_id in (
              select l.id from core.admission_letters l
              join core.admission_applications a on a.tenant_id = l.tenant_id and a.id = l.application_id
              where l.tenant_id = ${t}::uuid and a.applicant_user_id = ${s}::uuid)))`);
  const documentIds = documents.map((row) => row.id);
  const files = await tx.execute<{ id: string }>(sql`
    select f.id from core.files f
    where f.tenant_id = ${t}::uuid and f.status = 'active'
      and (f.id = (select photo_file_id from core.users where tenant_id = ${t}::uuid and id = ${s}::uuid)
        or (f.host_type = 'submission' and f.host_id in (
              select id from core.submissions where tenant_id = ${t}::uuid and student_user_id = ${s}::uuid))
        or (f.host_type = 'submission_attempt' and f.host_id in (
              select id from core.submission_attempts where tenant_id = ${t}::uuid and student_user_id = ${s}::uuid))
        or (f.host_type = 'lesson_answer' and f.uploaded_by_user_id = ${s}::uuid)
        or (f.host_type = 'admission_item' and f.host_id in (
              select i.id from core.admission_items i
              join core.admission_applications a on a.tenant_id = i.tenant_id and a.id = i.application_id
              where i.tenant_id = ${t}::uuid and a.applicant_user_id = ${s}::uuid)))
      and f.purpose not in ('health_report', 'evidence', 'legal_document')
      and not exists (select 1 from core.file_publications p where p.tenant_id = f.tenant_id and p.file_id = f.id)
      and not exists (select 1 from core.consent_records c where c.tenant_id = f.tenant_id and c.evidence_file_id = f.id)
      and not exists (select 1 from core.file_subjects j where j.tenant_id = f.tenant_id and j.file_id = f.id
                        and j.user_id <> ${s}::uuid)
      and not exists (select 1 from core.document_files l where l.tenant_id = f.tenant_id and l.file_id = f.id
                        and l.document_id <> all(${uuidArray(documentIds)}))
      and not exists (select 1 from core.orgs o where o.tenant_id = f.tenant_id and o.logo_file_id = f.id)
      and not exists (select 1 from core.users u where u.tenant_id = f.tenant_id and u.photo_file_id = f.id
                        and u.id <> ${s}::uuid)`);
  return {
    documents: documentIds,
    files: files.map((row) => row.id),
  };
}

/** Records the approval and what it covers, in the ledger; it is never changed. */
export async function approveErasure(
  tx: Tx,
  input: {
    tenantId: string;
    subjectUserId: string;
    basis: ErasureBasis;
    requestReference: string | null;
    approvedByUserId: string;
    plan: ErasurePlan;
  },
): Promise<string> {
  const [approval] = await tx
    .insert(erasureApprovals)
    .values({
      tenantId: input.tenantId,
      subjectUserId: input.subjectUserId,
      basis: input.basis,
      requestReference: input.requestReference,
      approvedByUserId: input.approvedByUserId,
    })
    .returning({ id: erasureApprovals.id });
  if (!approval) throw new Error("erasure approval not inserted");
  const items = [
    ...input.plan.documents.map((objectId) => ({
      objectType: "document" as const,
      objectId,
    })),
    ...input.plan.files.map((objectId) => ({
      objectType: "file" as const,
      objectId,
    })),
  ];
  if (items.length)
    await tx.insert(erasureItems).values(
      items.map((item) => ({
        tenantId: input.tenantId,
        approvalId: approval.id,
        ...item,
      })),
    );
  return approval.id;
}

export interface ErasureResult {
  /** Rows changed or removed, by table, as proof of what was done. */
  counts: Record<string, number>;
  /** Stored objects to remove once the erasure has committed. */
  storageKeys: string[];
}

/**
 * Erases an approved person, as the `retention` role, in one transaction:
 * rows that must stay for the school's records are tombstoned with their
 * personal columns nulled; everything that is only about the person, and
 * every listed document and file, is redacted or deleted. Row
 * level security admits each statement only while the approval stands and no
 * legal hold names the person, so a hold placed meanwhile stops it.
 */
export async function eraseSubject(
  tx: Tx,
  input: { tenantId: string; subjectUserId: string; emptyContent: object },
): Promise<ErasureResult> {
  const t = input.tenantId;
  const s = input.subjectUserId;
  const counts: Record<string, number> = {};
  const run = async (name: string, statement: SQL) => {
    const rows = await tx.execute(statement);
    counts[name] = (counts[name] ?? 0) + rows.length;
  };
  const purpose = (value: string) =>
    tx.execute(sql`select set_config('app.purpose', ${value}, true)`);
  const accounts = sql`(select id from core.accounts where tenant_id = ${t}::uuid and user_id = ${s}::uuid)`;
  const relationships = sql`(select id from core.user_relationships where tenant_id = ${t}::uuid
    and (student_user_id = ${s}::uuid or related_user_id = ${s}::uuid))`;
  const listed = (type: "document" | "file") =>
    sql`(select i.object_id from core.erasure_items i
          join core.erasure_approvals a on a.tenant_id = i.tenant_id and a.id = i.approval_id
          where i.tenant_id = ${t}::uuid and a.subject_user_id = ${s}::uuid and i.object_type = ${type})`;
  /** Tombstones then deletes, the order the erase-and-delete policies need. */
  const remove = async (name: string, table: SQL, where: SQL) => {
    await tx.execute(
      sql`update ${table} set status = 'tobedeleted', metadata = '{}' where tenant_id = ${t}::uuid and ${where}`,
    );
    await run(
      name,
      sql`delete from ${table} where tenant_id = ${t}::uuid and status = 'tobedeleted' and ${where} returning 1`,
    );
  };
  const tombstone = (name: string, table: SQL, where: SQL) =>
    run(
      name,
      sql`update ${table} set status = 'tobedeleted', metadata = '{}' where tenant_id = ${t}::uuid and status = 'active' and ${where} returning 1`,
    );

  await purpose("custody");
  await remove(
    "relationship_restrictions",
    sql`core.relationship_restrictions`,
    sql`relationship_id in ${relationships}`,
  );
  await purpose("health");
  await remove(
    "health_records",
    sql`health.records`,
    sql`student_user_id = ${s}::uuid`,
  );
  await purpose("demographics");
  await run(
    "demographics",
    sql`update core.demographics set status = 'tobedeleted', metadata = '{}', birth_country_code = null,
          birth_city = null, nationality_codes = '{}', religion_descriptor_id = null, home_languages = '{}'
        where tenant_id = ${t}::uuid and user_id = ${s}::uuid returning 1`,
  );
  await purpose("");

  await run(
    "sessions",
    sql`delete from core.sessions where tenant_id = ${t}::uuid and account_id in ${accounts} returning 1`,
  );
  await run(
    "idempotency_keys",
    sql`delete from core.idempotency_keys where tenant_id = ${t}::uuid and account_id in ${accounts} returning 1`,
  );
  for (const table of ["login_identities", "passkeys", "devices"] as const)
    await remove(
      table,
      sql`core.${sql.identifier(table)}`,
      sql`account_id in ${accounts}`,
    );
  await tombstone("accounts", sql`core.accounts`, sql`user_id = ${s}::uuid`);

  for (const table of [
    "external_ids",
    "contact_points",
    "user_preferences",
    "calendar_feeds",
    "file_subjects",
  ] as const)
    await remove(
      table,
      sql`core.${sql.identifier(table)}`,
      sql`user_id = ${s}::uuid`,
    );
  await remove(
    "saved_views",
    sql`core.saved_views`,
    sql`owner_user_id = ${s}::uuid`,
  );

  await tombstone(
    "student_school_years",
    sql`core.student_school_years`,
    sql`student_user_id = ${s}::uuid`,
  );
  await tombstone(
    "user_roles",
    sql`core.user_roles`,
    sql`user_id = ${s}::uuid`,
  );
  await tombstone(
    "user_relationships",
    sql`core.user_relationships`,
    sql`(student_user_id = ${s}::uuid or related_user_id = ${s}::uuid)`,
  );
  await tombstone(
    "enrollments",
    sql`core.enrollments`,
    sql`user_id = ${s}::uuid`,
  );
  await run(
    "admission_events",
    sql`update core.admission_events set status = 'tobedeleted', metadata = '{}', location = '', result = ''
        where tenant_id = ${t}::uuid and status = 'active' and application_id in (
          select id from core.admission_applications
          where tenant_id = ${t}::uuid and applicant_user_id = ${s}::uuid)
        returning 1`,
  );
  await run(
    "admission_applications",
    sql`update core.admission_applications set status = 'tobedeleted', metadata = '{}',
          form = '{}', answers = '[]', matches = '{}'
        where tenant_id = ${t}::uuid and applicant_user_id = ${s}::uuid and status = 'active'
        returning 1`,
  );

  const content = JSON.stringify(input.emptyContent);
  await run(
    "documents",
    sql`update core.documents set status = 'tobedeleted', metadata = '{}', content = ${content}::text::jsonb,
          plain_text = '', ydoc = null
        where tenant_id = ${t}::uuid and id in ${listed("document")} returning 1`,
  );
  await run(
    "document_translations",
    sql`update core.document_translations set status = 'tobedeleted', metadata = '{}',
          content = ${content}::text::jsonb, plain_text = ''
        where tenant_id = ${t}::uuid and document_id in ${listed("document")} returning 1`,
  );
  await run(
    "document_versions",
    sql`update core.document_versions set content = '{}', plain_text = '', ydoc_snapshot = null,
          redacted_at = statement_timestamp()
        where tenant_id = ${t}::uuid and document_id in ${listed("document")} and redacted_at is null
        returning 1`,
  );
  await remove(
    "document_files",
    sql`core.document_files`,
    sql`document_id in ${listed("document")}`,
  );

  await run(
    "users",
    sql`update core.users set status = 'tobedeleted', metadata = '{}', username = null,
          given_name_ar = null, middle_name_ar = null, family_name_ar = null, full_name_ar = null,
          given_name_en = null, middle_name_en = null, family_name_en = null, full_name_en = null,
          preferred_given_name = null, preferred_middle_name = null, preferred_family_name = null,
          birth_date = null, birth_date_source = null, sex_descriptor_id = null, photo_file_id = null,
          preferred_locale = null, primary_org_id = null, erased_at = statement_timestamp()
        where tenant_id = ${t}::uuid and id = ${s}::uuid returning 1`,
  );

  // What the student answered, said and built in lessons and quizzes. The
  // answers stay as rows for the marks a class's figures are counted from,
  // emptied of the answer and of what the teacher wrote back; the rest is
  // only about the student.
  await run(
    "lesson_responses",
    sql`update core.lesson_responses set response = '{}', feedback = null,
          redacted_at = statement_timestamp()
        where tenant_id = ${t}::uuid and student_user_id = ${s}::uuid and redacted_at is null
        returning 1`,
  );
  // What they wrote in discussions goes; the post stays empty in its
  // place, so the replies under it keep their thread.
  await run(
    "discussion_posts",
    sql`update core.discussion_posts set content = '{}', plain_text = '',
          redacted_at = statement_timestamp()
        where tenant_id = ${t}::uuid and author_user_id = ${s}::uuid and redacted_at is null
        returning 1`,
  );
  await run(
    "quiz_answers",
    sql`update core.quiz_answers set status = 'tobedeleted', metadata = '{}', response = '{}',
          feedback = null
        where tenant_id = ${t}::uuid and student_user_id = ${s}::uuid returning 1`,
  );
  await run(
    "lesson_runs",
    sql`delete from core.lesson_runs where tenant_id = ${t}::uuid and student_user_id = ${s}::uuid
        returning 1`,
  );
  for (const table of [
    "lesson_code",
    "lesson_projects",
    "lesson_shares",
    "access_arrangements",
    "quiz_draws",
    "quiz_sittings",
    "standard_evidence",
    "goal_judgements",
    "module_audiences",
    "lesson_openings",
    "lti_scores",
  ] as const)
    await remove(
      table,
      sql`core.${sql.identifier(table)}`,
      sql`student_user_id = ${s}::uuid`,
    );
  // The reviews they wrote, and the ones written of their work.
  await remove(
    "peer_reviews",
    sql`core.peer_reviews`,
    sql`(reviewer_user_id = ${s}::uuid or author_user_id = ${s}::uuid)`,
  );

  const keys = await tx.execute<{ storage_key: string }>(sql`
    select storage_key from core.files where tenant_id = ${t}::uuid and id in ${listed("file")}`);
  await remove("files", sql`core.files`, sql`id in ${listed("file")}`);

  await run(
    "audit_payloads",
    sql`delete from audit.payloads where tenant_id = ${t}::uuid and subject_user_id = ${s}::uuid returning 1`,
  );
  await run(
    "activity_events",
    sql`delete from core.activity_events where tenant_id = ${t}::uuid and actor_user_id = ${s}::uuid returning 1`,
  );
  return { counts, storageKeys: keys.map((row) => row.storage_key) };
}

export interface ErasureRow {
  id: string;
  subjectUserId: string;
  basis: ErasureBasis;
  requestReference: string | null;
  approvedAt: string;
  approvedByEn: string | null;
  approvedByAr: string | null;
  erasedAt: string | null;
  items: number;
}

/** The school's approved erasures, newest first, with whether each has run. */
export async function erasuresOf(
  tx: Tx,
  scope: { tenantId: string; orgId: string },
): Promise<ErasureRow[]> {
  const rows = await tx.execute<{
    id: string;
    subject_user_id: string;
    basis: ErasureBasis;
    request_reference: string | null;
    approved_at: string;
    approved_by_en: string | null;
    approved_by_ar: string | null;
    erased_at: string | null;
    items: number;
  }>(sql`
    select a.id, a.subject_user_id, a.basis, a.request_reference, to_json(a.created_at) #>> '{}' as approved_at,
           b.full_name_en as approved_by_en, b.full_name_ar as approved_by_ar,
           to_json(u.erased_at) #>> '{}' as erased_at,
           (select count(*)::int from core.erasure_items i
             where i.tenant_id = a.tenant_id and i.approval_id = a.id) as items
    from core.erasure_approvals a
    join core.users u on u.tenant_id = a.tenant_id and u.id = a.subject_user_id
    join core.users b on b.tenant_id = a.tenant_id and b.id = a.approved_by_user_id
    where a.tenant_id = ${scope.tenantId}::uuid
      and (exists (select 1 from core.student_school_years y
                   where y.tenant_id = a.tenant_id and y.student_user_id = a.subject_user_id
                     and y.org_id = ${scope.orgId}::uuid)
           or exists (select 1 from core.user_roles r
                      where r.tenant_id = a.tenant_id and r.user_id = a.subject_user_id
                        and r.org_id = ${scope.orgId}::uuid))
    order by a.created_at desc, a.id`);
  return rows.map((row) => ({
    id: row.id,
    subjectUserId: row.subject_user_id,
    basis: row.basis,
    requestReference: row.request_reference,
    approvedAt: row.approved_at,
    approvedByEn: row.approved_by_en,
    approvedByAr: row.approved_by_ar,
    erasedAt: row.erased_at,
    items: row.items,
  }));
}
