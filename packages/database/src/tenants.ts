import { BUILTIN_CAPABILITIES } from "@faridalms/domain/capabilities";
import { contentPlainText } from "@faridalms/domain/content";
import { plainContent } from "@faridalms/domain/content-conversion";
import { CATALOGUE, edfiUri } from "@faridalms/domain/descriptors/catalogue";
import { BUILTIN_MESSAGE_TEMPLATES } from "@faridalms/domain/templates";
import { sql } from "drizzle-orm";

import type { CellTransaction, openOwner } from "./context";
import type { KeyEncryptionKey, KeyPurpose } from "./crypto";
import type { TenantLifecycle } from "./tables/records";

import { newDataKey } from "./crypto";
import {
  accessRoles,
  descriptors,
  documents,
  documentTemplates,
  orgs,
  tenantKeys,
  tenants,
} from "./tables/index";

export interface SchoolSpec {
  id?: string;
  nameEn?: string;
  nameAr?: string;
  identifier?: string;
  timeZone: string;
  defaultLocale?: "ar" | "en";
  countryCode: string;
}

export interface TenantSpec {
  tenantId?: string;
  kind: "school_group" | "school";
  nameEn?: string;
  nameAr?: string;
  defaultLocale: "ar" | "en";
  jurisdictions: string[];
  /** One school for a standalone tenant; a group's schools otherwise. */
  schools: SchoolSpec[];
}

/** Week start and weekend by jurisdiction, as ISO weekdays. */
function week(countryCode: string): {
  weekStart: number;
  weekendDays: number[];
} {
  if (countryCode === "AE") return { weekStart: 1, weekendDays: [6, 7] };
  return { weekStart: 7, weekendDays: [5, 6] };
}

const KEY_PURPOSES: readonly KeyPurpose[] = [
  "health",
  "identifiers",
  "identifier_lookup",
  "files",
];

/**
 * Seeds every tenant with its own copy of the descriptor catalogue, so the
 * isolation policy stays uniform and schools can relabel values.
 */
export async function seedDescriptors(tx: CellTransaction, tenantId: string) {
  const rows = CATALOGUE.flatMap((namespace) =>
    namespace.values.map((value, index) => ({
      tenantId,
      namespace: namespace.namespace,
      codeValue: value.code,
      labelEn: value.en,
      labelAr: value.ar,
      systemMeaning: value.meaning ?? value.code,
      sortOrder: index,
      onerosterToken: value.oneroster ?? null,
      edfiUri:
        namespace.edfiDescriptor && value.edfi
          ? edfiUri(namespace.edfiDescriptor, value.edfi)
          : null,
      seeded: true,
    })),
  );
  await tx.insert(descriptors).values(rows);
}

const BUILTIN_NAMES: Record<
  keyof typeof BUILTIN_CAPABILITIES,
  [string, string]
> = {
  site_administrator: ["School administrator", "مسؤول المدرسة"],
  district_administrator: ["Group administrator", "مسؤول المجموعة"],
  system_administrator: ["System administrator", "مسؤول النظام"],
  principal: ["Principal", "مدير المدرسة"],
  teacher: ["Teacher", "معلم"],
  aide: ["Teaching assistant", "مساعد معلم"],
  counselor: ["Counselor", "مرشد طلابي"],
  proctor: ["Proctor", "مراقب"],
  staff: ["Staff", "موظف"],
  student: ["Student", "طالب"],
  family: ["Family", "الأسرة"],
  admissions_officer: ["Admissions officer", "مسؤول القبول"],
  applicant_family: ["Applying family", "أسرة متقدمة"],
};

export async function seedBuiltinRoles(tx: CellTransaction, tenantId: string) {
  await tx.insert(accessRoles).values(
    (
      Object.keys(BUILTIN_CAPABILITIES) as (keyof typeof BUILTIN_CAPABILITIES)[]
    ).map((key) => ({
      tenantId,
      builtinKey: key,
      nameEn: BUILTIN_NAMES[key][0],
      nameAr: BUILTIN_NAMES[key][1],
      capabilities: [...BUILTIN_CAPABILITIES[key]],
    })),
  );
}

/**
 * Gives each school the replies its office sends most as message templates
 * of its own, which it may edit or remove.
 */
export async function seedMessageTemplates(
  tx: CellTransaction,
  tenantId: string,
  schoolIds: readonly string[],
) {
  for (const orgId of schoolIds) {
    const made = await tx
      .insert(documentTemplates)
      .values(
        BUILTIN_MESSAGE_TEMPLATES.map((template) => ({
          tenantId,
          orgId,
          kind: "message" as const,
          builtinKey: template.key,
          title: template.title,
          state: "shared" as const,
        })),
      )
      .returning({
        id: documentTemplates.id,
        key: documentTemplates.builtinKey,
      });
    await tx.insert(documents).values(
      made.flatMap((row) => {
        const template = BUILTIN_MESSAGE_TEMPLATES.find(
          (entry) => entry.key === row.key,
        );
        if (!template) return [];
        const content = plainContent(template.body);
        return [
          {
            tenantId,
            hostType: "document_template",
            hostId: row.id,
            orgId,
            kind: "rich_text" as const,
            schemaVersion: 1,
            locale: template.locale,
            content: content as unknown as Record<string, unknown>,
            plainText: contentPlainText(content),
          },
        ];
      }),
    );
  }
}

export async function seedTenantKeys(
  tx: CellTransaction,
  tenantId: string,
  kek: KeyEncryptionKey,
  cell: string,
) {
  const rows = await Promise.all(
    KEY_PURPOSES.map(async (purpose) => ({
      tenantId,
      purpose,
      keyVersion: 1,
      kmsKeyRef: kek.ref,
      wrappedDek: Buffer.from(
        await kek.wrap(newDataKey(), {
          cell,
          tenantId,
          purpose,
          keyVersion: 1,
        }),
      ),
    })),
  );
  await tx.insert(tenantKeys).values(rows);
}

export interface ProvisionedTenant {
  tenantId: string;
  rootOrgId: string;
  schoolIds: string[];
}

/**
 * Creates a tenant as the schema owner: its registry entry, the tenant row and
 * org tree, the seeded descriptors and built-in access roles, and its data
 * keys. The tenant becomes active in the same transaction.
 */
export async function provisionTenant(
  owner: ReturnType<typeof openOwner>,
  spec: TenantSpec,
  keys: { kek: KeyEncryptionKey; cell: string },
): Promise<ProvisionedTenant> {
  const tenantId = spec.tenantId ?? Bun.randomUUIDv7();
  return owner.asOwner(tenantId, "provision", (tx) =>
    createTenant(tx, { ...spec, tenantId }, keys),
  );
}

/**
 * What `provisionTenant` does, inside an owner transaction that has already
 * bound `spec.tenantId`, so a caller can do more in the same transaction.
 */
export async function createTenant(
  tx: CellTransaction,
  spec: TenantSpec & { tenantId: string },
  keys: { kek: KeyEncryptionKey; cell: string },
): Promise<ProvisionedTenant> {
  if (spec.kind === "school" && spec.schools.length !== 1)
    throw new Error("A standalone school tenant has exactly one school");
  const tenantId = spec.tenantId;
  const schoolIds = spec.schools.map(
    (school) => school.id ?? Bun.randomUUIDv7(),
  );
  const rootOrgId = spec.kind === "school" ? schoolIds[0] : Bun.randomUUIDv7();
  if (!rootOrgId) throw new Error("A tenant needs a root org");
  await tx.execute(
    sql`insert into ops.tenant_registry (tenant_id, lifecycle) values (${tenantId}::uuid, 'provisioning')`,
  );
  await tx.insert(tenants).values({
    tenantId,
    kind: spec.kind,
    rootOrgId,
    nameEn: spec.nameEn ?? null,
    nameAr: spec.nameAr ?? null,
    defaultLocale: spec.defaultLocale,
    jurisdictions: spec.jurisdictions,
  });
  if (spec.kind === "school_group")
    await tx.insert(orgs).values({
      tenantId,
      id: rootOrgId,
      type: "school_group",
      nameEn: spec.nameEn ?? null,
      nameAr: spec.nameAr ?? null,
      defaultLocale: spec.defaultLocale,
    });
  await tx.insert(orgs).values(
    spec.schools.map((school, index) => ({
      tenantId,
      id: schoolIds[index],
      type: "school" as const,
      parentId: spec.kind === "school_group" ? rootOrgId : null,
      parentType:
        spec.kind === "school_group" ? ("school_group" as const) : null,
      nameEn: school.nameEn ?? null,
      nameAr: school.nameAr ?? null,
      identifier: school.identifier ?? null,
      timeZone: school.timeZone,
      defaultLocale: school.defaultLocale ?? null,
      countryCode: school.countryCode,
      ...week(school.countryCode),
    })),
  );
  await seedDescriptors(tx, tenantId);
  await seedBuiltinRoles(tx, tenantId);
  await seedMessageTemplates(tx, tenantId, schoolIds);
  await seedTenantKeys(tx, tenantId, keys.kek, keys.cell);
  await tx.execute(
    sql`update ops.tenant_registry set lifecycle = 'active', changed_at = statement_timestamp() where tenant_id = ${tenantId}::uuid`,
  );
  return { tenantId, rootOrgId, schoolIds };
}

/** Where a tenant stands in the cell's registry; null when it has none. */
export async function tenantLifecycle(
  tx: CellTransaction,
  tenantId: string,
): Promise<TenantLifecycle | null> {
  const rows = await tx.execute<{ lifecycle: TenantLifecycle }>(
    sql`select lifecycle from ops.tenant_registry where tenant_id = ${tenantId}::uuid`,
  );
  return rows[0]?.lifecycle ?? null;
}
