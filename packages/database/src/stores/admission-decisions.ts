import type {
  ApplicationState,
  ChecklistItem,
  Decision,
  EventKind,
  EventOutcome,
  LetterKind,
  PriorityRule,
} from "@faridalms/domain/admissions";
import type { EnquirySource } from "@faridalms/domain/enquiries";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { isoOf, textArray, uuidArray } from "./sql";

type Tx = CellTransaction;
interface Org {
  tenantId: string;
  orgId: string;
}

/** Decides an application under review, or changes a decision not yet released. Null when it changed meanwhile. */
export async function decideApplication(
  tx: Tx,
  input: Org & {
    id: string;
    expectedVersion: number;
    decision: Decision;
    userId: string;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.admission_applications
    set decision = ${input.decision}, decided_at = statement_timestamp(),
      decided_by_user_id = ${input.userId}::uuid,
      state_changed_at = case when state = 'decided' then state_changed_at else statement_timestamp() end,
      state = 'decided'
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and version = ${input.expectedVersion} and status = 'active'
      and state in ('in_review', 'decided')
    returning version`);
  return row?.version ?? null;
}

/** Takes back a decision not yet released, so the application is under review again. */
export async function reopenApplication(
  tx: Tx,
  input: Org & { id: string; expectedVersion: number },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.admission_applications
    set state = 'in_review', state_changed_at = statement_timestamp(),
      decision = null, decided_at = null, decided_by_user_id = null
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and version = ${input.expectedVersion} and status = 'active'
      and state = 'decided'
    returning version`);
  return row?.version ?? null;
}

/**
 * Moves an application on with what the move records: that the family was
 * told, the last day of an offer, when the family answered, the student it
 * became. A null version is the clock's, which reads no version.
 */
export async function advanceApplication(
  tx: Tx,
  input: Org & {
    id: string;
    expectedVersion: number | null;
    from: ApplicationState;
    state: ApplicationState;
    exitReason?: string | null;
    released?: boolean;
    offerExpiresOn?: string | null;
    answered?: boolean;
    studentUserId?: string | null;
  },
): Promise<number | null> {
  const sets = [
    sql`state = ${input.state}`,
    sql`state_changed_at = statement_timestamp()`,
    sql`exit_reason = ${input.exitReason ?? null}`,
  ];
  if (input.released) sets.push(sql`released_at = statement_timestamp()`);
  if (input.offerExpiresOn !== undefined)
    sets.push(sql`offer_expires_on = ${input.offerExpiresOn}::date`);
  if (input.answered) sets.push(sql`answered_at = statement_timestamp()`);
  if (input.studentUserId !== undefined)
    sets.push(sql`student_user_id = ${input.studentUserId}::uuid`);
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.admission_applications set ${sql.join(sets, sql`, `)}
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and id = ${input.id}::uuid and status = 'active' and state = ${input.from}
      and (${input.expectedVersion}::int is null or version = ${input.expectedVersion}::int)
    returning version`);
  return row?.version ?? null;
}

/**
 * What the clock has to do in a tenant: decisions whose intake's day has
 * come at their school, and offers whose last day has passed there.
 */
export async function clockDue(
  tx: Tx,
  input: {
    tenantId: string;
    orgIds: readonly string[];
    now: Date;
    limit: number;
  },
): Promise<{
  releases: { id: string; orgId: string }[];
  lapsed: { id: string; orgId: string }[];
}> {
  if (input.orgIds.length === 0) return { releases: [], lapsed: [] };
  const schools = uuidArray(input.orgIds);
  const today = sql`(${input.now.toISOString()}::timestamptz at time zone coalesce(o.time_zone, 'UTC'))::date`;
  const releases = await tx.execute<{ id: string; org_id: string }>(sql`
    select a.id, a.org_id from core.admission_applications a
    join core.admission_intakes i on i.tenant_id = a.tenant_id and i.id = a.intake_id
    join core.orgs o on o.tenant_id = a.tenant_id and o.id = a.org_id
    where a.tenant_id = ${input.tenantId}::uuid and a.status = 'active' and a.state = 'decided'
      and a.org_id = any(${schools})
      and i.decisions_on is not null and i.decisions_on <= ${today}
    order by a.decided_at, a.id limit ${input.limit}`);
  const lapsed = await tx.execute<{ id: string; org_id: string }>(sql`
    select a.id, a.org_id from core.admission_applications a
    join core.orgs o on o.tenant_id = a.tenant_id and o.id = a.org_id
    where a.tenant_id = ${input.tenantId}::uuid and a.status = 'active' and a.state = 'offered'
      and a.org_id = any(${schools})
      and a.offer_expires_on < ${today}
    order by a.offer_expires_on, a.id limit ${input.limit}`);
  return {
    releases: releases.map((row) => ({ id: row.id, orgId: row.org_id })),
    lapsed: lapsed.map((row) => ({ id: row.id, orgId: row.org_id })),
  };
}

export interface Seats {
  /** Offers accepted, with those already enrolled. */
  accepted: number;
  /** Offers released and not yet answered. */
  offered: number;
  /** Decisions to offer a place, not yet released. */
  toOffer: number;
}

/** How each intake's places stand. Locks the intakes, so two releases at once count in turn. */
export async function seatsOf(
  tx: Tx,
  input: { tenantId: string; intakeIds: readonly string[]; lock?: boolean },
): Promise<Map<string, Seats>> {
  const seats = new Map<string, Seats>();
  if (input.intakeIds.length === 0) return seats;
  if (input.lock)
    await tx.execute(sql`
      select id from core.admission_intakes
      where tenant_id = ${input.tenantId}::uuid and id = any(${uuidArray(input.intakeIds)})
      order by id for update`);
  const rows = await tx.execute<{
    intake_id: string;
    accepted: number;
    offered: number;
    to_offer: number;
  }>(sql`
    select a.intake_id,
      count(*) filter (where a.state in ('accepted', 'enrolled'))::int as accepted,
      count(*) filter (where a.state = 'offered')::int as offered,
      count(*) filter (where a.state = 'decided' and a.decision = 'offer')::int as to_offer
    from core.admission_applications a
    where a.tenant_id = ${input.tenantId}::uuid and a.intake_id = any(${uuidArray(input.intakeIds)})
      and a.status = 'active'
    group by a.intake_id`);
  for (const id of input.intakeIds)
    seats.set(id, { accepted: 0, offered: 0, toOffer: 0 });
  for (const row of rows)
    seats.set(row.intake_id, {
      accepted: row.accepted,
      offered: row.offered,
      toOffer: row.to_offer,
    });
  return seats;
}

export interface BoardRow {
  id: string;
  version: number;
  reference: string | null;
  state: ApplicationState;
  decision: Decision | null;
  stateChangedAt: string;
  submittedAt: string | null;
  offerExpiresOn: string | null;
  applicantEn: string | null;
  applicantAr: string | null;
  birthDate: string | null;
  filerEn: string | null;
  filerAr: string | null;
  priorities: PriorityRule[];
  /** Required checklist steps not yet verified or waived. */
  outstanding: number;
  /** Current or former students matching found, whom the office confirms on enrolling. */
  matchedStudents: {
    id: string;
    nameEn: string | null;
    nameAr: string | null;
  }[];
}

/** Every application of an intake that was sent, for its board. */
export async function boardOf(
  tx: Tx,
  input: Org & { intakeId: string },
): Promise<BoardRow[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    reference: string | null;
    state: ApplicationState;
    decision: Decision | null;
    state_changed_at: string;
    submitted_at: string | null;
    offer_expires_on: string | null;
    applicant_en: string | null;
    applicant_ar: string | null;
    birth_date: string | null;
    filer_en: string | null;
    filer_ar: string | null;
    priorities: PriorityRule[];
    outstanding: number;
    matched: BoardRow["matchedStudents"] | null;
  }>(sql`
    select a.id, a.version, a.reference, a.state, a.decision,
      ${isoOf(sql`a.state_changed_at`)} as state_changed_at,
      case when a.submitted_at is null then null else ${isoOf(sql`a.submitted_at`)} end as submitted_at,
      a.offer_expires_on::text as offer_expires_on,
      c.full_name_en as applicant_en, c.full_name_ar as applicant_ar, c.birth_date::text as birth_date,
      p.full_name_en as filer_en, p.full_name_ar as filer_ar, a.priorities,
      (select count(*)::int from core.admission_items t where t.tenant_id = a.tenant_id
        and t.application_id = a.id and t.status = 'active' and t.required
        and t.state not in ('verified', 'waived')) as outstanding,
      a.matches -> 'students' as matched
    from core.admission_applications a
    join core.users c on c.tenant_id = a.tenant_id and c.id = a.applicant_user_id
    join core.users p on p.tenant_id = a.tenant_id and p.id = a.filed_by_user_id
    where a.tenant_id = ${input.tenantId}::uuid and a.org_id = ${input.orgId}::uuid
      and a.intake_id = ${input.intakeId}::uuid and a.status = 'active' and a.state <> 'draft'
    order by a.submitted_at, a.id`);
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    reference: row.reference,
    state: row.state,
    decision: row.decision,
    stateChangedAt: row.state_changed_at,
    submittedAt: row.submitted_at,
    offerExpiresOn: row.offer_expires_on,
    applicantEn: row.applicant_en,
    applicantAr: row.applicant_ar,
    birthDate: row.birth_date,
    filerEn: row.filer_en,
    filerAr: row.filer_ar,
    priorities: row.priorities,
    outstanding: row.outstanding,
    matchedStudents: Array.isArray(row.matched) ? row.matched : [],
  }));
}

/**
 * An application carried to an intake of a later year as it was sent: the
 * same child, family, form and answers, numbered for its new year, with the
 * new intake's checklist.
 */
export async function insertDeferred(
  tx: Tx,
  input: Org & {
    fromId: string;
    intakeId: string;
    reference: string;
    priorities: readonly PriorityRule[];
    checklist: readonly ChecklistItem[];
  },
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.admission_applications (tenant_id, org_id, intake_id, form_version_id,
      filed_by_user_id, applicant_user_id, enquiry_id, state, reference, locale, form, answers,
      additional_needs, priorities, matches, submitted_at, deferred_from_id)
    select a.tenant_id, a.org_id, ${input.intakeId}::uuid, a.form_version_id, a.filed_by_user_id,
      a.applicant_user_id, a.enquiry_id, 'submitted', ${input.reference}, a.locale, a.form, a.answers,
      a.additional_needs, ${textArray(input.priorities)}, a.matches, statement_timestamp(), a.id
    from core.admission_applications a
    where a.tenant_id = ${input.tenantId}::uuid and a.org_id = ${input.orgId}::uuid
      and a.id = ${input.fromId}::uuid and a.status = 'active'
    returning id, version`);
  if (!row) throw new Error("The deferred application was not created");
  if (input.checklist.length > 0)
    await tx.execute(sql`
      insert into core.admission_items (tenant_id, org_id, application_id, item_key, kind, label_en,
        label_ar, required, position)
      select ${input.tenantId}::uuid, ${input.orgId}::uuid, ${row.id}::uuid, (item->>'key')::uuid,
        item->>'kind', item->>'labelEn', item->>'labelAr', (item->>'required')::boolean,
        (ordinality - 1)::smallint
      from jsonb_array_elements(${JSON.stringify(input.checklist)}::text::jsonb) with ordinality as t(item, ordinality)`);
  return row;
}

/**
 * Ends someone's applying roles at the school on a day, each once none of
 * the applications it files is still open (for themself the `applicant`
 * role, for others `applicant_family`): the day their applicant starts,
 * so they keep their workspace until the role enrolment gives takes over.
 * Answers whether one was ended.
 */
export async function closeApplicantRole(
  tx: Tx,
  input: Org & { userId: string; endsOn: string },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.user_roles
    set valid_during = case when lower(valid_during) >= ${input.endsOn}::date
        then valid_during else daterange(lower(valid_during), ${input.endsOn}::date, '[)') end,
      status = case when lower(valid_during) >= ${input.endsOn}::date then 'tobedeleted' else status end
    where tenant_id = ${input.tenantId}::uuid and user_id = ${input.userId}::uuid
      and org_id = ${input.orgId}::uuid and role in ('applicant_family', 'applicant') and status = 'active'
      and (upper_inf(valid_during) or upper(valid_during) > ${input.endsOn}::date)
      and not exists (
        select 1 from core.admission_applications a
        where a.tenant_id = ${input.tenantId}::uuid and a.org_id = ${input.orgId}::uuid
          and a.filed_by_user_id = ${input.userId}::uuid and a.status = 'active'
          and (a.applicant_user_id = a.filed_by_user_id) = (core.user_roles.role = 'applicant')
          and a.state in ('draft', 'submitted', 'in_review', 'decided', 'offered', 'waitlisted'))
    returning id`);
  return rows.length > 0;
}

/**
 * Hands what an application kept on the applicant person to the school's
 * own student they were found to be, when a former student applies again:
 * the identity document (unless the student has one of its kind), the
 * consents given (recorded again for the student, the ledger keeping the
 * first, whose ids it answers), and the application's other rows. The applicant person, now a
 * duplicate, is tombstoned. Health records move separately, behind their
 * purpose.
 */
export async function adoptApplicant(
  tx: Tx,
  input: { tenantId: string; fromUserId: string; toUserId: string },
): Promise<string[]> {
  const t = input.tenantId;
  await tx.execute(sql`
    update core.external_ids e set user_id = ${input.toUserId}::uuid
    where e.tenant_id = ${t}::uuid and e.user_id = ${input.fromUserId}::uuid and e.status = 'active'
      and not exists (select 1 from core.external_ids x where x.tenant_id = e.tenant_id
        and x.user_id = ${input.toUserId}::uuid and x.status = 'active'
        and x.system_descriptor_id = e.system_descriptor_id)`);
  const consents = await tx.execute<{ id: string }>(sql`
    insert into core.consent_records (tenant_id, subject_user_id, purpose_descriptor_id, decision,
      notice_id, given_by_user_id, capacity, legal_basis, explicit, written, method,
      evidence_file_id, recorded_by_user_id, valid_during, subject_age_at_decision, refresh_due_on, note)
    select c.tenant_id, ${input.toUserId}::uuid, c.purpose_descriptor_id, c.decision, c.notice_id,
      c.given_by_user_id, c.capacity,
      c.legal_basis, c.explicit, c.written, c.method, c.evidence_file_id, c.recorded_by_user_id,
      c.valid_during, c.subject_age_at_decision, c.refresh_due_on, c.note
    from core.consent_records c
    where c.tenant_id = ${t}::uuid and c.subject_user_id = ${input.fromUserId}::uuid
    order by c.created_at
    returning id`);
  await tx.execute(sql`
    update core.users set status = 'tobedeleted'
    where tenant_id = ${t}::uuid and id = ${input.fromUserId}::uuid and status = 'active'`);
  return consents.map((row) => row.id);
}

export interface LetterRow {
  id: string;
  applicationId: string;
  kind: LetterKind;
  locale: "en" | "ar";
  title: string;
  createdAt: string;
}

export async function insertLetter(
  tx: Tx,
  input: Org & {
    applicationId: string;
    kind: LetterKind;
    locale: "en" | "ar";
    title: string;
    templateId: string | null;
    sentByUserId: string | null;
  },
): Promise<{ id: string; createdAt: string }> {
  const [row] = await tx.execute<{ id: string; created_at: string }>(sql`
    insert into core.admission_letters (tenant_id, org_id, application_id, kind, locale, title,
      template_id, sent_by_user_id)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.applicationId}::uuid, ${input.kind},
      ${input.locale}, ${input.title}, ${input.templateId}::uuid, ${input.sentByUserId}::uuid)
    returning id, ${isoOf(sql`created_at`)} as created_at`);
  if (!row) throw new Error("The letter was not recorded");
  return { id: row.id, createdAt: row.created_at };
}

/** The letters of applications, oldest first. */
export async function lettersOf(
  tx: Tx,
  input: { tenantId: string; applicationIds: readonly string[] },
): Promise<LetterRow[]> {
  if (input.applicationIds.length === 0) return [];
  const rows = await tx.execute<{
    id: string;
    application_id: string;
    kind: LetterKind;
    locale: "en" | "ar";
    title: string;
    created_at: string;
  }>(sql`
    select id, application_id, kind, locale, title, ${isoOf(sql`created_at`)} as created_at
    from core.admission_letters
    where tenant_id = ${input.tenantId}::uuid and application_id = any(${uuidArray(input.applicationIds)})
    order by created_at, id`);
  return rows.map((row) => ({
    id: row.id,
    applicationId: row.application_id,
    kind: row.kind,
    locale: row.locale,
    title: row.title,
    createdAt: row.created_at,
  }));
}

/** The application a letter belongs to, and who made it. */
export async function letterHolder(
  tx: Tx,
  input: { tenantId: string; letterId: string },
): Promise<{
  applicationId: string;
  filedByUserId: string;
  orgId: string;
} | null> {
  const [row] = await tx.execute<{
    application_id: string;
    filed_by_user_id: string;
    org_id: string;
  }>(sql`
    select l.application_id, a.filed_by_user_id, a.org_id
    from core.admission_letters l
    join core.admission_applications a on a.tenant_id = l.tenant_id and a.id = l.application_id
      and a.status = 'active'
    where l.tenant_id = ${input.tenantId}::uuid and l.id = ${input.letterId}::uuid`);
  return row
    ? {
        applicationId: row.application_id,
        filedByUserId: row.filed_by_user_id,
        orgId: row.org_id,
      }
    : null;
}

export interface EventRow {
  id: string;
  version: number;
  applicationId: string;
  itemId: string | null;
  kind: EventKind;
  startsOn: string;
  startTime: string;
  endTime: string;
  location: string;
  attendees: { id: string; nameEn: string | null; nameAr: string | null }[];
  outcome: EventOutcome;
  result: string;
}

/** The events booked for applications, in the order they happen. */
export async function eventsOf(
  tx: Tx,
  input: { tenantId: string; applicationIds: readonly string[] },
): Promise<EventRow[]> {
  if (input.applicationIds.length === 0) return [];
  const rows = await tx.execute<{
    id: string;
    version: number;
    application_id: string;
    item_id: string | null;
    kind: EventKind;
    starts_on: string;
    start_time: string;
    end_time: string;
    location: string;
    attendees: EventRow["attendees"] | null;
    outcome: EventOutcome;
    result: string;
  }>(sql`
    select e.id, e.version, e.application_id, e.item_id, e.kind, e.starts_on::text as starts_on,
      to_char(e.start_time, 'HH24:MI') as start_time, to_char(e.end_time, 'HH24:MI') as end_time,
      e.location, e.outcome, e.result,
      (select jsonb_agg(jsonb_build_object('id', u.id, 'nameEn', u.full_name_en, 'nameAr', u.full_name_ar)
          order by array_position(e.attendee_user_ids, u.id))
        from core.users u where u.tenant_id = e.tenant_id and u.id = any(e.attendee_user_ids)) as attendees
    from core.admission_events e
    where e.tenant_id = ${input.tenantId}::uuid and e.application_id = any(${uuidArray(input.applicationIds)})
      and e.status = 'active'
    order by e.starts_on, e.start_time, e.id`);
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    applicationId: row.application_id,
    itemId: row.item_id,
    kind: row.kind,
    startsOn: row.starts_on,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,
    attendees: row.attendees ?? [],
    outcome: row.outcome,
    result: row.result,
  }));
}

/** A tour, assessment or interview as the staff calendar shows it. */
export interface BookedEvent {
  id: string;
  applicationId: string;
  kind: EventKind;
  startsOn: string;
  startTime: string;
  endTime: string;
  location: string;
  outcome: EventOutcome;
  applicantNameEn: string | null;
  applicantNameAr: string | null;
}

/**
 * The school's tours, assessments and interviews between two days, in the
 * order they happen; with `attendeeId`, only those that person attends.
 */
export async function bookedBetween(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    from: string;
    to: string;
    attendeeId: string | null;
  },
): Promise<BookedEvent[]> {
  const rows = await tx.execute<{
    id: string;
    application_id: string;
    kind: EventKind;
    starts_on: string;
    start_time: string;
    end_time: string;
    location: string;
    outcome: EventOutcome;
    name_en: string | null;
    name_ar: string | null;
  }>(sql`
    select e.id, e.application_id, e.kind, to_char(e.starts_on, 'YYYY-MM-DD') as starts_on,
      to_char(e.start_time, 'HH24:MI') as start_time, to_char(e.end_time, 'HH24:MI') as end_time,
      e.location, e.outcome, u.full_name_en as name_en, u.full_name_ar as name_ar
    from core.admission_events e
    join core.admission_applications a on a.tenant_id = e.tenant_id and a.id = e.application_id
    join core.users u on u.tenant_id = a.tenant_id and u.id = a.applicant_user_id
    where e.tenant_id = ${input.tenantId}::uuid and e.org_id = ${input.orgId}::uuid
      and e.status = 'active' and e.starts_on between ${input.from}::date and ${input.to}::date
      and (${input.attendeeId}::uuid is null or ${input.attendeeId}::uuid = any(e.attendee_user_ids))
    order by e.starts_on, e.start_time, e.id
    limit 1000`);
  return rows.map((row) => ({
    id: row.id,
    applicationId: row.application_id,
    kind: row.kind,
    startsOn: row.starts_on,
    startTime: row.start_time,
    endTime: row.end_time,
    location: row.location,
    outcome: row.outcome,
    applicantNameEn: row.name_en,
    applicantNameAr: row.name_ar,
  }));
}

export interface EventFields {
  itemId: string | null;
  kind: EventKind;
  startsOn: string;
  startTime: string;
  endTime: string;
  location: string;
  attendeeIds: readonly string[];
}

export async function insertEvent(
  tx: Tx,
  input: Org & { applicationId: string } & EventFields,
): Promise<{ id: string; version: number }> {
  const [row] = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.admission_events (tenant_id, org_id, application_id, item_id, kind, starts_on,
      start_time, end_time, location, attendee_user_ids)
    values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.applicationId}::uuid,
      ${input.itemId}::uuid, ${input.kind}, ${input.startsOn}::date, ${input.startTime}::time,
      ${input.endTime}::time, ${input.location}, ${uuidArray(input.attendeeIds)})
    returning id, version`);
  if (!row) throw new Error("The event was not booked");
  return row;
}

/** Moves a booked event or changes who attends; null when it changed meanwhile or has happened. */
export async function updateEvent(
  tx: Tx,
  input: Org & {
    applicationId: string;
    id: string;
    expectedVersion: number;
  } & EventFields,
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.admission_events
    set item_id = ${input.itemId}::uuid, kind = ${input.kind}, starts_on = ${input.startsOn}::date,
      start_time = ${input.startTime}::time, end_time = ${input.endTime}::time,
      location = ${input.location}, attendee_user_ids = ${uuidArray(input.attendeeIds)}
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and application_id = ${input.applicationId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active' and outcome = 'scheduled'
    returning version`);
  return row?.version ?? null;
}

/** Records what came of an event; null when it changed meanwhile or was recorded already. */
export async function recordEventOutcome(
  tx: Tx,
  input: Org & {
    applicationId: string;
    id: string;
    expectedVersion: number;
    outcome: Exclude<EventOutcome, "scheduled">;
    result: string;
  },
): Promise<number | null> {
  const [row] = await tx.execute<{ version: number }>(sql`
    update core.admission_events set outcome = ${input.outcome}, result = ${input.result}
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and application_id = ${input.applicationId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active' and outcome = 'scheduled'
    returning version`);
  return row?.version ?? null;
}

export interface FunnelRow {
  intakeId: string;
  intakeEn: string | null;
  intakeAr: string | null;
  capacity: number;
  /** Where the family first came from: the enquiry it grew out of, or straight to the application. */
  origin: EnquirySource | "direct";
  state: ApplicationState;
  /** Every state the application has been in, from its history. */
  states: ApplicationState[];
}

/** The applications sent to the intakes, each with where it came from and the states it went through. */
export async function funnelRows(
  tx: Tx,
  input: Org & { intakeIds: readonly string[] },
): Promise<FunnelRow[]> {
  const rows = await tx.execute<{
    intake_id: string;
    intake_en: string | null;
    intake_ar: string | null;
    capacity: number;
    origin: EnquirySource | null;
    state: ApplicationState;
    states: ApplicationState[] | null;
  }>(sql`
    select a.intake_id, i.title_en as intake_en, i.title_ar as intake_ar, i.capacity, e.source as origin, a.state,
      (select array_agg(n.details->>'to' order by n.created_at) from core.admission_entries n
        where n.tenant_id = a.tenant_id and n.application_id = a.id and n.kind = 'state') as states
    from core.admission_applications a
    join core.admission_intakes i on i.tenant_id = a.tenant_id and i.id = a.intake_id
    left join core.site_enquiries e on e.tenant_id = a.tenant_id and e.id = a.enquiry_id
    where a.tenant_id = ${input.tenantId}::uuid and a.org_id = ${input.orgId}::uuid
      and i.id = any(${uuidArray(input.intakeIds)}) and i.status = 'active'
      and a.state <> 'draft' and a.submitted_at is not null`);
  return rows.map((row) => ({
    intakeId: row.intake_id,
    intakeEn: row.intake_en,
    intakeAr: row.intake_ar,
    capacity: row.capacity,
    origin: row.origin ?? "direct",
    state: row.state,
    states: row.states ?? [],
  }));
}

export interface StageTime {
  state: ApplicationState;
  /** Applications that have left the state, which the times are measured from. */
  left: number;
  /** Applications in it now. */
  current: number;
  medianDays: number | null;
  averageDays: number | null;
}

/**
 * How long applications of the intakes stay in each state, from their
 * history: each stay ends when the next change of state is recorded.
 */
export async function stageTimes(
  tx: Tx,
  input: Org & { intakeIds: readonly string[] },
): Promise<StageTime[]> {
  const rows = await tx.execute<{
    state: ApplicationState;
    left_count: number;
    now_count: number;
    median_days: number | null;
    average_days: number | null;
  }>(sql`
    with stays as (
      select n.details->>'to' as state, n.created_at,
        lead(n.created_at) over (partition by n.application_id order by n.created_at, n.id) as ended_at
      from core.admission_entries n
      join core.admission_applications a on a.tenant_id = n.tenant_id and a.id = n.application_id
        and a.status = 'active'
      join core.admission_intakes i on i.tenant_id = a.tenant_id and i.id = a.intake_id
      where n.tenant_id = ${input.tenantId}::uuid and n.org_id = ${input.orgId}::uuid
        and n.kind = 'state' and i.id = any(${uuidArray(input.intakeIds)})
    )
    select state, count(ended_at)::int as left_count, (count(*) - count(ended_at))::int as now_count,
      round((percentile_cont(0.5) within group (order by extract(epoch from ended_at - created_at))
        filter (where ended_at is not null) / 86400)::numeric, 1)::float8 as median_days,
      round((avg(extract(epoch from ended_at - created_at)) filter (where ended_at is not null)
        / 86400)::numeric, 1)::float8 as average_days
    from stays where state is not null
    group by state`);
  return rows.map((row) => ({
    state: row.state,
    left: row.left_count,
    current: row.now_count,
    medianDays: row.median_days,
    averageDays: row.average_days,
  }));
}

/** The application of a later year one was deferred into, if it was. */
export async function deferredFrom(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<string | null> {
  const [row] = await tx.execute<{ id: string }>(sql`
    select id from core.admission_applications
    where tenant_id = ${input.tenantId}::uuid and deferred_from_id = ${input.id}::uuid
      and status = 'active'
    order by created_at desc limit 1`);
  return row?.id ?? null;
}
