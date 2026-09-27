import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

type Tx = CellTransaction;

export async function preferenceOf(
  tx: Tx,
  input: { tenantId: string; userId: string; key: string },
): Promise<unknown> {
  const [row] = await tx.execute<{ value: unknown }>(sql`
    select value from core.user_preferences
    where tenant_id = ${input.tenantId}::uuid and user_id = ${input.userId}::uuid
      and key = ${input.key} and status = 'active'`);
  return row?.value ?? null;
}

/** Writes a person's remembered value under a key, creating it the first time. */
export async function savePreference(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    key: string;
    value: Record<string, unknown>;
  },
): Promise<void> {
  const updated = await tx.execute<{ id: string }>(sql`
    update core.user_preferences set value = ${input.value}::jsonb
    where tenant_id = ${input.tenantId}::uuid and user_id = ${input.userId}::uuid
      and key = ${input.key} and status = 'active'
    returning id`);
  if (updated.length > 0) return;
  await tx.execute(sql`
    insert into core.user_preferences (tenant_id, user_id, key, value)
    values (${input.tenantId}::uuid, ${input.userId}::uuid, ${input.key},
            ${input.value}::jsonb)`);
}

export async function localeOf(
  tx: Tx,
  input: { tenantId: string; userId: string },
): Promise<"ar" | "en" | null> {
  const [row] = await tx.execute<{ locale: "ar" | "en" | null }>(sql`
    select preferred_locale as locale from core.users
    where tenant_id = ${input.tenantId}::uuid and id = ${input.userId}::uuid`);
  return row?.locale ?? null;
}

export async function setLocale(
  tx: Tx,
  input: { tenantId: string; userId: string; locale: "ar" | "en" },
): Promise<void> {
  await tx.execute(sql`
    update core.users set preferred_locale = ${input.locale}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.userId}::uuid`);
}
