import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { NaturalRole } from "../tables/membership";
import type { Scope } from "./students";

import { userRoles } from "../tables/membership";
import { orgPath } from "./identity";
import { textArray, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface StaffFilter {
  q: string;
  /** The search as an E.164 number, when it reads as one. */
  phone: string | null;
  roles: string[];
  sort: "name" | "role" | "signedIn";
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
  locale: "ar" | "en";
}

export interface StaffRow {
  id: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  photoFileId: string | null;
  roles: string[];
  positionId: string | null;
  titleEn: string | null;
  titleAr: string | null;
  email: string | null;
  phone: string | null;
  accountState: string | null;
  lastSignInAt: string | null;
}

/**
 * Everyone holding a staff role today at the school or at a group above it,
 * one row a person, with their roles, the title of their earliest role and
 * their first email and phone.
 */
export async function staffDirectory(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId" | "today">,
  filter: StaffFilter,
): Promise<{ rows: StaffRow[]; total: number }> {
  const path = await orgPath(tx, scope.tenantId, scope.schoolId);
  const direction = filter.dir === "desc" ? sql`desc` : sql`asc`;
  const nameKey =
    filter.locale === "ar"
      ? sql`coalesce(full_name_ar, full_name_en) collate "ar-x-icu"`
      : sql`coalesce(full_name_en, full_name_ar) collate "en-x-icu"`;
  const order =
    filter.sort === "role"
      ? sql`array_position(app.staff_roles(), roles[1]) ${direction}, ${nameKey}, id`
      : filter.sort === "signedIn"
        ? sql`last_sign_in_at ${direction} nulls last, ${nameKey}, id`
        : sql`${nameKey} ${direction}, id`;
  const q = filter.q.trim();
  const search =
    q === ""
      ? sql`true`
      : filter.phone
        ? sql`phone = ${filter.phone}`
        : sql`(lower(email) = lower(${q})
               or id in (select result_id from app.search(${q}, array['user'], ${uuidArray(path)},
                 within => array(select r.user_id from core.user_roles r
                   where r.tenant_id = ${scope.tenantId}::uuid and r.org_id = any(${uuidArray(path)})
                     and r.status = 'active' and r.valid_during @> ${scope.today}::date
                     and r.role = any(app.staff_roles())))))`;
  const rows = await tx.execute<{
    id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    photo_file_id: string | null;
    roles: string[];
    position_id: string | null;
    title_en: string | null;
    title_ar: string | null;
    email: string | null;
    phone: string | null;
    account_state: string | null;
    last_sign_in_at: string | null;
    total: number;
  }>(sql`
    with held as (
      select r.user_id,
             array_agg(distinct r.role) as roles,
             (array_agg(r.position_descriptor_id order by lower(r.valid_during), r.id)
                filter (where r.position_descriptor_id is not null))[1] as position_id,
             (array_agg(r.title_en order by lower(r.valid_during), r.id) filter (where r.title_en is not null))[1] as title_en,
             (array_agg(r.title_ar order by lower(r.valid_during), r.id) filter (where r.title_ar is not null))[1] as title_ar
      from core.user_roles r
      where r.tenant_id = ${scope.tenantId}::uuid and r.org_id = any(${uuidArray(path)})
        and r.status = 'active' and r.valid_during @> ${scope.today}::date
        and r.role = any(app.staff_roles())
      group by r.user_id
    ), listed as (
      select u.id, u.full_name_en, u.full_name_ar, u.photo_file_id,
             array(select x from unnest(h.roles) x order by array_position(app.staff_roles(), x)) as roles,
             h.position_id, h.title_en, h.title_ar,
             (select c.value from core.contact_points c
                where c.tenant_id = u.tenant_id and c.user_id = u.id and c.status = 'active' and c.kind = 'email'
                order by c.priority nulls last, c.created_at limit 1) as email,
             (select c.normalized from core.contact_points c
                where c.tenant_id = u.tenant_id and c.user_id = u.id and c.status = 'active' and c.kind = 'phone'
                order by c.priority nulls last, c.created_at limit 1) as phone,
             a.state as account_state,
             a.last_authenticated_at::text as last_sign_in_at
      from held h
      join core.users u on u.tenant_id = ${scope.tenantId}::uuid and u.id = h.user_id and u.status = 'active'
      left join core.accounts a on a.tenant_id = u.tenant_id and a.user_id = u.id and a.status = 'active'
    )
    select *, count(*) over ()::int as total
    from listed
    where ${search}
      and (${filter.roles.length === 0} or roles && ${textArray(filter.roles)})
    order by ${order}
    limit ${filter.pageSize} offset ${(filter.page - 1) * filter.pageSize}`);
  return {
    total: rows[0]?.total ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      fullNameEn: row.full_name_en,
      fullNameAr: row.full_name_ar,
      photoFileId: row.photo_file_id,
      roles: row.roles,
      positionId: row.position_id,
      titleEn: row.title_en,
      titleAr: row.title_ar,
      email: row.email,
      phone: row.phone,
      accountState: row.account_state,
      lastSignInAt: row.last_sign_in_at,
    })),
  };
}

/**
 * Brings a person's staff roles at the school in line with the chosen set.
 * A role no longer chosen ends today, or is withdrawn when it had not started;
 * a new one starts today; the rest take the new position and title. Roles
 * held at the group are left alone.
 */
export async function setStaffRoles(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId" | "today">,
  userId: string,
  input: {
    roles: readonly NaturalRole[];
    positionId: string | null;
    titleEn: string | null;
    titleAr: string | null;
  },
) {
  const held = await tx.execute<{
    id: string;
    role: NaturalRole;
    starts: string;
  }>(sql`
    select id, role, lower(valid_during)::text as starts from core.user_roles
    where tenant_id = ${scope.tenantId}::uuid and user_id = ${userId}::uuid and org_id = ${scope.schoolId}::uuid
      and status = 'active' and role = any(app.staff_roles())
      and (upper_inf(valid_during) or upper(valid_during) > ${scope.today}::date)`);
  const wanted = new Set<NaturalRole>(input.roles);
  for (const row of held) {
    if (wanted.has(row.role)) {
      await tx.execute(sql`
        update core.user_roles
        set position_descriptor_id = ${input.positionId}::uuid, title_en = ${input.titleEn}, title_ar = ${input.titleAr}
        where tenant_id = ${scope.tenantId}::uuid and id = ${row.id}::uuid`);
      wanted.delete(row.role);
    } else if (row.starts >= scope.today) {
      await tx.execute(sql`
        update core.user_roles set status = 'tobedeleted'
        where tenant_id = ${scope.tenantId}::uuid and id = ${row.id}::uuid`);
    } else {
      await tx.execute(sql`
        update core.user_roles set valid_during = daterange(lower(valid_during), ${scope.today}::date)
        where tenant_id = ${scope.tenantId}::uuid and id = ${row.id}::uuid`);
    }
  }
  if (wanted.size > 0)
    await tx.insert(userRoles).values(
      [...wanted].map((role) => ({
        tenantId: scope.tenantId,
        userId,
        orgId: scope.schoolId,
        orgType: "school",
        role,
        validDuring: `[${scope.today},)`,
        source: "manual" as const,
        positionDescriptorId: input.positionId,
        titleEn: input.titleEn,
        titleAr: input.titleAr,
      })),
    );
}

/** Ids of the roles a person holds at the school itself, as against its group. */
export async function schoolRoleIds(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId">,
  userId: string,
) {
  const rows = await tx.execute<{ id: string }>(sql`
    select id from core.user_roles
    where tenant_id = ${scope.tenantId}::uuid and user_id = ${userId}::uuid
      and org_id = ${scope.schoolId}::uuid and status = 'active'`);
  return new Set(rows.map((row) => row.id));
}

/**
 * The person a new link to run the school goes to: the one holding a school
 * administrator role there today with the email given, or without one the
 * longest-serving such person, the first administrator the school was made
 * with. Null when nobody matches.
 */
export async function schoolAdministrator(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId" | "today">,
  email: string | null,
): Promise<string | null> {
  const rows = await tx.execute<{ user_id: string }>(sql`
    select r.user_id from core.user_roles r
    join core.users u on u.tenant_id = r.tenant_id and u.id = r.user_id and u.status = 'active'
    where r.tenant_id = ${scope.tenantId}::uuid and r.org_id = ${scope.schoolId}::uuid
      and r.status = 'active' and r.valid_during @> ${scope.today}::date
      and r.role in ('system_administrator', 'site_administrator')
      and (${email}::text is null or exists (
        select 1 from core.contact_points c
        where c.tenant_id = r.tenant_id and c.user_id = r.user_id and c.kind = 'email'
          and c.status = 'active' and c.normalized = lower(${email}::text)))
    order by lower(r.valid_during), r.id
    limit 1`);
  return rows[0]?.user_id ?? null;
}
