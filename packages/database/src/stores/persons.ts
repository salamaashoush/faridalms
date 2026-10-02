import { PARENTAL_MEANINGS } from "@faridalms/domain/family-roles";
import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { PostalAddress } from "../tables/tenancy";
import type { ContactPoint, Scope } from "./students";

import { orgPath } from "./identity";
import { bounds, uuidArray } from "./sql";

type Tx = CellTransaction;

export async function isVisiblePerson(tx: Tx, scope: Scope, userId: string) {
  const rows = await tx.execute<{ ok: boolean }>(sql`
    select ${userId}::uuid in (
      select user_id from app.visible_people(${scope.viewerId}::uuid, ${scope.schoolId}::uuid,
        ${scope.today}::date, ${scope.schoolWide})) as ok`);
  return rows[0]?.ok ?? false;
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

export interface ChildLink {
  relationshipId: string;
  studentId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  relationId: string;
  portalAccess: boolean;
  visible: boolean;
}

/** The students a person is linked to, marking those the viewer may open. */
export async function childrenOf(
  tx: Tx,
  scope: Scope,
  userId: string,
): Promise<ChildLink[]> {
  const rows = await tx.execute<{
    id: string;
    student_user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    relation_descriptor_id: string;
    portal_access: boolean;
    visible: boolean;
  }>(sql`
    select r.id, r.student_user_id, u.full_name_en, u.full_name_ar, r.relation_descriptor_id, r.portal_access,
           r.student_user_id in (select student_user_id from app.visible_students(${scope.viewerId}::uuid,
             ${scope.schoolId}::uuid, ${scope.today}::date, ${scope.schoolWide})) as visible
    from core.user_relationships r
    join core.users u on u.tenant_id = r.tenant_id and u.id = r.student_user_id and u.status = 'active'
    where r.tenant_id = ${scope.tenantId}::uuid and r.related_user_id = ${userId}::uuid and r.status = 'active'
      and r.valid_during @> ${scope.today}::date
    order by u.full_name_en, u.full_name_ar`);
  return rows
    .filter((row) => row.visible)
    .map((row) => ({
      relationshipId: row.id,
      studentId: row.student_user_id,
      fullNameEn: row.full_name_en,
      fullNameAr: row.full_name_ar,
      relationId: row.relation_descriptor_id,
      portalAccess: row.portal_access,
      visible: row.visible,
    }));
}

const parental = sql`(${sql.join(
  PARENTAL_MEANINGS.map((meaning) => sql`${meaning}`),
  sql`, `,
)})`;

export interface Sibling {
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
}

/** Children who share a parent with this one and whom the viewer reaches. */
export async function siblingsOf(
  tx: Tx,
  scope: Scope,
  studentId: string,
): Promise<Sibling[]> {
  const rows = await tx.execute<{
    user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
  }>(sql`
    select distinct u.id as user_id, u.full_name_en, u.full_name_ar
    from core.user_relationships mine
    join core.user_relationships theirs on theirs.tenant_id = mine.tenant_id
      and theirs.related_user_id = mine.related_user_id and theirs.student_user_id <> mine.student_user_id
      and theirs.status = 'active' and theirs.valid_during @> ${scope.today}::date
      and theirs.relation_meaning in ${parental}
    join core.users u on u.tenant_id = theirs.tenant_id and u.id = theirs.student_user_id and u.status = 'active'
    where mine.tenant_id = ${scope.tenantId}::uuid and mine.student_user_id = ${studentId}::uuid
      and mine.status = 'active' and mine.valid_during @> ${scope.today}::date
      and mine.relation_meaning in ${parental}
      and theirs.student_user_id in (
        select student_user_id from app.visible_students(${scope.viewerId}::uuid, ${scope.schoolId}::uuid,
          ${scope.today}::date, ${scope.schoolWide}))
    order by u.full_name_en, u.full_name_ar`);
  return rows.map((row) => ({
    userId: row.user_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
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

const reached = (scope: Scope) => sql`(
  select user_id from app.visible_people(${scope.viewerId}::uuid, ${scope.schoolId}::uuid, ${scope.today}::date, ${scope.schoolWide})
  union
  select student_user_id from app.visible_students(${scope.viewerId}::uuid, ${scope.schoolId}::uuid, ${scope.today}::date, ${scope.schoolWide}))`;

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
