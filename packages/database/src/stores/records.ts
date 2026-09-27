import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { textArray, uuidArray } from "./sql";

type Tx = CellTransaction;

/*
 * Health, demographics and custody rows are invisible unless the unit of work
 * set the matching purpose; every function here expects to run inside it.
 */

export interface HealthRow {
  id: string;
  version: number;
  kindId: string;
  hasAlert: boolean;
  recordedOn: string | null;
  keyVersion: number;
  ciphertext: Uint8Array;
}

export async function healthRecordsOf(
  tx: Tx,
  tenantId: string,
  studentId: string,
): Promise<HealthRow[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    kind_descriptor_id: string;
    has_alert: boolean;
    recorded_on: string | null;
    key_version: number;
    ciphertext: Uint8Array;
  }>(sql`
    select id, version, kind_descriptor_id, has_alert, recorded_on::text as recorded_on, key_version, ciphertext
    from health.records
    where tenant_id = ${tenantId}::uuid and student_user_id = ${studentId}::uuid and status = 'active'
    order by has_alert desc, created_at`);
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    kindId: row.kind_descriptor_id,
    hasAlert: row.has_alert,
    recordedOn: row.recorded_on,
    keyVersion: row.key_version,
    ciphertext: row.ciphertext,
  }));
}

export async function insertHealthRecord(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    studentId: string;
    kindId: string;
    hasAlert: boolean;
    recordedOn: string | null;
    keyVersion: number;
    ciphertext: Uint8Array;
  },
) {
  await tx.execute(sql`
    insert into health.records (tenant_id, id, student_user_id, kind_descriptor_id, has_alert, recorded_on,
      key_version, ciphertext)
    values (${input.tenantId}::uuid, ${input.id}::uuid, ${input.studentId}::uuid, ${input.kindId}::uuid,
      ${input.hasAlert}, ${input.recordedOn}::date, ${input.keyVersion}, ${input.ciphertext})`);
}

/** Returns false when the row changed since the version the caller read. */
export async function updateHealthRecord(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    studentId: string;
    expectedVersion: number;
    kindId: string;
    hasAlert: boolean;
    recordedOn: string | null;
    keyVersion: number;
    ciphertext: Uint8Array;
  },
) {
  const rows = await tx.execute<{ id: string }>(sql`
    update health.records
    set kind_descriptor_id = ${input.kindId}::uuid, has_alert = ${input.hasAlert},
        recorded_on = ${input.recordedOn}::date, key_version = ${input.keyVersion}, ciphertext = ${input.ciphertext}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and student_user_id = ${input.studentId}::uuid and version = ${input.expectedVersion} and status = 'active'
    returning id`);
  return rows.length > 0;
}

export async function removeHealthRecord(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    studentId: string;
    expectedVersion: number;
  },
) {
  const rows = await tx.execute<{ id: string }>(sql`
    update health.records set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and student_user_id = ${input.studentId}::uuid and version = ${input.expectedVersion} and status = 'active'
    returning id`);
  return rows.length > 0;
}

/** Mirrors whether any current health record carries an alert into the header flag. */
export async function refreshMedicalAlert(
  tx: Tx,
  tenantId: string,
  studentId: string,
) {
  await tx.execute(sql`
    update core.users u set medical_alert = exists (
      select 1 from health.records h
      where h.tenant_id = u.tenant_id and h.student_user_id = u.id and h.status = 'active' and h.has_alert)
    where u.tenant_id = ${tenantId}::uuid and u.id = ${studentId}::uuid`);
}

export interface DemographicsRow {
  version: number | null;
  birthCountryCode: string | null;
  birthCity: string | null;
  nationalityCodes: string[];
  religionId: string | null;
  homeLanguages: string[];
}

export async function demographicsOf(
  tx: Tx,
  tenantId: string,
  userId: string,
): Promise<DemographicsRow> {
  const rows = await tx.execute<{
    version: number;
    birth_country_code: string | null;
    birth_city: string | null;
    nationality_codes: string[];
    religion_descriptor_id: string | null;
    home_languages: string[];
  }>(sql`
    select version, birth_country_code, birth_city, nationality_codes, religion_descriptor_id, home_languages
    from core.demographics
    where tenant_id = ${tenantId}::uuid and user_id = ${userId}::uuid and status = 'active'`);
  const row = rows[0];
  return row
    ? {
        version: row.version,
        birthCountryCode: row.birth_country_code,
        birthCity: row.birth_city,
        nationalityCodes: row.nationality_codes,
        religionId: row.religion_descriptor_id,
        homeLanguages: row.home_languages,
      }
    : {
        version: null,
        birthCountryCode: null,
        birthCity: null,
        nationalityCodes: [],
        religionId: null,
        homeLanguages: [],
      };
}

/**
 * Writes a person's demographics row, creating it on the first save. Returns
 * false when the row changed since the version the caller read.
 */
export async function saveDemographicsRow(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    expectedVersion: number | null;
    birthCountryCode: string | null;
    birthCity: string | null;
    nationalityCodes: string[];
    religionId: string | null;
    homeLanguages: string[];
  },
) {
  if (input.expectedVersion === null) {
    const rows = await tx.execute<{ user_id: string }>(sql`
      insert into core.demographics (tenant_id, user_id, birth_country_code, birth_city, nationality_codes,
        religion_descriptor_id, home_languages)
      values (${input.tenantId}::uuid, ${input.userId}::uuid, ${input.birthCountryCode}, ${input.birthCity},
        ${textArray(input.nationalityCodes)}, ${input.religionId}::uuid, ${textArray(input.homeLanguages)})
      on conflict (tenant_id, user_id) do nothing
      returning user_id`);
    return rows.length > 0;
  }
  const rows = await tx.execute<{ user_id: string }>(sql`
    update core.demographics
    set birth_country_code = ${input.birthCountryCode}, birth_city = ${input.birthCity},
        nationality_codes = ${textArray(input.nationalityCodes)}, religion_descriptor_id = ${input.religionId}::uuid,
        home_languages = ${textArray(input.homeLanguages)}
    where tenant_id = ${input.tenantId}::uuid and user_id = ${input.userId}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning user_id`);
  return rows.length > 0;
}

export interface RestrictionRow {
  relationshipId: string;
  version: number;
  contactRestrictions: string | null;
  courtOrderFileId: string | null;
}

export async function restrictionsOf(
  tx: Tx,
  tenantId: string,
  relationshipIds: readonly string[],
): Promise<RestrictionRow[]> {
  if (relationshipIds.length === 0) return [];
  const rows = await tx.execute<{
    relationship_id: string;
    version: number;
    contact_restrictions: string | null;
    court_order_file_id: string | null;
  }>(sql`
    select relationship_id, version, contact_restrictions, court_order_file_id
    from core.relationship_restrictions
    where tenant_id = ${tenantId}::uuid and relationship_id = any(${uuidArray([...relationshipIds])})
      and status = 'active'`);
  return rows.map((row) => ({
    relationshipId: row.relationship_id,
    version: row.version,
    contactRestrictions: row.contact_restrictions,
    courtOrderFileId: row.court_order_file_id,
  }));
}

export async function saveRestriction(
  tx: Tx,
  input: {
    tenantId: string;
    relationshipId: string;
    contactRestrictions: string | null;
  },
) {
  await tx.execute(sql`
    insert into core.relationship_restrictions (tenant_id, relationship_id, contact_restrictions)
    values (${input.tenantId}::uuid, ${input.relationshipId}::uuid, ${input.contactRestrictions})
    on conflict (tenant_id, relationship_id)
    do update set contact_restrictions = excluded.contact_restrictions, status = 'active'`);
}

/** The derived custody flags every staff member sees; false when the link changed. */
export async function updateCustodyFlags(
  tx: Tx,
  input: {
    tenantId: string;
    studentId: string;
    relationshipId: string;
    expectedVersion: number;
    educationalRights: "full" | "restricted" | "none";
    communicationIsolated: boolean;
    pickup: "allowed" | "not_allowed" | "ask_office" | null;
  },
) {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.user_relationships
    set educational_rights = ${input.educationalRights}, communication_isolated = ${input.communicationIsolated},
        pickup = ${input.pickup}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.relationshipId}::uuid
      and student_user_id = ${input.studentId}::uuid and version = ${input.expectedVersion} and status = 'active'
    returning id`);
  return rows.length > 0;
}
