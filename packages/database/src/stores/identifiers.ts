import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { bounds, textArray } from "./sql";

type Tx = CellTransaction;

/** A number another system or a document gives a person, sealed when it identifies them. */
export interface IdentifierRow {
  id: string;
  version: number;
  systemId: string;
  meaning: string;
  identifier: string | null;
  ciphertext: Uint8Array<ArrayBuffer> | null;
  hmac: Uint8Array | null;
  keyVersion: number | null;
  last4: string | null;
  issuingCountry: string | null;
  from: string;
  to: string | null;
}

export async function identifiersOf(
  tx: Tx,
  input: { tenantId: string; userId: string; except: readonly string[] },
): Promise<IdentifierRow[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    system_descriptor_id: string;
    system_meaning: string;
    identifier: string | null;
    identifier_ciphertext: Uint8Array | null;
    identifier_hmac: Uint8Array | null;
    key_version: number | null;
    identifier_last4: string | null;
    issuing_country_code: string | null;
    valid_during: string;
  }>(sql`
    select id, version, system_descriptor_id, system_meaning, identifier, identifier_ciphertext,
      identifier_hmac, key_version, identifier_last4, issuing_country_code, valid_during::text as valid_during
    from core.external_ids
    where tenant_id = ${input.tenantId}::uuid and user_id = ${input.userId}::uuid
      and status = 'active'
      and not (system_meaning = any(${textArray(input.except)}))
    order by lower(valid_during) desc, id`);
  return rows.map((row) => {
    const { from, to } = bounds(row.valid_during);
    return {
      id: row.id,
      version: row.version,
      systemId: row.system_descriptor_id,
      meaning: row.system_meaning,
      identifier: row.identifier,
      ciphertext: row.identifier_ciphertext
        ? new Uint8Array(row.identifier_ciphertext)
        : null,
      hmac: row.identifier_hmac ? new Uint8Array(row.identifier_hmac) : null,
      keyVersion: row.key_version,
      last4: row.identifier_last4,
      issuingCountry: row.issuing_country_code,
      from,
      to,
    };
  });
}

export async function identifierById(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<(IdentifierRow & { userId: string }) | null> {
  const [row] = await tx.execute<{
    id: string;
    user_id: string;
    version: number;
    system_descriptor_id: string;
    system_meaning: string;
    identifier: string | null;
    identifier_ciphertext: Uint8Array | null;
    identifier_hmac: Uint8Array | null;
    key_version: number | null;
    identifier_last4: string | null;
    issuing_country_code: string | null;
    valid_during: string;
  }>(sql`
    select id, user_id, version, system_descriptor_id, system_meaning, identifier,
      identifier_ciphertext, identifier_hmac, key_version, identifier_last4, issuing_country_code,
      valid_during::text as valid_during
    from core.external_ids
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'`);
  if (!row) return null;
  const { from, to } = bounds(row.valid_during);
  return {
    id: row.id,
    userId: row.user_id,
    version: row.version,
    systemId: row.system_descriptor_id,
    meaning: row.system_meaning,
    identifier: row.identifier,
    ciphertext: row.identifier_ciphertext
      ? new Uint8Array(row.identifier_ciphertext)
      : null,
    hmac: row.identifier_hmac ? new Uint8Array(row.identifier_hmac) : null,
    keyVersion: row.key_version,
    last4: row.identifier_last4,
    issuingCountry: row.issuing_country_code,
    from,
    to,
  };
}

/** The number itself, sealed or plain; exactly one of the two. */
export type IdentifierValue =
  | { identifier: string; sealed: null }
  | {
      identifier: null;
      sealed: {
        ciphertext: Uint8Array;
        hmac: Uint8Array;
        keyVersion: number;
        last4: string | null;
      };
    };

const valueColumns = (value: IdentifierValue) => ({
  identifier: value.identifier,
  ciphertext: value.sealed ? Buffer.from(value.sealed.ciphertext) : null,
  hmac: value.sealed ? Buffer.from(value.sealed.hmac) : null,
  keyVersion: value.sealed?.keyVersion ?? null,
  last4: value.sealed?.last4 ?? null,
});

export async function insertIdentifier(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    userId: string;
    systemId: string;
    meaning: string;
    value: IdentifierValue;
    issuingCountry: string | null;
    assigningOrgId: string | null;
    from: string;
    to: string | null;
  },
): Promise<number> {
  const value = valueColumns(input.value);
  const [row] = await tx.execute<{ version: number }>(sql`
    insert into core.external_ids (tenant_id, id, user_id, system_descriptor_id, system_meaning,
      identifier, identifier_ciphertext, identifier_hmac, identifier_last4, key_version,
      issuing_country_code, assigning_org_id, valid_during)
    values (${input.tenantId}::uuid, ${input.id}::uuid, ${input.userId}::uuid,
      ${input.systemId}::uuid, ${input.meaning}, ${value.identifier}, ${value.ciphertext},
      ${value.hmac}, ${value.last4}, ${value.keyVersion}, ${input.issuingCountry},
      ${input.assigningOrgId}::uuid, daterange(${input.from}::date, ${input.to}::date, '[)'))
    returning version`);
  if (!row) throw new Error("identifier was not stored");
  return row.version;
}

/** Null when another edit won. */
export async function updateIdentifier(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    value: IdentifierValue;
    issuingCountry: string | null;
    from: string;
    to: string | null;
  },
): Promise<number | null> {
  const value = valueColumns(input.value);
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.external_ids
    set identifier = ${value.identifier}, identifier_ciphertext = ${value.ciphertext},
        identifier_hmac = ${value.hmac}, identifier_last4 = ${value.last4},
        key_version = ${value.keyVersion}, issuing_country_code = ${input.issuingCountry},
        valid_during = daterange(${input.from}::date, ${input.to}::date, '[)')
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning version`);
  return row?.version ?? null;
}

/** Takes away a number entered in error; a renewed document is added beside the old one instead. */
export async function removeIdentifier(
  tx: Tx,
  input: { tenantId: string; id: string; expectedVersion: number },
): Promise<boolean> {
  const rows = await tx.execute(sql`
    update core.external_ids set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning id`);
  return rows.length > 0;
}

/** Identity documents of this school's students that expire within the window. */
export async function expiringDocuments(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    today: string;
    until: string;
    meanings: readonly string[];
  },
): Promise<
  {
    studentId: string;
    fullNameEn: string | null;
    fullNameAr: string | null;
    meaning: string;
    labelEn: string | null;
    labelAr: string | null;
    expiresOn: string;
  }[]
> {
  const rows = await tx.execute<{
    user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    system_meaning: string;
    label_en: string | null;
    label_ar: string | null;
    expires_on: string;
  }>(sql`
    select e.user_id, u.full_name_en, u.full_name_ar, e.system_meaning, d.label_en, d.label_ar,
      (upper(e.valid_during) - 1)::text as expires_on
    from core.external_ids e
    join core.users u on u.tenant_id = e.tenant_id and u.id = e.user_id and u.status = 'active'
    join core.descriptors d on d.tenant_id = e.tenant_id and d.id = e.system_descriptor_id
    where e.tenant_id = ${input.tenantId}::uuid and e.status = 'active'
      and e.system_meaning = any(${textArray(input.meanings)})
      and not upper_inf(e.valid_during)
      and upper(e.valid_during) > ${input.today}::date
      and upper(e.valid_during) <= ${input.until}::date
      and exists (
        select 1 from core.user_roles r
        where r.tenant_id = e.tenant_id and r.user_id = e.user_id and r.role = 'student'
          and r.org_id = ${input.schoolId}::uuid and r.status = 'active'
          and r.valid_during @> ${input.today}::date)
      and not exists (
        select 1 from core.external_ids n
        where n.tenant_id = e.tenant_id and n.user_id = e.user_id and n.status = 'active'
          and n.system_descriptor_id = e.system_descriptor_id and n.id <> e.id
          and (upper_inf(n.valid_during) or upper(n.valid_during) > upper(e.valid_during)))
    order by upper(e.valid_during), u.full_name_en`);
  return rows.map((row) => ({
    studentId: row.user_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    meaning: row.system_meaning,
    labelEn: row.label_en,
    labelAr: row.label_ar,
    expiresOn: row.expires_on,
  }));
}

/** The students holding a number, matched exactly by its keyed hash or plain value. */
export async function studentsByIdentifier(
  tx: Tx,
  input: { tenantId: string; hmac: Uint8Array; plain: string },
): Promise<string[]> {
  const rows = await tx.execute<{ user_id: string }>(sql`
    select distinct user_id from core.external_ids
    where tenant_id = ${input.tenantId}::uuid and status = 'active'
      and (identifier_hmac = ${Buffer.from(input.hmac)}
        or upper(regexp_replace(identifier, '[\\s\\-./]', '', 'g')) = ${input.plain})`);
  return rows.map((row) => row.user_id);
}
