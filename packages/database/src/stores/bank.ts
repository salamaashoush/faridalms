import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { escapeLike, isoOf, textArray, uuidArray } from "./sql";

type Tx = CellTransaction;

export type BankScope = "mine" | "school";

export interface BankQuestionRow {
  id: string;
  orgId: string;
  ownerUserId: string;
  ownerNameEn: string | null;
  ownerNameAr: string | null;
  scope: BankScope;
  kind: string;
  title: string;
  tags: string[];
  version: number;
  updatedAt: string;
}

type BankRecord = {
  id: string;
  org_id: string;
  owner_user_id: string;
  name_en: string | null;
  name_ar: string | null;
  scope: BankScope;
  kind: string;
  title: string;
  tags: string[];
  version: number;
  updated_at: string;
};

const bankOf = (row: BankRecord): BankQuestionRow => ({
  id: row.id,
  orgId: row.org_id,
  ownerUserId: row.owner_user_id,
  ownerNameEn: row.name_en,
  ownerNameAr: row.name_ar,
  scope: row.scope,
  kind: row.kind,
  title: row.title,
  tags: row.tags,
  version: row.version,
  updatedAt: row.updated_at,
});

const columns = sql`q.id, q.org_id, q.owner_user_id, u.full_name_en as name_en,
  u.full_name_ar as name_ar, q.scope, q.kind, q.title, q.tags, q.version,
  ${isoOf(sql`q.date_last_modified`)} as updated_at`;

/**
 * The questions a teacher may use: their own, and those kept for the
 * school, newest first, narrowed by words in the prompt or a tag, a tag
 * exactly, a kind, or whose bank they are in.
 */
export async function bankQuestionsOf(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    userId: string;
    search: string;
    tag: string;
    kind: string;
    scope: "all" | BankScope;
  },
): Promise<BankQuestionRow[]> {
  const words = input.search.trim();
  const like = `%${escapeLike(words)}%`;
  const rows = await tx.execute<BankRecord>(sql`
    select ${columns}
    from core.bank_questions q
    left join core.users u on u.tenant_id = q.tenant_id and u.id = q.owner_user_id
    where q.tenant_id = ${input.tenantId}::uuid and q.org_id = ${input.orgId}::uuid
      and q.status = 'active'
      and (q.scope = 'school' or q.owner_user_id = ${input.userId}::uuid)
      ${input.scope === "mine" ? sql`and q.owner_user_id = ${input.userId}::uuid` : sql``}
      ${input.scope === "school" ? sql`and q.scope = 'school'` : sql``}
      ${input.kind ? sql`and q.kind = ${input.kind}` : sql``}
      ${input.tag ? sql`and ${input.tag} = any(q.tags)` : sql``}
      ${
        words
          ? sql`and (q.title ilike ${like} or exists (
              select 1 from unnest(q.tags) as tag where tag ilike ${like}))`
          : sql``
      }
    order by q.date_last_modified desc, q.id
    limit 100`);
  return rows.map(bankOf);
}

/** Every tag a teacher's usable questions carry, for choosing among. */
export async function bankTagsOf(
  tx: Tx,
  input: { tenantId: string; orgId: string; userId: string },
): Promise<string[]> {
  const rows = await tx.execute<{ tag: string }>(sql`
    select distinct tag
    from core.bank_questions q, unnest(q.tags) as tag
    where q.tenant_id = ${input.tenantId}::uuid and q.org_id = ${input.orgId}::uuid
      and q.status = 'active'
      and (q.scope = 'school' or q.owner_user_id = ${input.userId}::uuid)
    order by tag
    limit 200`);
  return rows.map((row) => row.tag);
}

/** Who may draw from a bank: the school's questions and one teacher's own. */
const drawable = (input: {
  tenantId: string;
  orgId: string;
  authorUserId: string;
}) => sql`q.tenant_id = ${input.tenantId}::uuid and q.org_id = ${input.orgId}::uuid
  and q.status = 'active'
  and (q.scope = 'school' or q.owner_user_id = ${input.authorUserId}::uuid)`;

/**
 * How many questions of each tag a quiz by this teacher may draw from, of
 * every tag or only those given.
 */
export async function bankTagCounts(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    authorUserId: string;
    tags?: readonly string[];
  },
): Promise<{ tag: string; questions: number }[]> {
  const rows = await tx.execute<{ tag: string; questions: number }>(sql`
    select tag, count(*)::int as questions
    from core.bank_questions q, unnest(q.tags) as tag
    where ${drawable(input)}
      ${input.tags ? sql`and tag = any(${textArray(input.tags)})` : sql``}
    group by tag
    order by tag
    limit 200`);
  return rows;
}

/**
 * Up to `count` questions carrying a tag, picked at random from those a
 * quiz by this teacher may draw, each with the document that holds it.
 */
export async function drawFromBank(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    authorUserId: string;
    tag: string;
    count: number;
    exclude: readonly string[];
  },
): Promise<{ id: string; content: Record<string, unknown> }[]> {
  return tx.execute<{ id: string; content: Record<string, unknown> }>(sql`
    select q.id, d.content
    from core.bank_questions q
    join core.documents d on d.tenant_id = q.tenant_id
      and d.host_type = 'bank_question' and d.host_id = q.id and d.status = 'active'
    where ${drawable(input)} and ${input.tag} = any(q.tags)
      and not (q.id = any(${uuidArray(input.exclude)}))
    order by random()
    limit ${input.count}`);
}

export async function bankQuestionById(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<BankQuestionRow | null> {
  const [row] = await tx.execute<BankRecord>(sql`
    select ${columns}
    from core.bank_questions q
    left join core.users u on u.tenant_id = q.tenant_id and u.id = q.owner_user_id
    where q.tenant_id = ${tenantId}::uuid and q.id = ${id}::uuid and q.status = 'active'`);
  return row ? bankOf(row) : null;
}

export async function insertBankQuestion(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    ownerUserId: string;
    scope: BankScope;
    kind: string;
    title: string;
    tags: readonly string[];
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.bank_questions (tenant_id, org_id, owner_user_id, scope, kind, title, tags)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.ownerUserId}::uuid,
      ${input.scope}, ${input.kind}, ${input.title}, ${textArray(input.tags)})
    returning id, version`);
  if (!row) throw new Error("bank question not written");
  return row;
}

/** Changes a question kept in the bank; null when another change came first. */
export async function updateBankQuestion(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    scope: BankScope;
    kind: string;
    title: string;
    tags: readonly string[];
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.bank_questions
    set scope = ${input.scope}, kind = ${input.kind}, title = ${input.title},
        tags = ${textArray(input.tags)}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

export async function removeBankQuestion(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<void> {
  await tx.execute(sql`
    update core.bank_questions set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'`);
}
