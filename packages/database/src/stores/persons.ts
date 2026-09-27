import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { ContactPoint, Scope } from "./students";

import { bounds } from "./sql";

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
    verified_at: string | null;
  }>(sql`
    select id, kind, label, value, normalized, verified_at::text as verified_at
    from core.contact_points
    where tenant_id = ${tenantId}::uuid and user_id = ${userId}::uuid and status = 'active'
    order by kind = 'phone' desc, kind, priority nulls last, created_at`);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    label: row.label,
    value: row.value,
    normalized: row.normalized,
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
    label: "mobile" | "work";
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
