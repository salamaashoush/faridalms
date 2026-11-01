import { and, eq, sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { orgs } from "../tables/tenancy";

type Tx = CellTransaction;

export async function schoolSettings(
  tx: Tx,
  tenantId: string,
  schoolId: string,
) {
  const [row] = await tx
    .select({
      id: orgs.id,
      version: orgs.version,
      nameEn: orgs.nameEn,
      nameAr: orgs.nameAr,
      identifier: orgs.identifier,
      timeZone: orgs.timeZone,
      defaultLocale: orgs.defaultLocale,
      weekStart: orgs.weekStart,
      weekendDays: orgs.weekendDays,
      secondaryCalendar: orgs.secondaryCalendar,
      digits: orgs.digits,
      arabicMath: orgs.arabicMath,
      countryCode: orgs.countryCode,
      phone: orgs.phone,
      email: orgs.email,
      logoFileId: orgs.logoFileId,
    })
    .from(orgs)
    .where(
      and(
        eq(orgs.tenantId, tenantId),
        eq(orgs.id, schoolId),
        eq(orgs.type, "school"),
      ),
    );
  return row ?? null;
}

export async function updateSchool(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    expectedVersion: number;
    nameEn: string | null;
    nameAr: string | null;
    identifier: string | null;
    timeZone: string;
    defaultLocale: "ar" | "en";
    weekStart: number;
    weekendDays: number[];
    secondaryCalendar: "islamic-umalqura" | "islamic-civil" | null;
    digits: "latn" | "arab";
    arabicMath: "ltr" | "rtl";
    phone: string | null;
    email: string | null;
    logoFileId: string | null;
  },
) {
  const { tenantId, schoolId, expectedVersion, ...fields } = input;
  const [row] = await tx
    .update(orgs)
    .set(fields)
    .where(
      and(
        eq(orgs.tenantId, tenantId),
        eq(orgs.id, schoolId),
        eq(orgs.type, "school"),
        eq(orgs.version, expectedVersion),
      ),
    )
    .returning({ id: orgs.id, version: orgs.version });
  return row ?? null;
}

/** Turns a feature on or off at one org, overriding what the orgs above say. */
export async function setOrgFeature(
  tx: Tx,
  input: { tenantId: string; orgId: string; feature: string; enabled: boolean },
) {
  const updated = await tx.execute<{ id: string }>(sql`
    update core.org_features set enabled = ${input.enabled}
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and feature = ${input.feature} and status = 'active'
    returning id`);
  if (updated.length > 0) return;
  await tx.execute(sql`
    insert into core.org_features (tenant_id, org_id, feature, enabled)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.feature}, ${input.enabled})`);
}
