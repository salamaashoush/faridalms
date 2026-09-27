import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { Scope } from "./students";

import { orgPath } from "./identity";
import { bounds, uuidArray } from "./sql";

type Tx = CellTransaction;

const reached = (scope: Scope) => sql`(
  select user_id from app.visible_people(${scope.viewerId}::uuid, ${scope.schoolId}::uuid, ${scope.today}::date, ${scope.schoolWide})
  union
  select student_user_id from app.visible_students(${scope.viewerId}::uuid, ${scope.schoolId}::uuid, ${scope.today}::date, ${scope.schoolWide}))`;

export interface HouseholdMemberRow {
  id: string;
  version: number;
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  kind: "adult" | "child";
  residence: "primary" | "secondary";
  from: string;
  to: string | null;
}

export interface HouseholdRow {
  id: string;
  version: number;
  nameEn: string | null;
  nameAr: string | null;
  primaryLanguage: string | null;
  members: HouseholdMemberRow[];
}

interface MemberRecord {
  id: string;
  version: number;
  user_id: string;
  full_name_en: string | null;
  full_name_ar: string | null;
  member_kind: "adult" | "child";
  residence: "primary" | "secondary";
  valid_during: string;
}

function memberOf(row: MemberRecord): HouseholdMemberRow {
  const range = bounds(row.valid_during);
  return {
    id: row.id,
    version: row.version,
    userId: row.user_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    kind: row.member_kind,
    residence: row.residence,
    from: range.from,
    to: range.to,
  };
}

const currentMembers = (today: string) => sql`
  select m.id, m.version, m.household_id, m.user_id, u.full_name_en, u.full_name_ar, m.member_kind,
         m.residence, m.valid_during::text as valid_during
  from core.household_members m
  join core.users u on u.tenant_id = m.tenant_id and u.id = m.user_id and u.status = 'active'
  where m.status = 'active' and (upper_inf(m.valid_during) or upper(m.valid_during) > ${today}::date)`;

/**
 * Households with someone the viewer reaches at this school, newest members
 * first within each, searched by the household's name or a member's.
 */
export async function householdsForSchool(
  tx: Tx,
  scope: Scope,
  filter: {
    q: string;
    page: number;
    pageSize: number;
    locale: "ar" | "en";
  },
): Promise<{ rows: HouseholdRow[]; total: number }> {
  const path = await orgPath(tx, scope.tenantId, scope.schoolId);
  const q = filter.q.trim();
  const nameKey =
    filter.locale === "ar"
      ? sql`coalesce(h.name_ar, h.name_en) collate "ar-x-icu"`
      : sql`coalesce(h.name_en, h.name_ar) collate "en-x-icu"`;
  const rows = await tx.execute<{
    id: string;
    version: number;
    name_en: string | null;
    name_ar: string | null;
    primary_language: string | null;
    members: MemberRecord[];
    total: number;
  }>(sql`
    with members as (${currentMembers(scope.today)} and m.tenant_id = ${scope.tenantId}::uuid),
    listed as (
      select h.id, h.version, h.name_en, h.name_ar, h.primary_language
      from core.households h
      where h.tenant_id = ${scope.tenantId}::uuid and h.status = 'active'
        and exists (select 1 from members m where m.household_id = h.id and m.user_id in ${reached(scope)})
        and (${q === ""}
             or h.name_en ilike ${`%${q}%`} or h.name_ar ilike ${`%${q}%`}
             or exists (select 1 from members m where m.household_id = h.id
                          and m.user_id in (select result_id from app.search(${q}, array['user'], ${uuidArray(path)}))))
    )
    select h.*, count(*) over ()::int as total,
           coalesce((select json_agg(m order by m.member_kind, m.full_name_en) from members m where m.household_id = h.id),
                    '[]'::json) as members
    from listed h
    order by ${nameKey}, h.id
    limit ${filter.pageSize} offset ${(filter.page - 1) * filter.pageSize}`);
  return {
    total: rows[0]?.total ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      version: row.version,
      nameEn: row.name_en,
      nameAr: row.name_ar,
      primaryLanguage: row.primary_language,
      members: row.members.map(memberOf),
    })),
  };
}

/** One household, when someone in it is reached by the viewer. */
export async function householdById(
  tx: Tx,
  scope: Scope,
  householdId: string,
): Promise<HouseholdRow | null> {
  const rows = await tx.execute<{
    id: string;
    version: number;
    name_en: string | null;
    name_ar: string | null;
    primary_language: string | null;
    members: MemberRecord[];
  }>(sql`
    with members as (${currentMembers(scope.today)} and m.tenant_id = ${scope.tenantId}::uuid
                     and m.household_id = ${householdId}::uuid)
    select h.id, h.version, h.name_en, h.name_ar, h.primary_language,
           coalesce((select json_agg(m order by m.member_kind, m.full_name_en) from members m), '[]'::json) as members
    from core.households h
    where h.tenant_id = ${scope.tenantId}::uuid and h.id = ${householdId}::uuid and h.status = 'active'
      and (not exists (select 1 from members)
           or exists (select 1 from members m where m.user_id in ${reached(scope)}))`);
  const row = rows[0];
  return row
    ? {
        id: row.id,
        version: row.version,
        nameEn: row.name_en,
        nameAr: row.name_ar,
        primaryLanguage: row.primary_language,
        members: row.members.map(memberOf),
      }
    : null;
}

/** The households a person belongs to now. */
export async function householdsOf(
  tx: Tx,
  tenantId: string,
  userId: string,
  today: string,
) {
  const rows = await tx.execute<{
    id: string;
    name_en: string | null;
    name_ar: string | null;
    residence: "primary" | "secondary";
  }>(sql`
    select h.id, h.name_en, h.name_ar, m.residence
    from core.household_members m
    join core.households h on h.tenant_id = m.tenant_id and h.id = m.household_id and h.status = 'active'
    where m.tenant_id = ${tenantId}::uuid and m.user_id = ${userId}::uuid and m.status = 'active'
      and (upper_inf(m.valid_during) or upper(m.valid_during) > ${today}::date)
    order by m.residence, h.name_en`);
  return rows.map((row) => ({
    id: row.id,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    residence: row.residence,
  }));
}

export async function insertHousehold(
  tx: Tx,
  input: {
    tenantId: string;
    nameEn: string | null;
    nameAr: string | null;
    primaryLanguage: string | null;
  },
) {
  const rows = await tx.execute<{ id: string; version: number }>(sql`
    insert into core.households (tenant_id, name_en, name_ar, primary_language)
    values (${input.tenantId}::uuid, ${input.nameEn}, ${input.nameAr}, ${input.primaryLanguage})
    returning id, version`);
  const row = rows[0];
  if (!row) throw new Error("household was not created");
  return row;
}

export async function updateHousehold(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    nameEn: string | null;
    nameAr: string | null;
    primaryLanguage: string | null;
  },
) {
  const rows = await tx.execute<{ id: string; version: number }>(sql`
    update core.households
    set name_en = ${input.nameEn}, name_ar = ${input.nameAr}, primary_language = ${input.primaryLanguage}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning id, version`);
  return rows[0] ?? null;
}

export async function addHouseholdMember(
  tx: Tx,
  input: {
    tenantId: string;
    householdId: string;
    userId: string;
    kind: "adult" | "child";
    residence: "primary" | "secondary";
    from: string;
  },
) {
  const rows = await tx.execute<{ id: string }>(sql`
    insert into core.household_members (tenant_id, household_id, user_id, member_kind, residence, valid_during)
    values (${input.tenantId}::uuid, ${input.householdId}::uuid, ${input.userId}::uuid, ${input.kind},
      ${input.residence}, daterange(${input.from}::date, null))
    returning id`);
  const row = rows[0];
  if (!row) throw new Error("member was not added");
  return row.id;
}

/** Ends a membership today, or withdraws one that had not started. */
export async function endHouseholdMember(
  tx: Tx,
  input: {
    tenantId: string;
    householdId: string;
    id: string;
    expectedVersion: number;
    today: string;
  },
) {
  const rows = await tx.execute<{ user_id: string }>(sql`
    update core.household_members
    set status = case when lower(valid_during) >= ${input.today}::date then 'tobedeleted' else status end,
        valid_during = case when lower(valid_during) >= ${input.today}::date then valid_during
                            else daterange(lower(valid_during), ${input.today}::date) end
    where tenant_id = ${input.tenantId}::uuid and household_id = ${input.householdId}::uuid
      and id = ${input.id}::uuid and version = ${input.expectedVersion} and status = 'active'
    returning user_id`);
  return rows[0]?.user_id ?? null;
}

export interface PersonHit {
  id: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  isStudent: boolean;
  roles: string[];
}

/** People the viewer reaches at this school whose name matches, for pickers. */
export async function searchReached(
  tx: Tx,
  scope: Scope,
  q: string,
): Promise<PersonHit[]> {
  const path = await orgPath(tx, scope.tenantId, scope.schoolId);
  const rows = await tx.execute<{
    id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    roles: string[];
  }>(sql`
    select u.id, u.full_name_en, u.full_name_ar,
           array(select distinct r.role from core.user_roles r
                 where r.tenant_id = u.tenant_id and r.user_id = u.id and r.org_id = any(${uuidArray(path)})
                   and r.status = 'active' and r.valid_during @> ${scope.today}::date) as roles
    from core.users u
    where u.tenant_id = ${scope.tenantId}::uuid and u.status = 'active'
      and u.id in (select result_id from app.search(${q}, array['user'], ${uuidArray(path)}))
      and u.id in ${reached(scope)}
    order by u.full_name_en, u.full_name_ar
    limit 20`);
  return rows.map((row) => ({
    id: row.id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    isStudent: row.roles.includes("student"),
    roles: row.roles,
  }));
}
