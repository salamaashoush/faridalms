import type { SQL } from "drizzle-orm";

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
  /** The record's report, a file sealed under the school's files key. */
  fileId: string | null;
  reportShared: boolean;
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
    file_id: string | null;
    report_shared: boolean;
  }>(sql`
    select id, version, kind_descriptor_id, has_alert, recorded_on::text as recorded_on, key_version, ciphertext,
      file_id, report_shared
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
    fileId: row.file_id,
    reportShared: row.report_shared,
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

/**
 * Gives a record its report, or takes it away, with the record sealed again
 * so it carries the report's name; whether its readers may open it goes with
 * it. False when the row changed since the version the caller read.
 */
export async function setHealthReport(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    studentId: string;
    expectedVersion: number;
    fileId: string | null;
    shared: boolean;
    keyVersion: number;
    ciphertext: Uint8Array;
  },
) {
  const rows = await tx.execute<{ id: string }>(sql`
    update health.records
    set file_id = ${input.fileId}::uuid, report_shared = ${input.fileId !== null && input.shared},
        key_version = ${input.keyVersion}, ciphertext = ${input.ciphertext}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and student_user_id = ${input.studentId}::uuid and version = ${input.expectedVersion} and status = 'active'
    returning id`);
  return rows.length > 0;
}

/** Whether the summary's readers may open a record's report; false when the row changed or holds none. */
export async function shareHealthReport(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    studentId: string;
    expectedVersion: number;
    shared: boolean;
  },
) {
  const rows = await tx.execute<{ id: string }>(sql`
    update health.records set report_shared = ${input.shared}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and student_user_id = ${input.studentId}::uuid and version = ${input.expectedVersion}
      and status = 'active' and file_id is not null
    returning id`);
  return rows.length > 0;
}

/** The student a record is about and the report it holds, for whoever asks to open the report. */
export async function healthRecordOf(
  tx: Tx,
  tenantId: string,
  id: string,
): Promise<{ studentId: string; fileId: string | null } | null> {
  const [row] = await tx.execute<{
    student_user_id: string;
    file_id: string | null;
  }>(sql`
    select student_user_id, file_id from health.records
    where tenant_id = ${tenantId}::uuid and id = ${id}::uuid and status = 'active'`);
  return row ? { studentId: row.student_user_id, fileId: row.file_id } : null;
}

/**
 * Who reads a learner's medical summary or asks to change it: a predicate
 * over the learner's id, which the caller's rule writes and every read and
 * write of the summary for someone outside the health staff checks in the
 * same statement.
 */
export type SummaryReader = (studentId: SQL) => SQL;

/** The learner themself. */
export const ownSummary =
  (viewerId: string): SummaryReader =>
  (studentId) =>
    sql`${studentId} = ${viewerId}::uuid`;

export interface FamilyHealthRow {
  id: string;
  version: number;
  kindId: string;
  meaning: string;
  keyVersion: number;
  ciphertext: Uint8Array;
  fileId: string | null;
  reportShared: boolean;
}

/**
 * The records of the given kinds a reader outside the health staff reads in
 * a learner's medical summary, and none at all unless the reader may.
 */
export async function summaryRecordsOf(
  tx: Tx,
  input: {
    tenantId: string;
    studentId: string;
    reader: SummaryReader;
    meanings: readonly string[];
  },
): Promise<FamilyHealthRow[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    kind_descriptor_id: string;
    meaning: string;
    key_version: number;
    ciphertext: Uint8Array;
    file_id: string | null;
    report_shared: boolean;
  }>(sql`
    select h.id, h.version, h.kind_descriptor_id, d.system_meaning as meaning, h.key_version, h.ciphertext,
      h.file_id, h.report_shared
    from health.records h
    join core.descriptors d on d.tenant_id = h.tenant_id and d.id = h.kind_descriptor_id
    where h.tenant_id = ${input.tenantId}::uuid and h.student_user_id = ${input.studentId}::uuid
      and h.status = 'active' and d.system_meaning = any(${textArray([...input.meanings])})
      and ${input.reader(sql`h.student_user_id`)}
    order by h.created_at, h.id`);
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    kindId: row.kind_descriptor_id,
    meaning: row.meaning,
    keyVersion: row.key_version,
    ciphertext: row.ciphertext,
    fileId: row.file_id,
    reportShared: row.report_shared,
  }));
}

/**
 * Records a change asked for against the asker's open correction request;
 * false when the reader rule does not let them ask, so nothing is kept.
 */
export async function insertHealthChange(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    requestId: string;
    studentId: string;
    requestedByUserId: string;
    reader: SummaryReader;
    target: "record" | "contact";
    kindId: string | null;
    recordId: string | null;
    keyVersion: number;
    ciphertext: Uint8Array;
    /** The report sent with the change, already hosted by it. */
    fileId?: string | null;
  },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into health.requested_changes (tenant_id, id, request_id, student_user_id, requested_by_user_id,
      target, kind_descriptor_id, record_id, key_version, ciphertext, file_id)
    select ${input.tenantId}::uuid, ${input.id}::uuid, ${input.requestId}::uuid, ${input.studentId}::uuid,
      ${input.requestedByUserId}::uuid, ${input.target}, ${input.kindId}::uuid, ${input.recordId}::uuid,
      ${input.keyVersion}, ${input.ciphertext}, ${input.fileId ?? null}::uuid
    where ${input.reader(sql`${input.studentId}::uuid`)}
    returning id`);
  return rows.length > 0;
}

export interface HealthChangeRow {
  id: string;
  requestId: string;
  studentId: string;
  studentNameEn: string | null;
  studentNameAr: string | null;
  requestedByUserId: string;
  requesterNameEn: string | null;
  requesterNameAr: string | null;
  target: "record" | "contact";
  kindId: string | null;
  recordId: string | null;
  keyVersion: number;
  ciphertext: Uint8Array;
  fileId: string | null;
  receivedOn: string;
  dueOn: string;
  outcome: "completed" | "refused" | "withdrawn" | null;
  closedAt: string | null;
}

/**
 * Changes asked for at a school with their request's dates and outcome,
 * the open ones first by the day they fall due.
 */
async function healthChangesWhere(
  tx: Tx,
  input: { tenantId: string; orgId: string; where: SQL },
): Promise<HealthChangeRow[]> {
  const rows = await tx.execute<{
    id: string;
    request_id: string;
    student_user_id: string;
    student_name_en: string | null;
    student_name_ar: string | null;
    requested_by_user_id: string;
    requester_name_en: string | null;
    requester_name_ar: string | null;
    target: "record" | "contact";
    kind_descriptor_id: string | null;
    record_id: string | null;
    key_version: number;
    ciphertext: Uint8Array;
    file_id: string | null;
    received_on: string;
    due_on: string;
    outcome: HealthChangeRow["outcome"];
    closed_at: string | null;
  }>(sql`
    select c.id, c.request_id, c.student_user_id, s.full_name_en as student_name_en,
           s.full_name_ar as student_name_ar, c.requested_by_user_id, g.full_name_en as requester_name_en,
           g.full_name_ar as requester_name_ar, c.target, c.kind_descriptor_id, c.record_id,
           c.key_version, c.ciphertext, c.file_id, q.received_on::text as received_on,
           coalesce(q.extended_to, q.due_on)::text as due_on, q.outcome, q.closed_at::text as closed_at
    from health.requested_changes c
    join core.records_requests q on q.tenant_id = c.tenant_id and q.id = c.request_id and q.status = 'active'
    join core.users s on s.tenant_id = c.tenant_id and s.id = c.student_user_id
    join core.users g on g.tenant_id = c.tenant_id and g.id = c.requested_by_user_id
    where c.tenant_id = ${input.tenantId}::uuid and q.org_id = ${input.orgId}::uuid and c.status = 'active'
      and q.topic = 'health' and ${input.where}
    order by q.outcome is not null, coalesce(q.extended_to, q.due_on), q.closed_at desc, c.id`);
  return rows.map((row) => ({
    id: row.id,
    requestId: row.request_id,
    studentId: row.student_user_id,
    studentNameEn: row.student_name_en,
    studentNameAr: row.student_name_ar,
    requestedByUserId: row.requested_by_user_id,
    requesterNameEn: row.requester_name_en,
    requesterNameAr: row.requester_name_ar,
    target: row.target,
    kindId: row.kind_descriptor_id,
    recordId: row.record_id,
    keyVersion: row.key_version,
    ciphertext: row.ciphertext,
    fileId: row.file_id,
    receivedOn: row.received_on,
    dueOn: row.due_on,
    outcome: row.outcome,
    closedAt: row.closed_at,
  }));
}

/** What one person asked to change about one learner. */
export function askedHealthChanges(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    studentId: string;
    requestedByUserId: string;
  },
) {
  return healthChangesWhere(tx, {
    ...input,
    where: sql`c.student_user_id = ${input.studentId}::uuid
      and c.requested_by_user_id = ${input.requestedByUserId}::uuid`,
  });
}

/** Whose records the office's viewer reaches, as `app.visible_students` decides. */
export interface HealthReach {
  viewerId: string;
  today: string;
  schoolWide: boolean;
  followed: readonly string[];
}

const reached = (
  input: { orgId: string } & HealthReach,
) => sql`c.student_user_id in (
  select student_user_id from app.visible_students(${input.viewerId}::uuid, ${input.orgId}::uuid,
    ${input.today}::date, ${input.schoolWide}, ${uuidArray(input.followed)}))`;

/** The office's changes to answer, or every one, of the students it reaches. */
export function healthChangeQueue(
  tx: Tx,
  input: { tenantId: string; orgId: string; open: boolean } & HealthReach,
) {
  return healthChangesWhere(tx, {
    ...input,
    where: input.open
      ? sql`q.outcome is null and ${reached(input)}`
      : reached(input),
  });
}

export async function healthChangeOf(
  tx: Tx,
  input: { tenantId: string; orgId: string; requestId: string } & HealthReach,
): Promise<HealthChangeRow | null> {
  const [row] = await healthChangesWhere(tx, {
    ...input,
    where: sql`c.request_id = ${input.requestId}::uuid and ${reached(input)}`,
  });
  return row ?? null;
}

/** One change by its own id, for the office that reaches its student. */
export async function healthChangeById(
  tx: Tx,
  input: { tenantId: string; orgId: string; id: string } & HealthReach,
): Promise<HealthChangeRow | null> {
  const [row] = await healthChangesWhere(tx, {
    ...input,
    where: sql`c.id = ${input.id}::uuid and ${reached(input)}`,
  });
  return row ?? null;
}

/**
 * The students whose medical summary changes the office's queue shows,
 * read from the requests alone, so the read can be put on each student's
 * history before any health row is opened.
 */
export async function healthQueueStudents(
  tx: Tx,
  input: { tenantId: string; orgId: string; open: boolean } & HealthReach,
): Promise<string[]> {
  const rows = await tx.execute<{ subject_user_id: string }>(sql`
    select distinct q.subject_user_id from core.records_requests q
    where q.tenant_id = ${input.tenantId}::uuid and q.org_id = ${input.orgId}::uuid and q.status = 'active'
      and q.topic = 'health' and (not ${input.open} or q.outcome is null)
      and q.subject_user_id in (
        select student_user_id from app.visible_students(${input.viewerId}::uuid, ${input.orgId}::uuid,
          ${input.today}::date, ${input.schoolWide}, ${uuidArray(input.followed)}))`);
  return rows.map((row) => row.subject_user_id);
}

/** Seals a change again, as when the office's reason for declining joins it. */
export async function resealHealthChange(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    keyVersion: number;
    ciphertext: Uint8Array;
  },
) {
  await tx.execute(sql`
    update health.requested_changes set key_version = ${input.keyVersion}, ciphertext = ${input.ciphertext}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'`);
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
