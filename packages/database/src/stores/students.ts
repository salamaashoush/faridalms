import type { StudentStatus } from "@faridalms/domain/people";

import { familyRoleFor } from "@faridalms/domain/family-roles";
import { fullName } from "@faridalms/domain/people";
import { and, eq, sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { DepartureEnded } from "../tables/membership";
import type { PostalAddress } from "../tables/tenancy";

import {
  studentDepartures,
  userRelationships,
  userRoles,
} from "../tables/membership";
import { contactPoints, externalIds, users } from "../tables/people";
import { bounds, intArray, textArray, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface Scope {
  tenantId: string;
  schoolId: string;
  today: string;
  viewerId: string;
  /** The viewer may reach every student of the school. */
  schoolWide: boolean;
}

const visible = (scope: Scope) =>
  sql`(select student_user_id from app.visible_students(${scope.viewerId}::uuid, ${scope.schoolId}::uuid, ${scope.today}::date, ${scope.schoolWide}))`;

const roleRows = (scope: Pick<Scope, "tenantId" | "schoolId">) =>
  sql`core.user_roles r where r.tenant_id = ${scope.tenantId}::uuid and r.org_id = ${scope.schoolId}::uuid
    and r.role = 'student' and r.status = 'active'`;

/** The status the list shows, from the student's roles at this school (mirrors `roleStatus`). */
const statusSql = (scope: Scope) => sql`(
  case
    when exists (select 1 from ${roleRows(scope)} and r.user_id = u.id
                   and r.valid_during @> ${scope.today}::date) then 'enrolled'
    when exists (select 1 from ${roleRows(scope)} and r.user_id = u.id
                   and lower(r.valid_during) > ${scope.today}::date) then 'pre_enrolled'
    else 'left'
  end)`;

const referenceSql = (scope: Scope) => sql`(
  select e.identifier from core.external_ids e
  where e.tenant_id = u.tenant_id and e.user_id = u.id and e.system_meaning = 'school_reference'
    and e.status = 'active' and (e.assigning_org_id = ${scope.schoolId}::uuid or e.assigning_org_id is null)
    and (upper_inf(e.valid_during) or upper(e.valid_during) > ${scope.today}::date)
  order by e.assigning_org_id nulls last limit 1)`;

/**
 * The students a module's view names, with the status it gives each in
 * place of the role's: a year's students, say, by their placement.
 */
export interface GivenStudents {
  ids: readonly string[];
  statuses: readonly StudentStatus[];
}

/** A module's order of the students, as a rank each; the unranked come last. */
export interface StudentRanks {
  ids: readonly string[];
  ranks: readonly number[];
}

export interface DirectoryFilter {
  /** Absent, the list is the school's students: current, coming, and with the `left` status those gone. */
  given: GivenStudents | null;
  q: string;
  phone: string | null;
  /** Students whose identity document number the search matched exactly. */
  documentHolders: string[];
  /** Only these students, where a module's filter narrows the list. */
  within: readonly string[] | null;
  statuses: StudentStatus[];
  missingGuardian: boolean;
  missingAccount: boolean;
  sort: "name" | "reference" | "rank";
  dir: "asc" | "desc";
  locale: "ar" | "en";
  ranks: StudentRanks | null;
  page: number;
  pageSize: number;
}

export interface DirectoryRow {
  id: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  photoFileId: string | null;
  reference: string | null;
  status: StudentStatus;
  guardianPhone: string | null;
  hasGuardian: boolean;
  hasAccount: boolean;
  medicalAlert: boolean;
  custodyAlert: boolean;
}

export async function studentDirectory(
  tx: Tx,
  scope: Scope,
  filter: DirectoryFilter,
): Promise<{ rows: DirectoryRow[]; total: number }> {
  const direction = filter.dir === "desc" ? sql`desc` : sql`asc`;
  const nameKey =
    filter.locale === "ar"
      ? sql`coalesce(u.full_name_ar, u.full_name_en) collate "ar-x-icu"`
      : sql`coalesce(u.full_name_en, u.full_name_ar) collate "en-x-icu"`;
  const order =
    filter.sort === "reference"
      ? sql`reference ${direction} nulls last, ${nameKey}, u.id`
      : filter.sort === "rank"
        ? sql`u.rank ${direction} nulls last, ${nameKey}, u.id`
        : sql`${nameKey} ${direction}, u.id`;
  const q = filter.q.trim();
  const words =
    q === ""
      ? sql`true`
      : filter.phone
        ? sql`exists (select 1 from core.user_relationships r
                join core.contact_points c on c.tenant_id = r.tenant_id and c.user_id = r.related_user_id
                where r.tenant_id = ${scope.tenantId}::uuid and r.student_user_id = u.id and r.status = 'active'
                  and c.status = 'active' and c.kind = 'phone' and c.normalized = ${filter.phone})`
        : sql`(upper(u.reference) = upper(${q})
               or u.id in (select result_id from app.search(${q}, array['user'], ${uuidArray([scope.schoolId])},
                 within => array${visible(scope)})))`;
  const search =
    filter.documentHolders.length > 0
      ? sql`(${words} or u.id = any(${uuidArray(filter.documentHolders)}))`
      : words;
  const rows = await tx.execute<{
    id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    photo_file_id: string | null;
    reference: string | null;
    status: StudentStatus;
    guardian_phone: string | null;
    has_guardian: boolean;
    has_account: boolean;
    medical_alert: boolean;
    custody_alert: boolean;
    total: number;
  }>(sql`
    with given as (
      select g.id as student_user_id, g.status
      from unnest(${uuidArray([...(filter.given?.ids ?? [])])}, ${textArray([...(filter.given?.statuses ?? [])])})
        as g(id, status)
    ), members as (
      select student_user_id, status from given
      union
      select distinct r.user_id, null::text from ${roleRows(scope)} and ${filter.given === null}
    ), ranked as (
      select k.id, k.rank from unnest(${uuidArray([...(filter.ranks?.ids ?? [])])},
        ${intArray(filter.ranks?.ranks ?? [])}) as k(id, rank)
    ), listed as (
      select u.id, u.full_name_en, u.full_name_ar, u.photo_file_id, u.medical_alert, u.custody_alert,
             (select k.rank from ranked k where k.id = u.id) as rank,
             ${referenceSql(scope)} as reference,
             coalesce(m.status, ${statusSql(scope)}) as status,
             (select c.normalized from core.user_relationships r
                join core.contact_points c on c.tenant_id = r.tenant_id and c.user_id = r.related_user_id
                where r.tenant_id = u.tenant_id and r.student_user_id = u.id and r.status = 'active'
                  and r.valid_during @> ${scope.today}::date and c.status = 'active' and c.kind = 'phone'
                order by r.primary_contact desc, r.contact_priority nulls last, c.priority nulls last, c.created_at
                limit 1) as guardian_phone,
             exists (select 1 from core.user_relationships r
                where r.tenant_id = u.tenant_id and r.student_user_id = u.id and r.status = 'active'
                  and r.valid_during @> ${scope.today}::date
                  and (r.portal_access or r.legal_guardian)) as has_guardian,
             exists (select 1 from core.accounts a
                where a.tenant_id = u.tenant_id and a.user_id = u.id and a.status = 'active'
                  and a.state = 'active') as has_account
      from members m
      join core.users u on u.tenant_id = ${scope.tenantId}::uuid and u.id = m.student_user_id and u.status = 'active'
      where u.id in ${visible(scope)}
    )
    select u.*, count(*) over ()::int as total
    from listed u
    where ${search}
      and (${filter.given !== null} or u.status <> 'left' or 'left' = any(${textArray(filter.statuses)}))
      and (${filter.within === null} or u.id = any(${uuidArray([...(filter.within ?? [])])}))
      and (${filter.statuses.length === 0} or u.status = any(${textArray(filter.statuses)}))
      and (not ${filter.missingGuardian} or not u.has_guardian)
      and (not ${filter.missingAccount} or not u.has_account)
    order by ${order}
    limit ${filter.pageSize} offset ${(filter.page - 1) * filter.pageSize}`);
  return {
    total: rows[0]?.total ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      fullNameEn: row.full_name_en,
      fullNameAr: row.full_name_ar,
      photoFileId: row.photo_file_id,
      reference: row.reference,
      status: row.status,
      guardianPhone: row.guardian_phone,
      hasGuardian: row.has_guardian,
      hasAccount: row.has_account,
      medicalAlert: row.medical_alert,
      custodyAlert: row.custody_alert,
    })),
  };
}

/** Which of these students the viewer reaches, as `app.visible_students` decides. */
export async function reachedStudents(
  tx: Tx,
  scope: Scope,
  studentIds: readonly string[],
): Promise<Set<string>> {
  if (studentIds.length === 0) return new Set();
  const rows = await tx.execute<{ user_id: string }>(sql`
    select t.user_id from unnest(${uuidArray(studentIds)}) as t(user_id)
    where t.user_id in ${visible(scope)}`);
  return new Set(rows.map((row) => row.user_id));
}

export interface SignInSeed {
  userId: string;
  /** The account the student holds, with the name its password goes by. */
  accountId: string | null;
  accountState: string | null;
  loginName: string | null;
  /** The name kept for an account whose password nobody has chosen yet. */
  reservedName: string | null;
  email: string | null;
  reference: string | null;
  givenNameEn: string | null;
  familyNameEn: string | null;
  givenNameAr: string | null;
}

/**
 * What a sign-in for each student starts from: the account they hold, and
 * what could name a new one. Only students the viewer reaches come back.
 */
export async function signInSeeds(
  tx: Tx,
  scope: Scope,
  studentIds: readonly string[],
): Promise<SignInSeed[]> {
  if (studentIds.length === 0) return [];
  const rows = await tx.execute<{
    id: string;
    account_id: string | null;
    state: string | null;
    login_name: string | null;
    username: string | null;
    email: string | null;
    reference: string | null;
    given_name_en: string | null;
    family_name_en: string | null;
    given_name_ar: string | null;
  }>(sql`
    select u.id, a.id as account_id, a.state, l.login_name, u.username, u.given_name_en, u.family_name_en,
           coalesce(u.preferred_given_name, u.given_name_ar) as given_name_ar,
           ${referenceSql(scope)} as reference,
           (select c.normalized from core.contact_points c
            where c.tenant_id = u.tenant_id and c.user_id = u.id and c.kind = 'email' and c.status = 'active'
            order by c.priority nulls last, c.created_at limit 1) as email
    from core.users u
    left join core.accounts a on a.tenant_id = u.tenant_id and a.user_id = u.id and a.status = 'active'
    left join core.login_identities l on l.tenant_id = a.tenant_id and l.account_id = a.id
      and l.kind = 'password' and l.status = 'active' and l.voided_at is null
    where u.tenant_id = ${scope.tenantId}::uuid and u.status = 'active'
      and u.id = any(${uuidArray(studentIds)}) and u.id in ${visible(scope)}
    order by u.full_name_en, u.full_name_ar, u.id`);
  return rows.map((row) => ({
    userId: row.id,
    accountId: row.account_id,
    accountState: row.state,
    loginName: row.login_name,
    reservedName: row.login_name ? null : row.username,
    email: row.email,
    reference: row.reference,
    givenNameEn: row.given_name_en,
    familyNameEn: row.family_name_en,
    givenNameAr: row.given_name_ar,
  }));
}

/** A student's days at the school, as their student roles there hold them, earliest first. */
export async function studentRoles(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId">,
  studentId: string,
): Promise<{ from: string; to: string | null }[]> {
  const rows = await tx.execute<{ valid_during: string }>(sql`
    select r.valid_during::text as valid_during from ${roleRows(scope)} and r.user_id = ${studentId}::uuid
    order by lower(r.valid_during)`);
  return rows.map((row) => bounds(row.valid_during));
}

export interface Departure {
  id: string;
  /** The first day the student is not at the school. */
  leftOn: string;
  /** The first day they and their family no longer read the record. */
  accessEndsOn: string;
  ended: DepartureEnded;
}

/** The departure that stands for a student at the school, if they have left. */
export async function departureOf(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId">,
  studentId: string,
): Promise<Departure | null> {
  const [row] = await tx
    .select({
      id: studentDepartures.id,
      leftOn: studentDepartures.leftOn,
      accessEndsOn: studentDepartures.accessEndsOn,
      ended: studentDepartures.ended,
    })
    .from(studentDepartures)
    .where(
      and(
        eq(studentDepartures.tenantId, scope.tenantId),
        eq(studentDepartures.orgId, scope.schoolId),
        eq(studentDepartures.studentUserId, studentId),
        eq(studentDepartures.status, "active"),
      ),
    );
  return row ?? null;
}

/**
 * Records a student leaving: their student role ends on the day they left
 * (one that was only to begin later is dropped), and the departure keeps
 * that day, the day the record closes to them and their family, and what
 * leaving ended, for a return to give back.
 */
export async function recordDeparture(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId">,
  input: {
    studentId: string;
    leftOn: string;
    accessEndsOn: string;
    ended: Omit<DepartureEnded, "role">;
  },
): Promise<string> {
  const held = sql`tenant_id = ${scope.tenantId}::uuid and org_id = ${scope.schoolId}::uuid
    and user_id = ${input.studentId}::uuid and role = 'student' and status = 'active'`;
  const [role] = await tx.execute<{
    id: string;
    starts: string;
    until: string | null;
  }>(sql`
    select id, lower(valid_during)::text as starts, upper(valid_during)::text as until
    from core.user_roles
    where ${held} and (upper_inf(valid_during) or upper(valid_during) > ${input.leftOn}::date)
    order by lower(valid_during) desc limit 1`);
  if (role && role.starts >= input.leftOn)
    await tx.execute(sql`
      update core.user_roles set status = 'tobedeleted'
      where tenant_id = ${scope.tenantId}::uuid and id = ${role.id}::uuid`);
  else if (role)
    await tx.execute(sql`
      update core.user_roles set valid_during = daterange(lower(valid_during), ${input.leftOn}::date)
      where tenant_id = ${scope.tenantId}::uuid and id = ${role.id}::uuid`);
  const [row] = await tx
    .insert(studentDepartures)
    .values({
      tenantId: scope.tenantId,
      orgId: scope.schoolId,
      studentUserId: input.studentId,
      leftOn: input.leftOn,
      accessEndsOn: input.accessEndsOn,
      ended: {
        role: role
          ? {
              id: role.id,
              until: role.until,
              dropped: role.starts >= input.leftOn,
            }
          : null,
        ...input.ended,
      },
    })
    .returning({ id: studentDepartures.id });
  if (!row) throw new Error("departure was not recorded");
  return row.id;
}

/**
 * Takes a departure back: the student role runs as it did before, and the
 * departure stands no more. The caller gives back the enrollments it ended.
 */
export async function withdrawDeparture(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId">,
  departure: Departure,
) {
  const role = departure.ended.role;
  if (role?.dropped)
    await tx.execute(sql`
      update core.user_roles set status = 'active'
      where tenant_id = ${scope.tenantId}::uuid and id = ${role.id}::uuid`);
  else if (role)
    await tx.execute(sql`
      update core.user_roles set valid_during = daterange(lower(valid_during), ${role.until}::date)
      where tenant_id = ${scope.tenantId}::uuid and id = ${role.id}::uuid`);
  await tx
    .update(studentDepartures)
    .set({ status: "tobedeleted" })
    .where(
      and(
        eq(studentDepartures.tenantId, scope.tenantId),
        eq(studentDepartures.id, departure.id),
      ),
    );
}

export interface StudentPerson {
  id: string;
  version: number;
  givenNameAr: string | null;
  middleNameAr: string | null;
  familyNameAr: string | null;
  fullNameAr: string | null;
  givenNameEn: string | null;
  middleNameEn: string | null;
  familyNameEn: string | null;
  fullNameEn: string | null;
  preferredGivenName: string | null;
  birthDate: string | null;
  sexId: string | null;
  photoFileId: string | null;
  medicalAlert: boolean;
  custodyAlert: boolean;
  createdAt: Date;
}

export async function person(
  tx: Tx,
  userId: string,
): Promise<StudentPerson | null> {
  const [row] = await tx
    .select({
      id: users.id,
      version: users.version,
      givenNameAr: users.givenNameAr,
      middleNameAr: users.middleNameAr,
      familyNameAr: users.familyNameAr,
      fullNameAr: users.fullNameAr,
      givenNameEn: users.givenNameEn,
      middleNameEn: users.middleNameEn,
      familyNameEn: users.familyNameEn,
      fullNameEn: users.fullNameEn,
      preferredGivenName: users.preferredGivenName,
      birthDate: users.birthDate,
      sexId: users.sexDescriptorId,
      photoFileId: users.photoFileId,
      medicalAlert: users.medicalAlert,
      custodyAlert: users.custodyAlert,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.status, "active")));
  return row ?? null;
}

export async function referenceOf(tx: Tx, scope: Scope, userId: string) {
  const rows = await tx.execute<{
    id: string;
    identifier: string;
    version: number;
  }>(sql`
    select e.id, e.identifier, e.version from core.external_ids e
    where e.tenant_id = ${scope.tenantId}::uuid and e.user_id = ${userId}::uuid
      and e.system_meaning = 'school_reference' and e.status = 'active'
      and (e.assigning_org_id = ${scope.schoolId}::uuid or e.assigning_org_id is null)
      and (upper_inf(e.valid_during) or upper(e.valid_during) > ${scope.today}::date)
    order by e.assigning_org_id nulls last limit 1`);
  return rows[0] ?? null;
}

export interface ContactPoint {
  id: string;
  kind: "email" | "phone" | "postal";
  label: string;
  value: string;
  normalized: string | null;
  postal: PostalAddress | null;
  verified: boolean;
}

export interface Guardian {
  relationshipId: string;
  version: number;
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  relationId: string;
  relationMeaning: string;
  legalGuardian: boolean | null;
  portalAccess: boolean;
  receivesNotifications: boolean;
  primaryContact: boolean;
  emergencyContact: boolean;
  contactPriority: number | null;
  residence: "primary" | "secondary" | "none" | null;
  pickup: "allowed" | "not_allowed" | "ask_office" | null;
  educationalRights: "full" | "restricted" | "none";
  communicationIsolated: boolean;
  accessBasis: string;
  from: string;
  hasAccount: boolean;
  contacts: ContactPoint[];
}

export async function guardiansOf(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "today">,
  studentId: string,
): Promise<Guardian[]> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    related_user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    relation_descriptor_id: string;
    relation_meaning: string;
    legal_guardian: boolean | null;
    portal_access: boolean;
    receives_notifications: boolean;
    primary_contact: boolean;
    emergency_contact: boolean;
    contact_priority: number | null;
    residence: Guardian["residence"];
    pickup: Guardian["pickup"];
    educational_rights: Guardian["educationalRights"];
    communication_isolated: boolean;
    access_basis: string;
    valid_during: string;
    has_account: boolean;
  }>(sql`
    select r.id, r.version, r.related_user_id, u.full_name_en, u.full_name_ar, r.relation_descriptor_id,
           r.relation_meaning, r.legal_guardian, r.portal_access, r.receives_notifications, r.primary_contact,
           r.emergency_contact, r.contact_priority, r.residence, r.pickup, r.educational_rights,
           r.communication_isolated, r.access_basis, r.valid_during::text as valid_during,
           exists (select 1 from core.accounts a where a.tenant_id = u.tenant_id and a.user_id = u.id
                   and a.status = 'active' and a.state <> 'disabled') as has_account
    from core.user_relationships r
    join core.users u on u.tenant_id = r.tenant_id and u.id = r.related_user_id
    where r.tenant_id = ${scope.tenantId}::uuid and r.student_user_id = ${studentId}::uuid
      and r.status = 'active' and r.valid_during @> ${scope.today}::date
    order by r.primary_contact desc, r.contact_priority nulls last, r.created_at`);
  const people = rows.map((row) => row.related_user_id);
  const contacts = people.length
    ? await tx.execute<{
        id: string;
        user_id: string;
        kind: ContactPoint["kind"];
        label: string;
        value: string;
        normalized: string | null;
        postal: PostalAddress | null;
        verified_at: string | null;
      }>(sql`
        select id, user_id, kind, label, value, normalized, postal, verified_at::text as verified_at
        from core.contact_points
        where tenant_id = ${scope.tenantId}::uuid and user_id = any(${uuidArray(people)}) and status = 'active'
        order by priority nulls last, created_at`)
    : [];
  return rows.map((row) => ({
    relationshipId: row.id,
    version: row.version,
    userId: row.related_user_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    relationId: row.relation_descriptor_id,
    relationMeaning: row.relation_meaning,
    legalGuardian: row.legal_guardian,
    portalAccess: row.portal_access,
    receivesNotifications: row.receives_notifications,
    primaryContact: row.primary_contact,
    emergencyContact: row.emergency_contact,
    contactPriority: row.contact_priority,
    residence: row.residence,
    pickup: row.pickup,
    educationalRights: row.educational_rights,
    communicationIsolated: row.communication_isolated,
    accessBasis: row.access_basis,
    from: bounds(row.valid_during).from,
    hasAccount: row.has_account,
    contacts: contacts
      .filter((contact) => contact.user_id === row.related_user_id)
      .map((contact) => ({
        id: contact.id,
        kind: contact.kind,
        label: contact.label,
        value: contact.value,
        normalized: contact.normalized,
        postal: contact.postal,
        verified: contact.verified_at !== null,
      })),
  }));
}

export interface NamesInput {
  ar: { given: string | null; middle: string | null; family: string | null };
  en: { given: string | null; middle: string | null; family: string | null };
}

export function nameColumns(names: NamesInput) {
  return {
    givenNameAr: names.ar.given,
    middleNameAr: names.ar.middle,
    familyNameAr: names.ar.family,
    fullNameAr: fullName(names.ar),
    givenNameEn: names.en.given,
    middleNameEn: names.en.middle,
    familyNameEn: names.en.family,
    fullNameEn: fullName(names.en),
    namePartsSource: "entered" as const,
  };
}

/** Students sharing a birth date and a name in either script. */
export async function studentMatches(
  tx: Tx,
  scope: Scope,
  input: {
    fullNameEn: string | null;
    fullNameAr: string | null;
    birthDate: string;
    exceptId?: string;
  },
) {
  const rows = await tx.execute<{
    id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    birth_date: string;
    here: boolean;
  }>(sql`
    select u.id, u.full_name_en, u.full_name_ar, u.birth_date::text as birth_date,
           u.id in ${visible({ ...scope, schoolWide: true })} as here
    from core.users u
    where u.tenant_id = ${scope.tenantId}::uuid and u.status = 'active' and u.birth_date = ${input.birthDate}::date
      and (${input.exceptId ?? null}::uuid is null or u.id <> ${input.exceptId ?? null}::uuid)
      and (app.normalize_name(u.full_name_en) = app.normalize_name(${input.fullNameEn})
           or app.normalize_name(u.full_name_ar) = app.normalize_name(${input.fullNameAr}))
      and exists (select 1 from core.user_roles r where r.tenant_id = u.tenant_id and r.user_id = u.id
                  and r.role = 'student' and r.status = 'active')
    limit 5`);
  return rows.map((row) => ({
    id: row.id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    birthDate: row.birth_date,
    atThisSchool: row.here,
  }));
}

/** People who hold a phone number or email address, for linking an existing guardian. */
export async function peopleByContact(
  tx: Tx,
  tenantId: string,
  contact: { kind: "phone" | "email"; normalized: string },
) {
  const rows = await tx.execute<{
    id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    birth_year: number | null;
    photo_file_id: string | null;
  }>(sql`
    select distinct u.id, u.full_name_en, u.full_name_ar,
           extract(year from u.birth_date)::int as birth_year, u.photo_file_id
    from core.contact_points c
    join core.users u on u.tenant_id = c.tenant_id and u.id = c.user_id and u.status = 'active'
    where c.tenant_id = ${tenantId}::uuid and c.kind = ${contact.kind} and c.normalized = ${contact.normalized}
      and c.status = 'active'
    limit 5`);
  return rows.map((row) => ({
    id: row.id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    birthYear: row.birth_year,
    photoFileId: row.photo_file_id,
  }));
}

export async function addContact(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    kind: "phone" | "email";
    value: string;
    normalized: string | null;
    label: "mobile" | "personal" | "work" | "home" | "other";
    /** Typed by the person themselves rather than by the office. */
    source?: "manual" | "self_service";
  },
) {
  await tx
    .insert(contactPoints)
    .values({
      tenantId: input.tenantId,
      userId: input.userId,
      kind: input.kind,
      label: input.label,
      value: input.value,
      normalized: input.normalized,
      smsCapable: input.kind === "phone" ? true : null,
      source: input.source ?? "manual",
    })
    .onConflictDoNothing();
}

/**
 * Marks a person's email as theirs once a link sent to it was used, so it
 * may also sign them in and recover the account.
 */
export async function confirmEmail(
  tx: Tx,
  input: { tenantId: string; userId: string; email: string },
) {
  await tx.execute(sql`
    update core.contact_points
    set verified_at = coalesce(verified_at, statement_timestamp()),
      verification_method = coalesce(verification_method, 'invitation'),
      purposes = array(select distinct unnest(purposes || array['login', 'recovery']::text[]))
    where tenant_id = ${input.tenantId}::uuid and user_id = ${input.userId}::uuid
      and kind = 'email' and normalized = ${input.email.toLowerCase()} and status = 'active'`);
}

export async function insertPerson(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    names: NamesInput;
    preferredGivenName?: string | null;
    birthDate?: string | null;
    sexId?: string | null;
  },
) {
  const [row] = await tx
    .insert(users)
    .values({
      tenantId: input.tenantId,
      ...nameColumns(input.names),
      preferredGivenName: input.preferredGivenName ?? null,
      birthDate: input.birthDate ?? null,
      birthDateSource: input.birthDate ? "school_record" : null,
      sexDescriptorId: input.sexId ?? null,
      primaryOrgId: input.schoolId,
    })
    .returning({ id: users.id, version: users.version });
  if (!row) throw new Error("person was not created");
  return row;
}

export async function updatePerson(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    expectedVersion: number;
    names: NamesInput;
    preferredGivenName: string | null;
    birthDate: string | null;
    sexId: string | null;
  },
) {
  const [row] = await tx
    .update(users)
    .set({
      ...nameColumns(input.names),
      preferredGivenName: input.preferredGivenName,
      birthDate: input.birthDate,
      birthDateSource: input.birthDate ? "school_record" : null,
      sexDescriptorId: input.sexId,
    })
    .where(
      and(
        eq(users.tenantId, input.tenantId),
        eq(users.id, input.userId),
        eq(users.version, input.expectedVersion),
        eq(users.status, "active"),
      ),
    )
    .returning({ id: users.id, version: users.version });
  return row ?? null;
}

/** Sets the school reference, retiring a different one entered before. */
export async function setReference(
  tx: Tx,
  scope: Scope,
  input: { userId: string; reference: string; systemId: string },
) {
  const current = await referenceOf(tx, scope, input.userId);
  if (current?.identifier === input.reference) return;
  if (current)
    await tx
      .update(externalIds)
      .set({ status: "tobedeleted" })
      .where(
        and(
          eq(externalIds.tenantId, scope.tenantId),
          eq(externalIds.id, current.id),
        ),
      );
  await tx.insert(externalIds).values({
    tenantId: scope.tenantId,
    userId: input.userId,
    systemDescriptorId: input.systemId,
    systemMeaning: "school_reference",
    identifier: input.reference,
    assigningOrgId: scope.schoolId,
    validDuring: `[${scope.today},)`,
  });
}

export async function ensureStudentRole(
  tx: Tx,
  scope: Scope,
  studentId: string,
  from: string,
) {
  const rows = await tx.execute<{
    id: string;
    starts: string;
    ends: boolean;
  }>(sql`
    select id, lower(valid_during)::text as starts, not upper_inf(valid_during) as ends from core.user_roles
    where tenant_id = ${scope.tenantId}::uuid and user_id = ${studentId}::uuid and org_id = ${scope.schoolId}::uuid
      and role = 'student' and status = 'active' and (upper_inf(valid_during) or upper(valid_during) > ${from}::date)
    order by lower(valid_during)`);
  const first = rows[0];
  const last = rows.at(-1);
  if (!first || !last) {
    await tx.insert(userRoles).values({
      tenantId: scope.tenantId,
      userId: studentId,
      orgId: scope.schoolId,
      orgType: "school",
      role: "student",
      validDuring: `[${from},)`,
      source: "derived",
    });
    return;
  }
  // A student in the school's classes from a day is its student from then.
  if (first.starts > from)
    await tx.execute(sql`
      update core.user_roles set valid_during = daterange(${from}::date, upper(valid_during))
      where tenant_id = ${scope.tenantId}::uuid and id = ${first.id}::uuid`);
  // One who left and is placed again is a student of the school for as
  // long as any other.
  if (last.ends)
    await tx.execute(sql`
      update core.user_roles set valid_during = daterange(lower(valid_during), null)
      where tenant_id = ${scope.tenantId}::uuid and id = ${last.id}::uuid`);
}

/**
 * Brings the family roles a person holds in line with their current
 * relationships: a role at each school where a related student holds a
 * current student role, while the relationship grants portal access or legal
 * guardianship. Roles no relationship supports any more end today.
 */
export async function syncFamilyRoles(
  tx: Tx,
  tenantId: string,
  personId: string,
  today: string,
) {
  const links = await tx.execute<{
    relation_meaning: string;
    portal_access: boolean;
    legal_guardian: boolean | null;
    access_basis: string;
    org_id: string;
  }>(sql`
    select r.relation_meaning, r.portal_access, r.legal_guardian, r.access_basis, s.org_id
    from core.user_relationships r
    join lateral (
      select s.org_id from core.user_roles s
      where s.tenant_id = r.tenant_id and s.user_id = r.student_user_id
        and s.role = 'student' and s.status = 'active'
        and (upper_inf(s.valid_during) or upper(s.valid_during) > ${today}::date)
      union
      select d.org_id from core.student_departures d
      where d.tenant_id = r.tenant_id and d.student_user_id = r.student_user_id
        and d.status = 'active' and d.access_ends_on > ${today}::date) s on true
    where r.tenant_id = ${tenantId}::uuid and r.related_user_id = ${personId}::uuid and r.status = 'active'
      and (upper_inf(r.valid_during) or upper(r.valid_during) > ${today}::date)`);
  const wanted = new Set<string>();
  for (const link of links) {
    const role = familyRoleFor(link.relation_meaning, {
      portalAccess: link.portal_access,
      legalGuardian: link.legal_guardian,
      accessBasis: link.access_basis,
    });
    if (role) wanted.add(`${link.org_id}:${role}`);
  }
  const held = await tx.execute<{
    id: string;
    org_id: string;
    role: string;
    lower: string;
  }>(sql`
    select id, org_id, role, lower(valid_during)::text as lower from core.user_roles
    where tenant_id = ${tenantId}::uuid and user_id = ${personId}::uuid and source = 'derived'
      and role in ('parent', 'guardian', 'relative') and status = 'active'
      and (upper_inf(valid_during) or upper(valid_during) > ${today}::date)`);
  for (const row of held) {
    if (wanted.delete(`${row.org_id}:${row.role}`)) continue;
    await tx
      .update(userRoles)
      .set(
        row.lower >= today
          ? { status: "tobedeleted" }
          : { validDuring: `[${row.lower},${today})` },
      )
      .where(and(eq(userRoles.tenantId, tenantId), eq(userRoles.id, row.id)));
  }
  for (const key of wanted) {
    const [orgId, role] = key.split(":") as [
      string,
      "parent" | "guardian" | "relative",
    ];
    await tx.insert(userRoles).values({
      tenantId,
      userId: personId,
      orgId,
      orgType: "school",
      role,
      validDuring: `[${today},)`,
      source: "derived",
    });
  }
}

export async function insertRelationship(
  tx: Tx,
  input: {
    tenantId: string;
    studentId: string;
    relatedUserId: string;
    relationId: string;
    relationMeaning: string;
    flags: {
      legalGuardian: boolean | null;
      portalAccess: boolean;
      receivesNotifications: boolean;
      primaryContact: boolean;
      emergencyContact: boolean;
      residence: "primary" | "secondary" | "none" | null;
      pickup: "allowed" | "not_allowed" | "ask_office" | null;
    };
    from: string;
    /** Who on the staff confirmed it; null for a link a family declared, still to be checked. */
    verifiedByUserId: string | null;
  },
) {
  const [row] = await tx
    .insert(userRelationships)
    .values({
      tenantId: input.tenantId,
      studentUserId: input.studentId,
      relatedUserId: input.relatedUserId,
      relationDescriptorId: input.relationId,
      relationMeaning: input.relationMeaning,
      ...input.flags,
      validDuring: `[${input.from},)`,
      ...(input.verifiedByUserId
        ? {
            verificationMethod: "staff_attested" as const,
            verifiedAt: new Date(),
            verifiedByUserId: input.verifiedByUserId,
          }
        : {}),
    })
    .returning({ id: userRelationships.id });
  if (!row) throw new Error("relationship was not created");
  return row.id;
}

export async function updateRelationship(
  tx: Tx,
  input: {
    tenantId: string;
    relationshipId: string;
    expectedVersion: number;
    relationId: string;
    relationMeaning: string;
    flags: {
      legalGuardian: boolean | null;
      portalAccess: boolean;
      receivesNotifications: boolean;
      primaryContact: boolean;
      emergencyContact: boolean;
      residence: "primary" | "secondary" | "none" | null;
      pickup: "allowed" | "not_allowed" | "ask_office" | null;
    };
    editorId: string;
  },
) {
  // Ticking legal guardian is the office confirming it, which is what lets
  // the adult consent for the child; an unchanged tick keeps its confirmation.
  const confirms =
    input.flags.legalGuardian === true
      ? sql`(legal_guardian is not true or verified_at is null)`
      : sql`false`;
  const [row] = await tx
    .update(userRelationships)
    .set({
      relationDescriptorId: input.relationId,
      relationMeaning: input.relationMeaning,
      ...input.flags,
      verificationMethod: sql`case when ${confirms} then 'staff_attested' else verification_method end`,
      verifiedAt: sql`case when ${confirms} then statement_timestamp() else verified_at end`,
      verifiedByUserId: sql`case when ${confirms} then ${input.editorId}::uuid else verified_by_user_id end`,
    })
    .where(
      and(
        eq(userRelationships.tenantId, input.tenantId),
        eq(userRelationships.id, input.relationshipId),
        eq(userRelationships.version, input.expectedVersion),
        eq(userRelationships.status, "active"),
      ),
    )
    .returning({
      id: userRelationships.id,
      relatedUserId: userRelationships.relatedUserId,
    });
  return row ?? null;
}

/** Ends a link today; a link that only began today is withdrawn instead. */
export async function endRelationship(
  tx: Tx,
  input: {
    tenantId: string;
    relationshipId: string;
    expectedVersion: number;
    today: string;
  },
) {
  const rows = await tx.execute<{
    related_user_id: string;
    student_user_id: string;
  }>(sql`
    update core.user_relationships
    set valid_during = case when lower(valid_during) >= ${input.today}::date then valid_during
                            else daterange(lower(valid_during), ${input.today}::date, '[)') end,
        status = case when lower(valid_during) >= ${input.today}::date then 'tobedeleted' else status end
    where tenant_id = ${input.tenantId}::uuid and id = ${input.relationshipId}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning related_user_id, student_user_id`);
  return rows[0] ?? null;
}

export async function relationshipOf(
  tx: Tx,
  tenantId: string,
  relationshipId: string,
) {
  const [row] = await tx
    .select({
      id: userRelationships.id,
      studentUserId: userRelationships.studentUserId,
      relatedUserId: userRelationships.relatedUserId,
      version: userRelationships.version,
      relationMeaning: userRelationships.relationMeaning,
      legalGuardian: userRelationships.legalGuardian,
      portalAccess: userRelationships.portalAccess,
      receivesNotifications: userRelationships.receivesNotifications,
      primaryContact: userRelationships.primaryContact,
      emergencyContact: userRelationships.emergencyContact,
      residence: userRelationships.residence,
      pickup: userRelationships.pickup,
    })
    .from(userRelationships)
    .where(
      and(
        eq(userRelationships.tenantId, tenantId),
        eq(userRelationships.id, relationshipId),
        eq(userRelationships.status, "active"),
      ),
    );
  return row ?? null;
}

/** Keeps the header's custody chip in step with the student's links. */
export async function refreshCustodyAlert(
  tx: Tx,
  tenantId: string,
  studentId: string,
  today: string,
) {
  await tx.execute(sql`
    update core.users set custody_alert = exists (
      select 1 from core.user_relationships r
      where r.tenant_id = ${tenantId}::uuid and r.student_user_id = ${studentId}::uuid and r.status = 'active'
        and r.valid_during @> ${today}::date
        and (r.pickup = 'not_allowed' or r.educational_rights <> 'full' or r.communication_isolated))
    where tenant_id = ${tenantId}::uuid and id = ${studentId}::uuid
      and custody_alert is distinct from exists (
      select 1 from core.user_relationships r
      where r.tenant_id = ${tenantId}::uuid and r.student_user_id = ${studentId}::uuid and r.status = 'active'
        and r.valid_during @> ${today}::date
        and (r.pickup = 'not_allowed' or r.educational_rights <> 'full' or r.communication_isolated))`);
}

export interface AccountSummary {
  id: string;
  state: string;
  loginName: string | null;
  lastSignInAt: string | null;
}

export async function accountOf(
  tx: Tx,
  tenantId: string,
  userId: string,
): Promise<AccountSummary | null> {
  const rows = await tx.execute<{
    id: string;
    state: string;
    login_name: string | null;
    last_authenticated_at: string | null;
  }>(sql`
    select a.id, a.state, a.last_authenticated_at::text as last_authenticated_at,
           coalesce((select l.login_name from core.login_identities l where l.tenant_id = a.tenant_id
              and l.account_id = a.id and l.kind = 'password' and l.status = 'active' and l.voided_at is null
              limit 1),
             -- The name kept for an account whose password nobody has chosen yet.
             (select u.username from core.users u where u.tenant_id = a.tenant_id and u.id = a.user_id
                and a.state = 'invited')) as login_name
    from core.accounts a
    where a.tenant_id = ${tenantId}::uuid and a.user_id = ${userId}::uuid and a.status = 'active'`);
  const row = rows[0];
  return row
    ? {
        id: row.id,
        state: row.state,
        loginName: row.login_name,
        lastSignInAt: row.last_authenticated_at,
      }
    : null;
}

export interface Face {
  id: string;
  /** The name a child goes by, else their first name, in each script. */
  firstEn: string | null;
  firstAr: string | null;
  fullNameEn: string | null;
  fullNameAr: string | null;
  photoFileId: string | null;
}

/** Children as a class screen shows them: a first name and a photo. */
export async function facesOf(
  tx: Tx,
  tenantId: string,
  ids: readonly string[],
): Promise<Face[]> {
  if (ids.length === 0) return [];
  const rows = await tx.execute<{
    id: string;
    first_en: string | null;
    first_ar: string | null;
    full_name_en: string | null;
    full_name_ar: string | null;
    photo_file_id: string | null;
  }>(sql`
    select id, coalesce(preferred_given_name, given_name_en) as first_en,
      coalesce(preferred_given_name, given_name_ar) as first_ar,
      full_name_en, full_name_ar, photo_file_id
    from core.users
    where tenant_id = ${tenantId}::uuid and id = any(${uuidArray(ids)})`);
  return rows.map((row) => ({
    id: row.id,
    firstEn: row.first_en,
    firstAr: row.first_ar,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    photoFileId: row.photo_file_id,
  }));
}
