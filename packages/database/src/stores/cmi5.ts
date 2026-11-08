import type { AuProgress } from "@faridalms/domain/cmi5";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { textArray } from "./sql";

type Tx = CellTransaction;

type Progress = Record<string, AuProgress>;

export interface RegistrationRow {
  id: string;
  orgId: string;
  lessonId: string;
  packageId: string;
  studentUserId: string;
  progress: Progress;
  satisfiedAt: Date | null;
}

type RegistrationRecord = {
  id: string;
  org_id: string;
  lesson_id: string;
  package_id: string;
  student_user_id: string;
  progress: Progress;
  satisfied_at: Date | string | null;
};

const registrationOf = (row: RegistrationRecord): RegistrationRow => ({
  id: row.id,
  orgId: row.org_id,
  lessonId: row.lesson_id,
  packageId: row.package_id,
  studentUserId: row.student_user_id,
  progress: row.progress,
  satisfiedAt: row.satisfied_at === null ? null : new Date(row.satisfied_at),
});

const registrationColumns = sql`id, org_id, lesson_id, package_id, student_user_id, progress,
  satisfied_at`;

/** A person's registration in a lesson's package, made the first time they launch it. */
export async function registrationFor(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    lessonId: string;
    packageId: string;
    studentUserId: string;
  },
): Promise<RegistrationRow> {
  await tx.execute(sql`
    insert into core.cmi5_registrations (tenant_id, org_id, lesson_id, package_id, student_user_id)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.lessonId}::uuid,
      ${input.packageId}::uuid, ${input.studentUserId}::uuid)
    on conflict (tenant_id, lesson_id, package_id, student_user_id) where status = 'active'
    do nothing`);
  const [row] = await tx.execute<RegistrationRecord>(sql`
    select ${registrationColumns} from core.cmi5_registrations
    where tenant_id = ${input.tenantId}::uuid and lesson_id = ${input.lessonId}::uuid
      and package_id = ${input.packageId}::uuid
      and student_user_id = ${input.studentUserId}::uuid and status = 'active'`);
  if (!row) throw new Error("registration not kept");
  return registrationOf(row);
}

/** A person's registrations in the packages of a lesson. */
export async function registrationsIn(
  tx: Tx,
  input: { tenantId: string; lessonId: string; studentUserId: string },
): Promise<RegistrationRow[]> {
  const rows = await tx.execute<RegistrationRecord>(sql`
    select ${registrationColumns} from core.cmi5_registrations
    where tenant_id = ${input.tenantId}::uuid and lesson_id = ${input.lessonId}::uuid
      and student_user_id = ${input.studentUserId}::uuid and status = 'active'`);
  return rows.map(registrationOf);
}

/** Keeps where a registration's AUs stand, and when the course was first satisfied. */
export async function keepProgress(
  tx: Tx,
  input: {
    tenantId: string;
    registrationId: string;
    progress: Progress;
    satisfied: boolean;
  },
): Promise<void> {
  await tx.execute(sql`
    update core.cmi5_registrations
    set progress = ${JSON.stringify(input.progress)}::text::jsonb,
        satisfied_at = case when ${input.satisfied} then coalesce(satisfied_at, statement_timestamp())
          else satisfied_at end
    where tenant_id = ${input.tenantId}::uuid and id = ${input.registrationId}::uuid
      and status = 'active'`);
}

export interface SessionRow {
  id: string;
  registrationId: string;
  studentUserId: string;
  auId: string;
  activityId: string;
  launchedAt: Date;
  fetchedAt: Date | null;
  lastAt: Date;
  verbs: string[];
  endedAt: Date | null;
}

type SessionRecord = {
  id: string;
  registration_id: string;
  student_user_id: string;
  au_id: string;
  activity_id: string;
  launched_at: Date | string;
  fetched_at: Date | string | null;
  last_at: Date | string;
  verbs: string[];
  ended_at: Date | string | null;
};

const when = (value: Date | string | null) =>
  value === null ? null : new Date(value);

const sessionOf = (row: SessionRecord): SessionRow => ({
  id: row.id,
  registrationId: row.registration_id,
  studentUserId: row.student_user_id,
  auId: row.au_id,
  activityId: row.activity_id,
  launchedAt: new Date(row.launched_at),
  fetchedAt: when(row.fetched_at),
  lastAt: new Date(row.last_at),
  verbs: row.verbs,
  endedAt: when(row.ended_at),
});

const sessionColumns = sql`id, registration_id, student_user_id, au_id, activity_id, launched_at,
  fetched_at, last_at, verbs, ended_at`;

/** The sessions of an AU in a registration that have not ended. */
export async function openSessions(
  tx: Tx,
  input: { tenantId: string; registrationId: string; auId: string },
): Promise<SessionRow[]> {
  const rows = await tx.execute<SessionRecord>(sql`
    select ${sessionColumns} from core.cmi5_sessions
    where tenant_id = ${input.tenantId}::uuid and registration_id = ${input.registrationId}::uuid
      and au_id = ${input.auId} and ended_at is null and status = 'active'
    for update`);
  return rows.map(sessionOf);
}

export async function startSession(
  tx: Tx,
  input: {
    tenantId: string;
    registrationId: string;
    studentUserId: string;
    auId: string;
    activityId: string;
  },
): Promise<string> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.cmi5_sessions (tenant_id, registration_id, student_user_id, au_id, activity_id)
    values (${input.tenantId}::uuid, ${input.registrationId}::uuid,
      ${input.studentUserId}::uuid, ${input.auId}, ${input.activityId})
    returning id`);
  if (!row) throw new Error("session not started");
  return row.id;
}

/** A session with its registration, held while a statement for it is judged. */
export async function sessionById(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<(SessionRow & { registration: RegistrationRow }) | null> {
  const [row] = await tx.execute<
    SessionRecord & { registration: RegistrationRecord }
  >(sql`
    select s.id, s.registration_id, s.student_user_id, s.au_id, s.activity_id, s.launched_at,
      s.fetched_at, s.last_at, s.verbs, s.ended_at,
      jsonb_build_object('id', r.id, 'org_id', r.org_id, 'lesson_id', r.lesson_id,
        'package_id', r.package_id, 'student_user_id', r.student_user_id,
        'progress', r.progress, 'satisfied_at', r.satisfied_at) as registration
    from core.cmi5_sessions s
    join core.cmi5_registrations r on r.tenant_id = s.tenant_id and r.id = s.registration_id
      and r.status = 'active'
    where s.tenant_id = ${input.tenantId}::uuid and s.id = ${input.id}::uuid
      and s.status = 'active'
    for update of s, r`);
  return row
    ? { ...sessionOf(row), registration: registrationOf(row.registration) }
    : null;
}

/** Marks a session's fetch address used; false when it was used before or the session ended. */
export async function useFetch(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<boolean> {
  const rows = await tx.execute(sql`
    update core.cmi5_sessions set fetched_at = statement_timestamp()
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and fetched_at is null and ended_at is null and status = 'active'
    returning id`);
  return rows.length > 0;
}

/** Keeps the cmi5 verbs a session has sent, and how it ended when it has. */
export async function keepSession(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    verbs: string[];
    ending?: "terminated" | "abandoned";
  },
): Promise<void> {
  await tx.execute(sql`
    update core.cmi5_sessions
    set verbs = ${JSON.stringify(input.verbs)}::text::jsonb, last_at = statement_timestamp(),
        ended_at = ${input.ending ? sql`statement_timestamp()` : sql`ended_at`},
        ending = ${input.ending ?? null}::text
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and status = 'active'`);
}

export interface StateRow {
  stateId: string;
  contentType: string;
  body: string;
  updatedAt: Date;
}

/** A state document of an activity in a registration, or all of them. */
export async function statesOf(
  tx: Tx,
  input: {
    tenantId: string;
    registrationId: string;
    activityId: string;
    stateId?: string;
    since?: Date;
  },
): Promise<StateRow[]> {
  const rows = await tx.execute<{
    state_id: string;
    content_type: string;
    body: string;
    date_last_modified: Date | string;
  }>(sql`
    select state_id, content_type, body, date_last_modified from core.cmi5_states
    where tenant_id = ${input.tenantId}::uuid and registration_id = ${input.registrationId}::uuid
      and activity_id = ${input.activityId} and status = 'active'
      ${input.stateId === undefined ? sql`` : sql`and state_id = ${input.stateId}`}
      ${input.since ? sql`and date_last_modified > ${input.since.toISOString()}::timestamptz` : sql``}
    order by state_id`);
  return rows.map((row) => ({
    stateId: row.state_id,
    contentType: row.content_type,
    body: row.body,
    updatedAt: new Date(row.date_last_modified),
  }));
}

/** Keeps a state document, replacing the one there. */
export async function putState(
  tx: Tx,
  input: {
    tenantId: string;
    registrationId: string;
    studentUserId: string;
    activityId: string;
    stateId: string;
    contentType: string;
    body: string;
  },
): Promise<void> {
  await tx.execute(sql`
    insert into core.cmi5_states (tenant_id, registration_id, student_user_id, activity_id,
      state_id, content_type, body)
    values (${input.tenantId}::uuid, ${input.registrationId}::uuid, ${input.studentUserId}::uuid,
      ${input.activityId}, ${input.stateId}, ${input.contentType}, ${input.body})
    on conflict (tenant_id, registration_id, activity_id, state_id) where status = 'active'
    do update set content_type = excluded.content_type, body = excluded.body`);
}

/** Lets a state document go, or all of an activity's but those kept back. */
export async function dropStates(
  tx: Tx,
  input: {
    tenantId: string;
    registrationId: string;
    activityId: string;
    stateId?: string;
    keep: string[];
  },
): Promise<void> {
  await tx.execute(sql`
    update core.cmi5_states set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and registration_id = ${input.registrationId}::uuid
      and activity_id = ${input.activityId} and status = 'active'
      ${input.stateId === undefined ? sql`` : sql`and state_id = ${input.stateId}`}
      and not (state_id = any(${textArray(input.keep)}))`);
}
