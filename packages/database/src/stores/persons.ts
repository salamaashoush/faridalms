import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { PostalAddress } from "../tables/tenancy";
import type { ContactPoint, Scope } from "./students";

import { orgPath } from "./identity";
import { bounds, uuidArray } from "./sql";

type Tx = CellTransaction;

/** A person's whole record, or the limited profile of a teacher or someone the viewer talks to. */
export type PersonReach = "record" | "profile";

/**
 * How far the viewer reaches each of these people, as `app.reached_people`
 * decides; anyone left out of the map is not reached at all.
 */
export async function personReach(
  tx: Tx,
  scope: Scope,
  userIds: readonly string[],
): Promise<Map<string, PersonReach>> {
  if (userIds.length === 0) return new Map();
  const rows = await tx.execute<{ user_id: string; record: boolean }>(sql`
    select p.user_id, p.record
    from app.reached_people(${scope.viewerId}::uuid, ${scope.schoolId}::uuid, ${scope.today}::date,
      ${scope.schoolWide}, ${uuidArray(scope.followed)}) p
    where p.user_id = any(${uuidArray(userIds)})`);
  return new Map(
    rows.map((row) => [row.user_id, row.record ? "record" : "profile"]),
  );
}

export interface RoleHeld {
  id: string;
  version: number;
  role: string;
  from: string;
  to: string | null;
  positionId: string | null;
  titleEn: string | null;
  titleAr: string | null;
  source: string;
}

export async function rolesAt(
  tx: Tx,
  scope: Pick<Scope, "tenantId" | "schoolId" | "today">,
  userId: string,
) {
  const rows = await tx.execute<{
    id: string;
    version: number;
    role: string;
    valid_during: string;
    position_descriptor_id: string | null;
    title_en: string | null;
    title_ar: string | null;
    source: string;
  }>(sql`
    select r.id, r.version, r.role, r.valid_during::text as valid_during, r.position_descriptor_id,
           r.title_en, r.title_ar, r.source
    from core.user_roles r
    join core.orgs o on o.tenant_id = r.tenant_id and o.id = r.org_id
    where r.tenant_id = ${scope.tenantId}::uuid and r.user_id = ${userId}::uuid and r.status = 'active'
      and (r.org_id = ${scope.schoolId}::uuid or o.type = 'school_group')
      and (upper_inf(r.valid_during) or upper(r.valid_during) > ${scope.today}::date)
    order by lower(r.valid_during)`);
  return rows.map((row): RoleHeld => {
    const range = bounds(row.valid_during);
    return {
      id: row.id,
      version: row.version,
      role: row.role,
      from: range.from,
      to: range.to,
      positionId: row.position_descriptor_id,
      titleEn: row.title_en,
      titleAr: row.title_ar,
      source: row.source,
    };
  });
}

export async function contactsOf(
  tx: Tx,
  tenantId: string,
  userId: string,
): Promise<ContactPoint[]> {
  const rows = await tx.execute<{
    id: string;
    kind: ContactPoint["kind"];
    label: string;
    value: string;
    normalized: string | null;
    postal: PostalAddress | null;
    verified_at: string | null;
  }>(sql`
    select id, kind, label, value, normalized, postal, verified_at::text as verified_at
    from core.contact_points
    where tenant_id = ${tenantId}::uuid and user_id = ${userId}::uuid and status = 'active'
    order by kind = 'phone' desc, kind, priority nulls last, created_at`);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    label: row.label,
    value: row.value,
    normalized: row.normalized,
    postal: row.postal,
    verified: row.verified_at !== null,
  }));
}

/**
 * Sets a person's contact of one kind and label: an unchanged value stays,
 * a changed one replaces the old row, and an empty one removes it.
 */
export async function replaceContact(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    kind: "phone" | "email";
    label: "mobile" | "home" | "work" | "personal" | "emergency" | "other";
    value: string;
    normalized: string | null;
  },
) {
  const held = await tx.execute<{ id: string; normalized: string | null }>(sql`
    select id, normalized from core.contact_points
    where tenant_id = ${input.tenantId}::uuid and user_id = ${input.userId}::uuid and kind = ${input.kind}
      and status = 'active'`);
  if (
    input.normalized &&
    held.some((row) => row.normalized === input.normalized)
  )
    return;
  await tx.execute(sql`
    update core.contact_points set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and user_id = ${input.userId}::uuid and kind = ${input.kind}
      and label = ${input.label} and status = 'active'`);
  if (!input.normalized) return;
  await tx.execute(sql`
    insert into core.contact_points (tenant_id, user_id, kind, label, value, normalized, sms_capable, source)
    values (${input.tenantId}::uuid, ${input.userId}::uuid, ${input.kind}, ${input.label}, ${input.value},
      ${input.normalized}, ${input.kind === "phone" ? true : null}, 'manual')`);
}

/** Sets a person's home address; an empty one removes it. */
export async function replaceAddress(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    value: string;
    postal: PostalAddress | null;
  },
) {
  const held = await tx.execute<{ value: string; postal: PostalAddress }>(sql`
    select value, postal from core.contact_points
    where tenant_id = ${input.tenantId}::uuid and user_id = ${input.userId}::uuid and kind = 'postal'
      and label = 'home' and status = 'active'`);
  const same = held[0];
  if (
    input.postal &&
    held.length === 1 &&
    same &&
    same.value === input.value &&
    JSON.stringify(same.postal) === JSON.stringify(input.postal)
  )
    return;
  await tx.execute(sql`
    update core.contact_points set status = 'tobedeleted'
    where tenant_id = ${input.tenantId}::uuid and user_id = ${input.userId}::uuid and kind = 'postal'
      and label = 'home' and status = 'active'`);
  if (!input.postal) return;
  await tx.execute(sql`
    insert into core.contact_points (tenant_id, user_id, kind, label, value, postal, source)
    values (${input.tenantId}::uuid, ${input.userId}::uuid, 'postal', 'home', ${input.value},
      ${input.postal}::jsonb, 'manual')`);
}

/** Puts a photo on a person, or takes it away; gives the one it replaced. */
export async function setPhoto(
  tx: Tx,
  input: { tenantId: string; userId: string; fileId: string | null },
): Promise<string | null> {
  const [row] = await tx.execute<{ before: string | null }>(sql`
    update core.users u set photo_file_id = ${input.fileId}::uuid
    from (select photo_file_id as before from core.users
      where tenant_id = ${input.tenantId}::uuid and id = ${input.userId}::uuid) old
    where u.tenant_id = ${input.tenantId}::uuid and u.id = ${input.userId}::uuid
    returning old.before`);
  return row?.before ?? null;
}

const reached = (scope: Scope, besides: readonly string[]) => sql`(
  select unnest(${uuidArray(besides)})
  union
  select user_id from app.visible_people(${scope.viewerId}::uuid, ${scope.schoolId}::uuid, ${scope.today}::date, ${scope.schoolWide})
  union
  select student_user_id from app.visible_students(${scope.viewerId}::uuid, ${scope.schoolId}::uuid, ${scope.today}::date, ${scope.schoolWide}, ${uuidArray(scope.followed)}))`;

export interface PersonHit {
  id: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  isStudent: boolean;
  roles: string[];
}

/**
 * People the viewer reaches at this school whose name matches, for
 * pickers, with those a module opens to them besides.
 */
export async function searchReached(
  tx: Tx,
  scope: Scope,
  q: string,
  besides: readonly string[],
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
      and u.id in (select result_id from app.search(${q}, array['user'], ${uuidArray(path)},
        within => array${reached(scope, besides)}))
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

export async function namesOf(
  tx: Tx,
  tenantId: string,
  ids: readonly string[],
): Promise<
  { id: string; fullNameEn: string | null; fullNameAr: string | null }[]
> {
  if (ids.length === 0) return [];
  const rows = await tx.execute<{
    id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
  }>(sql`
    select id, full_name_en, full_name_ar from core.users
    where tenant_id = ${tenantId}::uuid and id = any(${uuidArray(ids)})
    order by full_name_en, full_name_ar, id`);
  return rows.map((row) => ({
    id: row.id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
  }));
}
