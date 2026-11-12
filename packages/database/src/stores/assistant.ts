import type {
  AssistantHost,
  AssistantProviderId,
  AssistantTask,
} from "@faridalms/domain/assistant";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

type Tx = CellTransaction;

interface Scope {
  tenantId: string;
  orgId: string;
}

export interface AssistantSettingsRow {
  id: string;
  version: number;
  enabled: boolean;
  provider: AssistantProviderId;
  dailyLimit: number;
}

type SettingsRecord = {
  id: string;
  version: number;
  enabled: boolean;
  provider: AssistantProviderId;
  daily_limit: number;
};

const settingsOf = (row: SettingsRecord): AssistantSettingsRow => ({
  id: row.id,
  version: row.version,
  enabled: row.enabled,
  provider: row.provider,
  dailyLimit: row.daily_limit,
});

/** A school's language model settings, set or not. */
export async function assistantSettingsOf(
  tx: Tx,
  scope: Scope,
): Promise<AssistantSettingsRow | null> {
  const [row] = await tx.execute<SettingsRecord>(sql`
    select id, version, enabled, provider, daily_limit from core.assistant_settings
    where tenant_id = ${scope.tenantId}::uuid and org_id = ${scope.orgId}::uuid
      and status = 'active'`);
  return row ? settingsOf(row) : null;
}

/** Sets a school's language model settings, or changes them from the version read. */
export async function saveAssistantSettings(
  tx: Tx,
  input: Scope & {
    expectedVersion: number;
    enabled: boolean;
    provider: AssistantProviderId;
    dailyLimit: number;
  },
): Promise<{ id: string; version: number } | null> {
  if (input.expectedVersion === 0) {
    const [made] = await tx.execute<{ id: string; version: number }>(sql`
      insert into core.assistant_settings (tenant_id, org_id, enabled, provider, daily_limit)
      values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.enabled},
        ${input.provider}, ${input.dailyLimit})
      on conflict (tenant_id, org_id) where status = 'active' do nothing
      returning id, version`);
    return made ?? null;
  }
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    update core.assistant_settings
    set enabled = ${input.enabled}, provider = ${input.provider},
        daily_limit = ${input.dailyLimit}
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and status = 'active' and version = ${input.expectedVersion}
    returning id, version`);
  return row ?? null;
}

/** How many requests a school's teachers have sent on one of its days. */
export async function requestsOn(
  tx: Tx,
  input: Scope & { day: string },
): Promise<number> {
  const [row] = await tx.execute<{ used: number }>(sql`
    select count(*)::int as used from core.assistant_requests
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and day = ${input.day}::date and status = 'active'`);
  return row?.used ?? 0;
}

/**
 * Takes the school's settings row for the rest of the unit of work, so two
 * requests sent at once cannot both take the day's last one.
 */
export async function holdAssistantDay(tx: Tx, scope: Scope): Promise<void> {
  await tx.execute(sql`
    select id from core.assistant_settings
    where tenant_id = ${scope.tenantId}::uuid and org_id = ${scope.orgId}::uuid
      and status = 'active'
    for update`);
}

/** Records a request as it leaves, before any word is sent. */
export async function startAssistantRequest(
  tx: Tx,
  input: Scope & {
    userId: string;
    task: AssistantTask;
    host: { type: AssistantHost; id: string };
    provider: AssistantProviderId;
    model: string;
    day: string;
    sentCharacters: number;
  },
): Promise<string> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.assistant_requests (tenant_id, org_id, user_id, task, host_type, host_id,
      provider, model, day, sent_characters)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.userId}::uuid, ${input.task},
      ${input.host.type}, ${input.host.id}::uuid, ${input.provider}, ${input.model},
      ${input.day}::date, ${input.sentCharacters})
    returning id`);
  if (!row) throw new Error("assistant request not recorded");
  return row.id;
}

/** Records how a request ended and what it cost. */
export async function finishAssistantRequest(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    outcome: "done" | "failed" | "cancelled";
    receivedCharacters: number;
    inputTokens: number | null;
    outputTokens: number | null;
  },
): Promise<void> {
  await tx.execute(sql`
    update core.assistant_requests
    set outcome = ${input.outcome}, finished_at = statement_timestamp(),
        received_characters = ${input.receivedCharacters},
        input_tokens = ${input.inputTokens}, output_tokens = ${input.outputTokens}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and outcome = 'running'`);
}

/**
 * Whether the model drafted a translation for a record since a person last
 * checked its translation against the original, at `reviewedAt`. Until one
 * does, readers are not given it.
 */
export async function machineTranslationUnchecked(
  tx: Tx,
  input: {
    tenantId: string;
    host: AssistantHost;
    id: string;
    reviewedAt: string | null;
  },
): Promise<boolean> {
  const [row] = await tx.execute<{ unchecked: boolean }>(sql`
    select exists (
      select 1 from core.assistant_requests r
      where r.tenant_id = ${input.tenantId}::uuid and r.host_type = ${input.host}
        and r.host_id = ${input.id}::uuid and r.task = 'translate' and r.outcome = 'done'
        and r.status = 'active'
        and r.finished_at > coalesce(${input.reviewedAt}::timestamptz, '-infinity'::timestamptz)
    ) as unchecked`);
  return row?.unchecked ?? false;
}

/**
 * Every way the school's students are named in full, in either language,
 * so a document's words can leave without them. A given name alone is too
 * often an ordinary word to take out.
 */
export async function studentNamesOf(tx: Tx, scope: Scope): Promise<string[]> {
  const rows = await tx.execute<{ name: string }>(sql`
    select distinct name from (
      select unnest(array[
        u.full_name_en, u.full_name_ar,
        u.given_name_en || ' ' || u.family_name_en,
        u.given_name_ar || ' ' || u.family_name_ar,
        u.preferred_given_name || ' ' || u.family_name_en
      ]) as name
      from core.users u
      where u.tenant_id = ${scope.tenantId}::uuid and u.status = 'active'
        and exists (select 1 from core.user_roles r
          where r.tenant_id = u.tenant_id and r.user_id = u.id
            and r.org_id = ${scope.orgId}::uuid and r.role = 'student')
    ) names
    where name is not null and char_length(name) >= 3`);
  return rows.map((row) => row.name);
}
