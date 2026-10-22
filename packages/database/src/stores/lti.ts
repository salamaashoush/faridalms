import { sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import type { CellTransaction } from "../context";

type Tx = CellTransaction;

export interface ToolRow {
  id: string;
  version: number;
  name: string;
  clientId: string;
  deploymentId: string;
  loginUrl: string;
  launchUrl: string;
  redirectUrls: string[];
  jwksUrl: string;
  deepLinkUrl: string | null;
  sendNames: boolean;
  custom: Record<string, string>;
}

type ToolRecord = {
  id: string;
  version: number;
  name: string;
  client_id: string;
  deployment_id: string;
  login_url: string;
  launch_url: string;
  redirect_urls: string[];
  jwks_url: string;
  deep_link_url: string | null;
  send_names: boolean;
  custom: Record<string, string>;
};

const toolOf = (row: ToolRecord): ToolRow => ({
  id: row.id,
  version: row.version,
  name: row.name,
  clientId: row.client_id,
  deploymentId: row.deployment_id,
  loginUrl: row.login_url,
  launchUrl: row.launch_url,
  redirectUrls: row.redirect_urls,
  jwksUrl: row.jwks_url,
  deepLinkUrl: row.deep_link_url,
  sendNames: row.send_names,
  custom: row.custom,
});

const toolColumns = sql`id, version, name, client_id, deployment_id, login_url, launch_url,
  redirect_urls, jwks_url, deep_link_url, send_names, custom`;

/** A school's outside tools, by name. */
export async function toolsOf(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<ToolRow[]> {
  const rows = await tx.execute<ToolRecord>(sql`
    select ${toolColumns} from core.lti_tools
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and status = 'active'
    order by name, id`);
  return rows.map(toolOf);
}

export async function toolById(
  tx: Tx,
  input: { tenantId: string; orgId: string; id: string },
): Promise<ToolRow | null> {
  const [row] = await tx.execute<ToolRecord>(sql`
    select ${toolColumns} from core.lti_tools
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and status = 'active'`);
  return row ? toolOf(row) : null;
}

/** A school's tool by the client id it calls itself by. */
export async function toolByClientId(
  tx: Tx,
  input: { tenantId: string; orgId: string; clientId: string },
): Promise<ToolRow | null> {
  const [row] = await tx.execute<ToolRecord>(sql`
    select ${toolColumns} from core.lti_tools
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and client_id = ${input.clientId} and status = 'active'`);
  return row ? toolOf(row) : null;
}

export interface ToolFields {
  name: string;
  loginUrl: string;
  launchUrl: string;
  redirectUrls: string[];
  jwksUrl: string;
  deepLinkUrl: string | null;
  sendNames: boolean;
  custom: Record<string, string>;
}

/** Registers a tool, with the client and deployment ids the school gives it. */
export async function insertTool(
  tx: Tx,
  input: ToolFields & {
    tenantId: string;
    orgId: string;
    clientId: string;
    deploymentId: string;
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.lti_tools (tenant_id, org_id, name, client_id, deployment_id, login_url,
      launch_url, redirect_urls, jwks_url, deep_link_url, send_names, custom)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.name}, ${input.clientId},
      ${input.deploymentId}, ${input.loginUrl}, ${input.launchUrl},
      ${JSON.stringify(input.redirectUrls)}::text::jsonb, ${input.jwksUrl}, ${input.deepLinkUrl},
      ${input.sendNames}, ${JSON.stringify(input.custom)}::text::jsonb)
    returning id, version`);
  if (!row) throw new Error("tool was not registered");
  return row;
}

/** Null when the tool changed since the version the caller read. */
export async function updateTool(
  tx: Tx,
  input: ToolFields & {
    tenantId: string;
    orgId: string;
    id: string;
    expectedVersion: number;
  },
): Promise<{ version: number } | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.lti_tools
    set name = ${input.name}, login_url = ${input.loginUrl}, launch_url = ${input.launchUrl},
        redirect_urls = ${JSON.stringify(input.redirectUrls)}::text::jsonb,
        jwks_url = ${input.jwksUrl}, deep_link_url = ${input.deepLinkUrl},
        send_names = ${input.sendNames}, custom = ${JSON.stringify(input.custom)}::text::jsonb
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row ?? null;
}

export async function removeTool(
  tx: Tx,
  input: { tenantId: string; orgId: string; id: string },
): Promise<boolean> {
  const rows = await tx.execute(sql`
    update core.lti_tools set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and status = 'active'
    returning id`);
  return rows.length > 0;
}

export interface KeyRow {
  kid: string;
  publicJwk: Record<string, unknown>;
  sealedPrivateJwk: string;
}

/** The key a school signs with now, if it has made one. */
export async function signingKey(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<KeyRow | null> {
  const [row] = await tx.execute<{
    kid: string;
    public_jwk: Record<string, unknown>;
    sealed_private_jwk: string;
  }>(sql`
    select kid, public_jwk, sealed_private_jwk from core.lti_keys
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and status = 'active' and retired_at is null`);
  return row
    ? {
        kid: row.kid,
        publicJwk: row.public_jwk,
        sealedPrivateJwk: row.sealed_private_jwk,
      }
    : null;
}

/**
 * Keeps a school's new signing key, unless another request made one first;
 * the key that stands is returned either way.
 */
export async function keepSigningKey(
  tx: Tx,
  input: KeyRow & { tenantId: string; orgId: string },
): Promise<KeyRow> {
  await tx.execute(sql`
    insert into core.lti_keys (tenant_id, org_id, kid, public_jwk, sealed_private_jwk)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.kid},
      ${JSON.stringify(input.publicJwk)}::text::jsonb, ${input.sealedPrivateJwk})
    on conflict (tenant_id, org_id) where status = 'active' and retired_at is null
    do nothing`);
  const kept = await signingKey(tx, input);
  if (!kept) throw new Error("signing key was not kept");
  return kept;
}

/**
 * The public keys a school publishes: the one it signs with, and those
 * retired within the week, so what was signed just before still checks.
 */
export async function publishedKeys(
  tx: Tx,
  input: { tenantId: string; orgId: string },
): Promise<Record<string, unknown>[]> {
  const rows = await tx.execute<{ public_jwk: Record<string, unknown> }>(sql`
    select public_jwk from core.lti_keys
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and status = 'active'
      and (retired_at is null or retired_at > statement_timestamp() - interval '7 days')
    order by created_at desc`);
  return rows.map((row) => row.public_jwk);
}

/**
 * Records a value a tool may use once; false when it was used already and
 * has not yet expired.
 */
export async function useOnce(
  tx: Tx,
  input: { tenantId: string; key: string; expiresAt: Date },
): Promise<boolean> {
  const digest = createHash("sha256").update(input.key).digest();
  const rows = await tx.execute(sql`
    insert into core.lti_replays (tenant_id, key_hash, expires_at)
    values (${input.tenantId}::uuid, ${digest}, ${input.expiresAt.toISOString()}::timestamptz)
    on conflict (tenant_id, key_hash) do nothing
    returning 1`);
  return rows.length > 0;
}
