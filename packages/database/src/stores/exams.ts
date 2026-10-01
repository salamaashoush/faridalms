import type { ExamChangeDetails } from "@faridalms/domain/exams";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

type Tx = CellTransaction;

export interface ExamBoardRow {
  id: string;
  titleEn: string | null;
  titleAr: string | null;
}

export interface ExamSessionRow {
  id: string;
  officialSeries: string | null;
  boardId: string | null;
  titleEn: string | null;
  titleAr: string | null;
  sitsIn: string;
  keepUntil: string | null;
  declarationRequired: boolean;
  aiEvidenceRequired: boolean;
}

type SessionRecord = {
  id: string;
  official_series: string | null;
  board_id: string | null;
  title_en: string | null;
  title_ar: string | null;
  sits_in: string;
  keep_until: string | null;
  declaration_required: boolean;
  ai_evidence_required: boolean;
};

const sessionOf = (row: SessionRecord): ExamSessionRow => ({
  id: row.id,
  officialSeries: row.official_series,
  boardId: row.board_id,
  titleEn: row.title_en,
  titleAr: row.title_ar,
  sitsIn: row.sits_in,
  keepUntil: row.keep_until,
  declarationRequired: row.declaration_required,
  aiEvidenceRequired: row.ai_evidence_required,
});

const sessionColumns = sql`id, official_series, board_id, title_en, title_ar,
  sits_in::text as sits_in, keep_until::text as keep_until,
  declaration_required, ai_evidence_required`;

export async function examBoardsOf(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<ExamBoardRow[]> {
  const rows = await tx.execute<{
    id: string;
    title_en: string | null;
    title_ar: string | null;
  }>(sql`
    select id, title_en, title_ar from core.exam_boards
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and status = 'active'
    order by lower(coalesce(title_en, title_ar)), id`);
  return rows.map((row) => ({
    id: row.id,
    titleEn: row.title_en,
    titleAr: row.title_ar,
  }));
}

export async function saveExamBoard(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    id?: string;
    titleEn: string | null;
    titleAr: string | null;
  },
): Promise<{ id: string } | null> {
  const [row] = input.id
    ? await tx.execute<{ id: string }>(sql`
        update core.exam_boards set title_en = ${input.titleEn}, title_ar = ${input.titleAr}
        where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
          and id = ${input.id}::uuid and status = 'active'
        returning id`)
    : await tx.execute<{ id: string }>(sql`
        insert into core.exam_boards (tenant_id, org_id, title_en, title_ar)
        values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.titleEn}, ${input.titleAr})
        returning id`);
  return row ?? null;
}

export async function examSessionsOf(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<ExamSessionRow[]> {
  const rows = await tx.execute<SessionRecord>(sql`
    select ${sessionColumns} from core.exam_sessions
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and status = 'active'
    order by sits_in desc, id`);
  return rows.map(sessionOf);
}

export async function examSessionById(
  tx: Tx,
  input: { tenantId: string; orgId: string; id: string; lock?: boolean },
): Promise<ExamSessionRow | null> {
  const [row] = await tx.execute<SessionRecord>(sql`
    select ${sessionColumns} from core.exam_sessions
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and status = 'active'
    ${input.lock ? sql`for update` : sql``}`);
  return row ? sessionOf(row) : null;
}

export async function insertExamSession(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    officialSeries: string | null;
    boardId: string | null;
    titleEn: string | null;
    titleAr: string | null;
    sitsIn: string;
    keepUntil: string | null;
    declarationRequired: boolean;
    aiEvidenceRequired: boolean;
  },
): Promise<ExamSessionRow> {
  const [row] = await tx.execute<SessionRecord>(sql`
    insert into core.exam_sessions (tenant_id, org_id, official_series, board_id,
      title_en, title_ar, sits_in, keep_until, declaration_required, ai_evidence_required)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.officialSeries},
      ${input.boardId}::uuid, ${input.titleEn}, ${input.titleAr}, ${input.sitsIn}::date,
      ${input.keepUntil}::date, ${input.declarationRequired}, ${input.aiEvidenceRequired})
    returning ${sessionColumns}`);
  if (!row) throw new Error("exam session not written");
  return sessionOf(row);
}

export async function updateExamSession(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    titleEn: string | null;
    titleAr: string | null;
    sitsIn: string;
    keepUntil: string | null;
    declarationRequired: boolean;
    aiEvidenceRequired: boolean;
  },
): Promise<ExamSessionRow> {
  const [row] = await tx.execute<SessionRecord>(sql`
    update core.exam_sessions set title_en = ${input.titleEn}, title_ar = ${input.titleAr},
      sits_in = ${input.sitsIn}::date, keep_until = ${input.keepUntil}::date,
      declaration_required = ${input.declarationRequired},
      ai_evidence_required = ${input.aiEvidenceRequired}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'
    returning ${sessionColumns}`);
  if (!row) throw new Error("exam session not written");
  return sessionOf(row);
}

export async function retireExamSession(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<void> {
  await tx.execute(sql`
    update core.exam_sessions set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'`);
}

export interface ExamChange {
  id: string;
  occurredAt: string;
  action: string;
  objectId: string | null;
  actorEn: string | null;
  actorAr: string | null;
  details: ExamChangeDetails;
}

/** What the school's exams officers changed, newest first. */
export async function examChanges(
  tx: Tx,
  input: { tenantId: string; orgId: string; limit: number; offset: number },
): Promise<{ rows: ExamChange[]; total: number }> {
  const rows = await tx.execute<{
    id: string;
    occurred_at: string;
    action: string;
    object_id: string | null;
    actor_en: string | null;
    actor_ar: string | null;
    details: ExamChangeDetails;
    total: number;
  }>(sql`
    select l.id, l.occurred_at::text as occurred_at, l.action, l.object_id::text as object_id,
           a.full_name_en as actor_en, a.full_name_ar as actor_ar,
           l.details,
           count(*) over ()::int as total
    from audit.log l
    left join core.users a on a.tenant_id = l.tenant_id and a.id = l.actor_user_id
    where l.tenant_id = ${input.tenantId}::uuid and l.org_id = ${input.orgId}::uuid
      and l.outcome = 'success' and l.action like 'exam\\_%'
    order by l.occurred_at desc, l.id desc
    limit ${input.limit} offset ${input.offset}`);
  return {
    total: rows[0]?.total ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurred_at,
      action: row.action,
      objectId: row.object_id,
      actorEn: row.actor_en,
      actorAr: row.actor_ar,
      details: row.details,
    })),
  };
}
