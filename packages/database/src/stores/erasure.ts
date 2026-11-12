import type { ErasureBasis } from "@faridalms/domain/privacy";
import type { SQL } from "drizzle-orm";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { withPurpose } from "../context";
import { erasureApprovals, erasureItems } from "../tables/documents";
import { uuidArray } from "./sql";

type Tx = CellTransaction;

/** What an erasure destroys beyond the person's own rows. */
export interface ErasurePlan {
  documents: string[];
  files: string[];
  /** Conversations only about the subject: their enquiries' and their own as an outside contact. */
  threads: string[];
  enquiries: string[];
}

/**
 * The conversations and enquiries that are only about an outside contact,
 * and the documents and files of what was written in them and of what the
 * contact wrote elsewhere: a conversation goes whole when the contact is
 * the only one outside the school in it.
 */
async function conversationPlan(
  tx: Tx,
  input: { tenantId: string; contacts: SQL },
): Promise<ErasurePlan> {
  const t = input.tenantId;
  const threads = await tx.execute<{ id: string }>(sql`
    select distinct m.thread_id as id from core.thread_members m
    join core.message_threads h on h.tenant_id = m.tenant_id and h.id = m.thread_id
      and h.mailbox is not null
    where m.tenant_id = ${t}::uuid and m.contact_id in ${input.contacts}
      and not exists (select 1 from core.thread_members o
        where o.tenant_id = m.tenant_id and o.thread_id = m.thread_id and o.contact_id is not null
          and o.contact_id not in ${input.contacts})`);
  const threadIds = threads.map((row) => row.id);
  const enquiries = await tx.execute<{ id: string }>(sql`
    select id from core.site_enquiries
    where tenant_id = ${t}::uuid and thread_id = any(${uuidArray(threadIds)})`);
  const entries = sql`(select x.id from core.messages x where x.tenant_id = ${t}::uuid
    and (x.thread_id = any(${uuidArray(threadIds)}) or x.author_contact_id in ${input.contacts}))`;
  const documents = await tx.execute<{ id: string }>(sql`
    select id from core.documents
    where tenant_id = ${t}::uuid and host_type = 'message' and host_id in ${entries}`);
  const files = await tx.execute<{ id: string }>(sql`
    select id from core.files
    where tenant_id = ${t}::uuid and status = 'active' and host_type = 'message'
      and host_id in ${entries}`);
  return {
    documents: documents.map((row) => row.id),
    files: files.map((row) => row.id),
    threads: threadIds,
    enquiries: enquiries.map((row) => row.id),
  };
}

/** A contact and the contacts merged into it: one family, by every address it wrote from. */
const contactAndMerged = (tenantId: string, contactId: string) =>
  sql`(select id from core.message_contacts where tenant_id = ${tenantId}::uuid
    and (id = ${contactId}::uuid or merged_into_id = ${contactId}::uuid))`;

/**
 * What erasing an outside contact who never had an account takes: their
 * conversations and enquiries as `conversationPlan` finds them.
 */
export function contactErasurePlan(
  tx: Tx,
  input: { tenantId: string; contactId: string },
): Promise<ErasurePlan> {
  return conversationPlan(tx, {
    tenantId: input.tenantId,
    contacts: contactAndMerged(input.tenantId, input.contactId),
  });
}

/**
 * The documents and files erasing a person takes with them: the drafts and
 * handed-in copies of their work, the files those hold, what they recorded,
 * drew or built to answer a lesson, their photo, and for an applicant the
 * letters their family was sent and the documents the application held,
 * and the medical reports their health records and their family's changes
 * hold. A file another record still needs (published, kept as consent
 * evidence, about someone else, or placed in a document that is not being
 * erased) stays.
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
  const reports = await withPurpose(tx, "health", (inner) =>
    inner.execute<{ id: string }>(sql`
      select f.id from core.files f
      where f.tenant_id = ${t}::uuid and f.purpose = 'health_report'
        and ((f.host_type = 'health_record' and f.host_id in (
              select id from health.records where tenant_id = ${t}::uuid and student_user_id = ${s}::uuid))
          or (f.host_type = 'health_change' and f.host_id in (
              select id from health.requested_changes
              where tenant_id = ${t}::uuid and student_user_id = ${s}::uuid)))`),
  );
  // What they wrote in conversations, and the conversations and enquiries
  // only about them as the outside contact their account was linked to.
  const contacts = sql`(select id from core.message_contacts
    where tenant_id = ${t}::uuid and user_id = ${s}::uuid)`;
  const conversations = await conversationPlan(tx, { tenantId: t, contacts });
  const written = await tx.execute<{
    document_id: string;
    file_id: string | null;
  }>(sql`
    select d.id as document_id, f.id as file_id from core.messages x
    join core.documents d on d.tenant_id = x.tenant_id and d.host_type = 'message' and d.host_id = x.id
    left join core.files f on f.tenant_id = x.tenant_id and f.host_type = 'message' and f.host_id = x.id
      and f.status = 'active'
    where x.tenant_id = ${t}::uuid and x.author_user_id = ${s}::uuid
    union all
    select d.id, f.id from core.message_drafts x
    join core.documents d on d.tenant_id = x.tenant_id and d.host_type = 'message_draft' and d.host_id = x.id
    left join core.files f on f.tenant_id = x.tenant_id and f.host_type = 'message_draft'
      and f.host_id = x.id and f.status = 'active'
    where x.tenant_id = ${t}::uuid and (x.user_id = ${s}::uuid or x.student_user_id = ${s}::uuid)`);
  return {
    documents: [
      ...new Set([
        ...documentIds,
        ...conversations.documents,
        ...written.map((row) => row.document_id),
      ]),
    ],
    files: [
      ...new Set([
        ...files.map((row) => row.id),
        ...reports.map((row) => row.id),
        ...conversations.files,
        ...written.flatMap((row) => (row.file_id ? [row.file_id] : [])),
      ]),
    ],
    threads: conversations.threads,
    enquiries: [
      ...new Set([
        ...conversations.enquiries,
        ...(
          await tx.execute<{ id: string }>(sql`
            select id from core.site_enquiries where tenant_id = ${t}::uuid
              and (enquirer_user_id = ${s}::uuid or applicant_user_id = ${s}::uuid)`)
        ).map((row) => row.id),
      ]),
    ],
  };
}

/** Records the approval and what it covers, in the ledger; it is never changed. */
export async function approveErasure(
  tx: Tx,
  input: {
    tenantId: string;
    /** A person, or with `subjectContactId`, an outside contact who never had an account. */
    subjectUserId: string | null;
    subjectContactId?: string | null;
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
      subjectContactId: input.subjectContactId ?? null,
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
    ...input.plan.threads.map((objectId) => ({
      objectType: "message_thread" as const,
      objectId,
    })),
    ...input.plan.enquiries.map((objectId) => ({
      objectType: "site_enquiry" as const,
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

/**
 * Empties what an erasure reaches in conversations: entries the subject
 * wrote, as a person or as their contact, and every entry, membership and
 * conversation the approval lists, each keeping its place so a
 * conversation still reads in order; the contacts, emptied; the enquiries
 * listed, emptied of the family's words; and the addresses mail to them
 * was sent to. Row security admits each statement only under the approval.
 */
async function eraseConversations(
  run: (name: string, statement: SQL) => Promise<void>,
  input: {
    tenantId: string;
    /** The subject's contacts: their own row, or those linked to the person. */
    contacts: SQL;
    authorUserId: string | null;
    listed: (type: "message_thread" | "site_enquiry") => SQL;
  },
) {
  const t = input.tenantId;
  const author = input.authorUserId
    ? sql`x.author_user_id = ${input.authorUserId}::uuid or`
    : sql``;
  await run(
    "messages",
    sql`update core.messages x set body = '', details = '{}', redacted_at = statement_timestamp()
        where x.tenant_id = ${t}::uuid and x.redacted_at is null
          and (${author} x.author_contact_id in ${input.contacts}
            or x.thread_id in ${input.listed("message_thread")})
        returning 1`,
  );
  await run(
    "thread_members",
    sql`update core.thread_members m set status = 'tobedeleted', metadata = '{}'
        where m.tenant_id = ${t}::uuid and m.status = 'active'
          and (${input.authorUserId ? sql`m.user_id = ${input.authorUserId}::uuid or` : sql``}
            m.contact_id in ${input.contacts} or m.thread_id in ${input.listed("message_thread")})
        returning 1`,
  );
  await run(
    "message_drafts",
    sql`update core.message_drafts d set status = 'tobedeleted', metadata = '{}', body = '',
          subject = null, recipient_ids = '{}'
        where d.tenant_id = ${t}::uuid and d.status = 'active'
          and (${input.authorUserId ? sql`d.user_id = ${input.authorUserId}::uuid or d.student_user_id = ${input.authorUserId}::uuid or` : sql``}
            d.thread_id in ${input.listed("message_thread")})
        returning 1`,
  );
  await run(
    "message_threads",
    sql`update core.message_threads set status = 'tobedeleted', metadata = '{}', subject = null
        where tenant_id = ${t}::uuid and status = 'active'
          and id in ${input.listed("message_thread")}
        returning 1`,
  );
  await run(
    "site_enquiries",
    sql`update core.site_enquiries set status = 'tobedeleted', metadata = '{}', name = '-',
          email = '', phone = '', phone_normalized = null, child_name = '', child_year = '',
          message = '', answers = '[]', network_key = ''
        where tenant_id = ${t}::uuid and id in ${input.listed("site_enquiry")}
        returning 1`,
  );
  await run(
    "notification_deliveries",
    sql`update core.notification_deliveries set address = null
        where tenant_id = ${t}::uuid and contact_id in ${input.contacts} and address is not null
        returning 1`,
  );
  await run(
    "message_contacts",
    sql`update core.message_contacts set status = 'tobedeleted', metadata = '{}', email = null,
          phone = null, phone_normalized = null, display_name = ''
        where tenant_id = ${t}::uuid and id in ${input.contacts}
        returning 1`,
  );
}

/**
 * Erases an outside contact who never had an account, as the `retention`
 * role: their conversations and enquiries as the approval lists them,
 * what they wrote elsewhere, and the documents and files of all of it.
 */
export async function eraseContact(
  tx: Tx,
  input: { tenantId: string; contactId: string; emptyContent: object },
): Promise<ErasureResult> {
  const t = input.tenantId;
  const counts: Record<string, number> = {};
  const run = async (name: string, statement: SQL) => {
    const rows = await tx.execute(statement);
    counts[name] = (counts[name] ?? 0) + rows.length;
  };
  const listed = (type: string) =>
    sql`(select i.object_id from core.erasure_items i
          join core.erasure_approvals a on a.tenant_id = i.tenant_id and a.id = i.approval_id
          where i.tenant_id = ${t}::uuid and a.subject_contact_id = ${input.contactId}::uuid
            and i.object_type = ${type})`;
  await eraseConversations(run, {
    tenantId: t,
    contacts: contactAndMerged(t, input.contactId),
    authorUserId: null,
    listed,
  });
  await eraseListed(tx, run, {
    tenantId: t,
    listed,
    emptyContent: input.emptyContent,
  });
  const keys = await tx.execute<{ storage_key: string }>(
    sharedKeysLeft(t, listed("file")),
  );
  await run(
    "files",
    sql`update core.files set status = 'tobedeleted', metadata = '{}'
        where tenant_id = ${t}::uuid and id in ${listed("file")} returning 1`,
  );
  await run(
    "files",
    sql`delete from core.files where tenant_id = ${t}::uuid and status = 'tobedeleted'
          and id in ${listed("file")} returning 1`,
  );
  return { counts, storageKeys: keys.map((row) => row.storage_key) };
}

/**
 * The stored objects of the files an erasure lists that no other file
 * still points at: a copy or an upload of the same bytes keeps its object.
 */
const sharedKeysLeft = (tenantId: string, files: SQL) => sql`
  select distinct f.storage_key from core.files f
  where f.tenant_id = ${tenantId}::uuid and f.id in ${files}
    and not exists (
      select 1 from core.files o
      where o.tenant_id = f.tenant_id and o.storage_key = f.storage_key
        and o.status = 'active' and o.id not in ${files})`;

/** Empties the documents an approval lists, with their translations, versions and file links. */
async function eraseListed(
  tx: Tx,
  run: (name: string, statement: SQL) => Promise<void>,
  input: {
    tenantId: string;
    listed: (type: string) => SQL;
    emptyContent: object;
  },
) {
  const t = input.tenantId;
  const content = JSON.stringify(input.emptyContent);
  await run(
    "documents",
    sql`update core.documents set status = 'tobedeleted', metadata = '{}', content = ${content}::text::jsonb,
          plain_text = '', ydoc = null
        where tenant_id = ${t}::uuid and id in ${input.listed("document")} returning 1`,
  );
  await run(
    "document_translations",
    sql`update core.document_translations set status = 'tobedeleted', metadata = '{}',
          content = ${content}::text::jsonb, plain_text = ''
        where tenant_id = ${t}::uuid and document_id in ${input.listed("document")} returning 1`,
  );
  await run(
    "document_versions",
    sql`update core.document_versions set content = '{}', plain_text = '', ydoc_snapshot = null,
          redacted_at = statement_timestamp()
        where tenant_id = ${t}::uuid and document_id in ${input.listed("document")} and redacted_at is null
        returning 1`,
  );
  await tx.execute(
    sql`update core.document_files set status = 'tobedeleted', metadata = '{}'
        where tenant_id = ${t}::uuid and document_id in ${input.listed("document")}`,
  );
  await run(
    "document_files",
    sql`delete from core.document_files where tenant_id = ${t}::uuid and status = 'tobedeleted'
          and document_id in ${input.listed("document")} returning 1`,
  );
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
  const listed = (type: string) =>
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
  await run(
    "contact_changes",
    sql`delete from health.contact_changes where tenant_id = ${t}::uuid
          and change_id in (select id from health.requested_changes
            where tenant_id = ${t}::uuid and student_user_id = ${s}::uuid) returning 1`,
  );
  await remove(
    "health_changes",
    sql`health.requested_changes`,
    sql`student_user_id = ${s}::uuid`,
  );
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
  await remove(
    "federated_identities",
    sql`core.federated_identities`,
    sql`login_identity_id in (select id from core.login_identities
      where tenant_id = ${t}::uuid and account_id in ${accounts})`,
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
    "student_grades",
    sql`core.student_grades`,
    sql`student_user_id = ${s}::uuid`,
  );
  await tombstone(
    "student_departures",
    sql`core.student_departures`,
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

  await eraseConversations(run, {
    tenantId: t,
    contacts: sql`(select id from core.message_contacts
      where tenant_id = ${t}::uuid and user_id = ${s}::uuid)`,
    authorUserId: s,
    listed,
  });
  await eraseListed(tx, run, {
    tenantId: t,
    listed,
    emptyContent: input.emptyContent,
  });

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
          feedback = null, fluency = null
        where tenant_id = ${t}::uuid and student_user_id = ${s}::uuid returning 1`,
  );
  await run(
    "lesson_runs",
    sql`delete from core.lesson_runs where tenant_id = ${t}::uuid and student_user_id = ${s}::uuid
        returning 1`,
  );
  await remove(
    "discussion_likes",
    sql`core.discussion_likes`,
    sql`user_id = ${s}::uuid`,
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
    "lesson_sittings",
    "work_sittings",
    "standard_sittings",
    "goal_reports",
    "module_audiences",
    "lesson_openings",
    "lesson_progress",
    "lesson_releases",
    "lesson_watches",
    "assignment_recipients",
    "class_group_members",
    "work_comment_answers",
  ] as const)
    await remove(
      table,
      sql`core.${sql.identifier(table)}`,
      sql`student_user_id = ${s}::uuid`,
    );
  // What was only about them as a person: notices they were sent, roles
  // they held, what they wrote in comments, and what their family shared
  // or reported of them.
  await remove(
    "broadcast_recipients",
    sql`core.broadcast_recipients`,
    sql`user_id = ${s}::uuid`,
  );
  await remove(
    "access_role_assignments",
    sql`core.access_role_assignments`,
    sql`user_id = ${s}::uuid`,
  );
  await remove(
    "document_comments",
    sql`core.document_comments`,
    sql`author_user_id = ${s}::uuid`,
  );
  await remove(
    "work_comment_replies",
    sql`core.work_comment_replies`,
    sql`author_user_id = ${s}::uuid`,
  );
  await remove(
    "family_shares",
    sql`core.family_shares`,
    sql`(student_user_id = ${s}::uuid or shared_by_user_id = ${s}::uuid)`,
  );
  await remove(
    "absence_reports",
    sql`core.absence_reports`,
    sql`(student_user_id = ${s}::uuid or reported_by_user_id = ${s}::uuid)`,
  );
  // The reviews they wrote, and the ones written of their work, with the
  // passages each review comments on.
  await remove(
    "peer_review_comments",
    sql`core.peer_review_comments`,
    sql`review_id in (select id from core.peer_reviews where tenant_id = ${t}::uuid
      and (reviewer_user_id = ${s}::uuid or author_user_id = ${s}::uuid))`,
  );
  await remove(
    "peer_reviews",
    sql`core.peer_reviews`,
    sql`(reviewer_user_id = ${s}::uuid or author_user_id = ${s}::uuid)`,
  );

  // Medical reports are among the files only while the health purpose is set.
  await purpose("health");
  const keys = await tx.execute<{ storage_key: string }>(
    sharedKeysLeft(t, listed("file")),
  );
  await remove("files", sql`core.files`, sql`id in ${listed("file")}`);
  await purpose("");

  await run(
    "audit_payloads",
    sql`delete from audit.payloads where tenant_id = ${t}::uuid and subject_user_id = ${s}::uuid returning 1`,
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
      and (exists (select 1 from core.user_roles r
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

/** The approved erasure of an outside contact, and whether it has run. */
export async function contactApproval(
  tx: Tx,
  input: { tenantId: string; contactId: string },
): Promise<{ id: string; erased: boolean } | null> {
  const [row] = await tx.execute<{ id: string; erased: boolean }>(sql`
    select a.id, c.status = 'tobedeleted' as erased
    from core.erasure_approvals a
    join core.message_contacts c on c.tenant_id = a.tenant_id and c.id = a.subject_contact_id
    where a.tenant_id = ${input.tenantId}::uuid and a.subject_contact_id = ${input.contactId}::uuid
    order by a.created_at desc limit 1`);
  return row ?? null;
}
