import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { TemplateState } from "../tables/documents";

import { holds, isoOf, textArray } from "./sql";

type Tx = CellTransaction;

export type TemplateKind =
  | "lesson"
  | "assignment"
  | "unit_plan"
  | "announcement"
  | "event"
  | "consent_form"
  | "module"
  | "message"
  | "admission_letter"
  | "section";

export interface TemplateRow {
  id: string;
  version: number;
  orgId: string;
  /** Null for one the school was given when it was made. */
  ownerUserId: string | null;
  builtinKey: string | null;
  kind: TemplateKind;
  title: string;
  description: string;
  subjectId: string | null;
  state: TemplateState;
  reviewNote: string | null;
  ownerNameEn: string | null;
  ownerNameAr: string | null;
  updatedAt: string;
}

type TemplateRecord = {
  id: string;
  version: number;
  org_id: string;
  owner_user_id: string | null;
  builtin_key: string | null;
  kind: TemplateKind;
  title: string;
  description: string;
  subject_descriptor_id: string | null;
  state: TemplateState;
  review_note: string | null;
  name_en: string | null;
  name_ar: string | null;
  updated_at: string;
};

const templateOf = (row: TemplateRecord): TemplateRow => ({
  id: row.id,
  version: row.version,
  orgId: row.org_id,
  ownerUserId: row.owner_user_id,
  builtinKey: row.builtin_key,
  kind: row.kind,
  title: row.title,
  description: row.description,
  subjectId: row.subject_descriptor_id,
  state: row.state,
  reviewNote: row.review_note,
  ownerNameEn: row.name_en,
  ownerNameAr: row.name_ar,
  updatedAt: row.updated_at,
});

const columns = sql`t.id, t.version, t.org_id, t.owner_user_id, t.builtin_key, t.kind, t.title, t.description,
  t.subject_descriptor_id, t.state, t.review_note,
  u.full_name_en as name_en, u.full_name_ar as name_ar,
  ${isoOf(sql`t.date_last_modified`)} as updated_at`;

/**
 * A school's templates: those it shares, with the viewer's own whatever
 * their state. Narrowed to a kind, a subject, words in the title or
 * description, or to what waits for review.
 */
export async function templatesOf(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    viewerId: string;
    kinds: readonly TemplateKind[];
    subjectId?: string;
    q?: string;
    pending?: boolean;
    limit?: number;
    offset?: number;
  },
): Promise<{ rows: TemplateRow[]; total: number }> {
  const q = input.q?.trim() ?? "";
  if (input.kinds.length === 0) return { rows: [], total: 0 };
  const rows = await tx.execute<TemplateRecord & { total: number }>(sql`
    select ${columns}, (count(*) over ())::int as total
    from core.document_templates t
    left join core.users u on u.tenant_id = t.tenant_id and u.id = t.owner_user_id
    where t.tenant_id = ${input.tenantId}::uuid and t.org_id = ${input.orgId}::uuid
      and t.status = 'active'
      and t.kind = any(${textArray(input.kinds)})
      ${
        input.pending
          ? sql`and t.state = 'pending'`
          : sql`and (t.state = 'shared' or t.owner_user_id = ${input.viewerId}::uuid)`
      }
      ${input.subjectId ? sql`and t.subject_descriptor_id = ${input.subjectId}::uuid` : sql``}
      ${q ? sql`and (${holds(q, [sql`t.title`, sql`t.description`])})` : sql``}
    order by lower(t.title), t.id
    limit ${input.limit ?? 200} offset ${input.offset ?? 0}`);
  return { rows: rows.map(templateOf), total: rows[0]?.total ?? 0 };
}

export async function templateById(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<TemplateRow | null> {
  const [row] = await tx.execute<TemplateRecord>(sql`
    select ${columns}
    from core.document_templates t
    left join core.users u on u.tenant_id = t.tenant_id and u.id = t.owner_user_id
    where t.tenant_id = ${tenantId}::uuid and t.id = ${id}::uuid and t.status = 'active'`);
  return row ? templateOf(row) : null;
}

/** The template a school was given under a builtin key, while it keeps it. */
export async function templateByKey(
  tx: Tx,
  input: { tenantId: string; orgId: string; key: string },
): Promise<TemplateRow | null> {
  const [row] = await tx.execute<TemplateRecord>(sql`
    select ${columns}
    from core.document_templates t
    left join core.users u on u.tenant_id = t.tenant_id and u.id = t.owner_user_id
    where t.tenant_id = ${input.tenantId}::uuid and t.org_id = ${input.orgId}::uuid
      and t.builtin_key = ${input.key} and t.status = 'active'`);
  return row ? templateOf(row) : null;
}

/** Renames a template as its words change; null when another edit won. */
export async function updateTemplate(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    title: string;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.document_templates set title = ${input.title}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

export async function insertTemplate(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    ownerUserId: string;
    kind: TemplateKind;
    title: string;
    description: string;
    subjectId: string | null;
    state: TemplateState;
  },
): Promise<{ id: string }> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.document_templates (tenant_id, org_id, owner_user_id, kind, title,
      description, subject_descriptor_id, state)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.ownerUserId}::uuid,
      ${input.kind}, ${input.title}, ${input.description}, ${input.subjectId}::uuid,
      ${input.state})
    returning id`);
  if (!row) throw new Error("template not written");
  return row;
}

/** A reviewer's decision on a piece waiting for review. False when it no longer waits. */
export async function reviewTemplate(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    state: Exclude<TemplateState, "pending">;
    note: string | null;
    reviewerId: string;
  },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.document_templates
    set state = ${input.state}, review_note = ${input.note},
        reviewed_by_user_id = ${input.reviewerId}::uuid, reviewed_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and status = 'active' and state = 'pending'
    returning id`);
  return rows.length > 0;
}

export async function removeTemplate(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<void> {
  await tx.execute(sql`
    update core.document_templates set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'`);
}
