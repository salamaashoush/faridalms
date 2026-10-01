import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

type Tx = CellTransaction;

export type TemplateKind = "lesson" | "assignment";

export interface TemplateRow {
  id: string;
  orgId: string;
  ownerUserId: string;
  kind: TemplateKind;
  title: string;
  ownerNameEn: string | null;
  ownerNameAr: string | null;
}

type TemplateRecord = {
  id: string;
  org_id: string;
  owner_user_id: string;
  kind: TemplateKind;
  title: string;
  name_en: string | null;
  name_ar: string | null;
};

const templateOf = (row: TemplateRecord): TemplateRow => ({
  id: row.id,
  orgId: row.org_id,
  ownerUserId: row.owner_user_id,
  kind: row.kind,
  title: row.title,
  ownerNameEn: row.name_en,
  ownerNameAr: row.name_ar,
});

const columns = sql`t.id, t.org_id, t.owner_user_id, t.kind, t.title,
  u.full_name_en as name_en, u.full_name_ar as name_ar`;

/** A school's templates of one kind, by title. */
export async function templatesOf(
  tx: Tx,
  input: { tenantId: string; orgId: string; kind: TemplateKind },
): Promise<TemplateRow[]> {
  const rows = await tx.execute<TemplateRecord>(sql`
    select ${columns}
    from core.document_templates t
    left join core.users u on u.tenant_id = t.tenant_id and u.id = t.owner_user_id
    where t.tenant_id = ${input.tenantId}::uuid and t.org_id = ${input.orgId}::uuid
      and t.kind = ${input.kind} and t.status = 'active'
    order by lower(t.title), t.id
    limit 200`);
  return rows.map(templateOf);
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

export async function insertTemplate(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    ownerUserId: string;
    kind: TemplateKind;
    title: string;
  },
): Promise<{ id: string }> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.document_templates (tenant_id, org_id, owner_user_id, kind, title)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.ownerUserId}::uuid,
      ${input.kind}, ${input.title})
    returning id`);
  if (!row) throw new Error("template not written");
  return row;
}

export async function removeTemplate(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<void> {
  await tx.execute(sql`
    update core.document_templates set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'`);
}
