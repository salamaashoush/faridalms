import { and, eq, sql } from "drizzle-orm";

import type { CellTransaction } from "../context";
import type { BuiltinAccessRole } from "../tables/access";

import { accessRoleAssignments, accessRoles } from "../tables/access";
import { orgPath } from "./identity";
import { bounds, textArray, uuidArray } from "./sql";
import { STAFF_ROLES } from "./staff";

type Tx = CellTransaction;

/** Serialises every write that can change who holds a capability in the tenant. */
export async function lockAccess(tx: Tx) {
  await tx.execute(sql`select app.lock('access')`);
}

/**
 * How many active people hold access:manage through sources with no end
 * date: a staff role, an account that can sign in, and the capability from an
 * open assignment or from the nearest built-in role of an open natural role,
 * unless a current assignment replaces the built-ins. A holder whose source
 * ends next month does not count, so the rule cannot lapse on a date.
 */
export async function accessManagerCount(
  tx: Tx,
  tenantId: string,
  today: string,
  userId: string | null = null,
) {
  const rows = await tx.execute<{ holders: number }>(sql`
    with recursive paths as (
      select o.id as start, o.id, o.parent_id, 0 as depth
      from core.orgs o where o.tenant_id = ${tenantId}::uuid
      union all
      select p.start, o.id, o.parent_id, p.depth + 1
      from core.orgs o join paths p on o.tenant_id = ${tenantId}::uuid and o.id = p.parent_id
    ), held as (
      select r.user_id, r.role, r.org_id from core.user_roles r
      where r.tenant_id = ${tenantId}::uuid and r.status = 'active'
        and upper_inf(r.valid_during) and lower(r.valid_during) <= ${today}::date
    ), assigned as (
      select a.user_id, 'access:manage' = any(r.capabilities) as grants
      from core.access_role_assignments a
      join core.access_roles r on r.tenant_id = a.tenant_id and r.id = a.access_role_id and r.status = 'active'
      where a.tenant_id = ${tenantId}::uuid and a.status = 'active'
        and upper_inf(a.valid_during) and lower(a.valid_during) <= ${today}::date
    ), replaced as (
      select a.user_id from core.access_role_assignments a
      where a.tenant_id = ${tenantId}::uuid and a.status = 'active' and a.replaces_builtin
        and a.valid_during @> ${today}::date
    ), builtin as (
      select h.user_id from held h
      where h.user_id not in (select user_id from replaced)
        and coalesce((
          select 'access:manage' = any(r.capabilities)
          from core.access_roles r
          left join paths p on p.start = h.org_id and p.id = r.org_id
          where r.tenant_id = ${tenantId}::uuid and r.status = 'active'
            and r.builtin_key = case when h.role in ('parent', 'guardian', 'relative') then 'family' else h.role end
            and (r.org_id is null or p.id is not null)
          order by coalesce(p.depth, 1000000)
          limit 1), false)
    )
    select count(distinct u.id)::int as holders
    from core.users u
    join core.accounts a on a.tenant_id = u.tenant_id and a.user_id = u.id and a.status = 'active'
      and a.state in ('active', 'locked')
    where u.tenant_id = ${tenantId}::uuid and u.status = 'active'
      and (${userId}::uuid is null or u.id = ${userId}::uuid)
      and exists (select 1 from held h where h.user_id = u.id and h.role = any(${textArray([...STAFF_ROLES])}))
      and (u.id in (select user_id from assigned where grants) or u.id in (select user_id from builtin))`);
  return rows[0]?.holders ?? 0;
}

export interface AccessRoleRow {
  id: string;
  version: number;
  orgId: string | null;
  builtinKey: BuiltinAccessRole | null;
  nameEn: string | null;
  nameAr: string | null;
  descriptionEn: string | null;
  descriptionAr: string | null;
  capabilities: string[];
  changedAt: string;
  people: number;
}

const FAMILY_ROLES = sql`('parent', 'guardian', 'relative')`;

const ROLE_ORDER = [
  "principal",
  "site_administrator",
  "district_administrator",
  "system_administrator",
  "teacher",
  "aide",
  "counselor",
  "proctor",
  "admissions_officer",
  "staff",
  "student",
  "family",
  "applicant_family",
] as const satisfies readonly BuiltinAccessRole[];

/**
 * The access roles a school sees: its own and its group's custom roles, and
 * each built-in from the nearest org that defines it, with how many people
 * hold each one today.
 */
export async function rolesForSchool(
  tx: Tx,
  scope: { tenantId: string; schoolId: string; today: string },
): Promise<AccessRoleRow[]> {
  const path = await orgPath(tx, scope.tenantId, scope.schoolId);
  const rows = await tx.execute<{
    id: string;
    version: number;
    org_id: string | null;
    builtin_key: BuiltinAccessRole | null;
    name_en: string | null;
    name_ar: string | null;
    description_en: string | null;
    description_ar: string | null;
    capabilities: string[];
    changed_at: string;
    assigned: number;
    derived: number;
  }>(sql`
    with replaced as (
      select a.user_id from core.access_role_assignments a
      where a.tenant_id = ${scope.tenantId}::uuid and a.org_id = any(${uuidArray(path)})
        and a.status = 'active' and a.replaces_builtin and a.valid_during @> ${scope.today}::date
    ), natural_holders as (
      select case when r.role in ${FAMILY_ROLES} then 'family' else r.role end as key,
             count(distinct r.user_id)::int as holders
      from core.user_roles r
      where r.tenant_id = ${scope.tenantId}::uuid and r.org_id = any(${uuidArray(path)})
        and r.status = 'active' and r.valid_during @> ${scope.today}::date
        and r.user_id not in (select user_id from replaced)
      group by 1
    ), visible as (
      select distinct on (coalesce(r.builtin_key, r.id::text)) r.*
      from core.access_roles r
      where r.tenant_id = ${scope.tenantId}::uuid and r.status = 'active'
        and (r.org_id is null or r.org_id = any(${uuidArray(path)}))
      order by coalesce(r.builtin_key, r.id::text),
               coalesce(array_position(${uuidArray(path)}, r.org_id), 1000000)
    )
    select v.id, v.version, v.org_id, v.builtin_key, v.name_en, v.name_ar, v.description_en, v.description_ar,
           v.capabilities, v.date_last_modified::text as changed_at,
           (select count(distinct a.user_id)::int from core.access_role_assignments a
              where a.tenant_id = v.tenant_id and a.access_role_id = v.id and a.status = 'active'
                and a.org_id = any(${uuidArray(path)}) and a.valid_during @> ${scope.today}::date) as assigned,
           coalesce((select h.holders from natural_holders h where h.key = v.builtin_key), 0) as derived
    from visible v
    order by v.builtin_key is null, array_position(${textArray([...ROLE_ORDER])}, v.builtin_key),
             coalesce(v.name_en, v.name_ar)`);
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    orgId: row.org_id,
    builtinKey: row.builtin_key,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    descriptionEn: row.description_en,
    descriptionAr: row.description_ar,
    capabilities: row.capabilities,
    changedAt: row.changed_at,
    people: row.assigned + row.derived,
  }));
}

export async function insertAccessRole(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    builtinKey: BuiltinAccessRole | null;
    nameEn: string | null;
    nameAr: string | null;
    descriptionEn: string | null;
    descriptionAr: string | null;
    capabilities: string[];
  },
) {
  const [row] = await tx
    .insert(accessRoles)
    .values(input)
    .returning({ id: accessRoles.id, version: accessRoles.version });
  if (!row) throw new Error("access role was not created");
  return row;
}

export async function updateAccessRole(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    expectedVersion: number;
    nameEn: string | null;
    nameAr: string | null;
    descriptionEn: string | null;
    descriptionAr: string | null;
    capabilities: string[];
  },
) {
  const [row] = await tx
    .update(accessRoles)
    .set({
      nameEn: input.nameEn,
      nameAr: input.nameAr,
      descriptionEn: input.descriptionEn,
      descriptionAr: input.descriptionAr,
      capabilities: input.capabilities,
    })
    .where(
      and(
        eq(accessRoles.tenantId, input.tenantId),
        eq(accessRoles.id, input.id),
        eq(accessRoles.version, input.expectedVersion),
        eq(accessRoles.status, "active"),
      ),
    )
    .returning({ id: accessRoles.id, version: accessRoles.version });
  return row ?? null;
}

export interface AssignmentRow {
  id: string;
  version: number;
  accessRoleId: string;
  roleNameEn: string | null;
  roleNameAr: string | null;
  builtinKey: string | null;
  orgId: string;
  atSchool: boolean;
  from: string;
  to: string | null;
  replacesBuiltin: boolean;
  reason: string | null;
  grantedByEn: string | null;
  grantedByAr: string | null;
}

/** A person's access-role assignments at the school or above that have not ended. */
export async function assignmentsOf(
  tx: Tx,
  scope: { tenantId: string; schoolId: string; today: string },
  userId: string,
): Promise<AssignmentRow[]> {
  const path = await orgPath(tx, scope.tenantId, scope.schoolId);
  const rows = await tx.execute<{
    id: string;
    version: number;
    access_role_id: string;
    name_en: string | null;
    name_ar: string | null;
    builtin_key: string | null;
    org_id: string;
    valid_during: string;
    replaces_builtin: boolean;
    reason: string | null;
    granted_en: string | null;
    granted_ar: string | null;
  }>(sql`
    select a.id, a.version, a.access_role_id, r.name_en, r.name_ar, r.builtin_key, a.org_id,
           a.valid_during::text as valid_during, a.replaces_builtin, a.reason,
           g.full_name_en as granted_en, g.full_name_ar as granted_ar
    from core.access_role_assignments a
    join core.access_roles r on r.tenant_id = a.tenant_id and r.id = a.access_role_id
    left join core.users g on g.tenant_id = a.tenant_id and g.id = a.granted_by_user_id
    where a.tenant_id = ${scope.tenantId}::uuid and a.user_id = ${userId}::uuid and a.status = 'active'
      and a.org_id = any(${uuidArray(path)})
      and (upper_inf(a.valid_during) or upper(a.valid_during) > ${scope.today}::date)
    order by lower(a.valid_during), a.id`);
  return rows.map((row) => {
    const range = bounds(row.valid_during);
    return {
      id: row.id,
      version: row.version,
      accessRoleId: row.access_role_id,
      roleNameEn: row.name_en,
      roleNameAr: row.name_ar,
      builtinKey: row.builtin_key,
      orgId: row.org_id,
      atSchool: row.org_id === scope.schoolId,
      from: range.from,
      to: range.to,
      replacesBuiltin: row.replaces_builtin,
      reason: row.reason,
      grantedByEn: row.granted_en,
      grantedByAr: row.granted_ar,
    };
  });
}

export async function insertAssignment(
  tx: Tx,
  input: {
    tenantId: string;
    userId: string;
    accessRoleId: string;
    orgId: string;
    from: string;
    to: string | null;
    replacesBuiltin: boolean;
    grantedByUserId: string;
    reason: string | null;
  },
) {
  const [row] = await tx
    .insert(accessRoleAssignments)
    .values({
      tenantId: input.tenantId,
      userId: input.userId,
      accessRoleId: input.accessRoleId,
      orgId: input.orgId,
      validDuring: `[${input.from},${input.to ?? ""})`,
      replacesBuiltin: input.replacesBuiltin,
      grantedByUserId: input.grantedByUserId,
      reason: input.reason,
    })
    .returning({ id: accessRoleAssignments.id });
  if (!row) throw new Error("assignment was not created");
  return row.id;
}

/**
 * Ends an assignment today, or withdraws it when it had not started. Returns
 * the assignment's person, or null when the version was stale.
 */
export async function endAssignment(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    id: string;
    expectedVersion: number;
    today: string;
  },
) {
  const rows = await tx.execute<{ user_id: string }>(sql`
    update core.access_role_assignments
    set status = case when lower(valid_during) >= ${input.today}::date then 'tobedeleted' else status end,
        valid_during = case when lower(valid_during) >= ${input.today}::date then valid_during
                            else daterange(lower(valid_during), ${input.today}::date) end
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid and org_id = ${input.orgId}::uuid
      and version = ${input.expectedVersion} and status = 'active'
    returning user_id`);
  return rows[0]?.user_id ?? null;
}

export interface AccessChange {
  id: string;
  occurredAt: string;
  action: string;
  actorNameEn: string | null;
  actorNameAr: string | null;
  subjectNameEn: string | null;
  subjectNameAr: string | null;
}

/** Changes to roles, assignments, staff roles and account states, newest first. */
export async function accessChanges(
  tx: Tx,
  tenantId: string,
  page: { limit: number; offset: number },
): Promise<{ rows: AccessChange[]; total: number }> {
  const rows = await tx.execute<{
    id: string;
    occurred_at: string;
    action: string;
    actor_en: string | null;
    actor_ar: string | null;
    subject_en: string | null;
    subject_ar: string | null;
    total: number;
  }>(sql`
    select l.id, l.occurred_at::text as occurred_at, l.action,
           a.full_name_en as actor_en, a.full_name_ar as actor_ar,
           s.full_name_en as subject_en, s.full_name_ar as subject_ar,
           count(*) over ()::int as total
    from audit.log l
    left join core.users a on a.tenant_id = l.tenant_id and a.id = l.actor_user_id
    left join core.users s on s.tenant_id = l.tenant_id and s.id = l.subject_user_id
    where l.tenant_id = ${tenantId}::uuid and l.outcome = 'success'
      and (l.action like 'access_role.%' or l.action like 'access_assignment.%'
           or l.action in ('role.change', 'account.disable', 'account.enable'))
    order by l.occurred_at desc, l.id desc
    limit ${page.limit} offset ${page.offset}`);
  return {
    total: rows[0]?.total ?? 0,
    rows: rows.map((row) => ({
      id: row.id,
      occurredAt: row.occurred_at,
      action: row.action,
      actorNameEn: row.actor_en,
      actorNameAr: row.actor_ar,
      subjectNameEn: row.subject_en,
      subjectNameAr: row.subject_ar,
    })),
  };
}

/**
 * The staff who hold a capability at a school today, by the same rules a
 * session resolves it: an open assignment granting it, or the nearest
 * built-in role of a natural role they hold, unless an assignment replaces
 * the built-ins. Only people with a staff role and an account count, since
 * no family or student session is ever given an office capability.
 */
export async function capabilityHolders(
  tx: Tx,
  scope: {
    tenantId: string;
    schoolId: string;
    today: string;
    capability: string;
  },
): Promise<{ id: string; nameEn: string | null; nameAr: string | null }[]> {
  const path = uuidArray(await orgPath(tx, scope.tenantId, scope.schoolId));
  const rows = await tx.execute<{
    id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
  }>(sql`
    with held as (
      select r.user_id, r.role from core.user_roles r
      where r.tenant_id = ${scope.tenantId}::uuid and r.org_id = any(${path})
        and r.status = 'active' and r.valid_during @> ${scope.today}::date
    ), replaced as (
      select a.user_id from core.access_role_assignments a
      where a.tenant_id = ${scope.tenantId}::uuid and a.org_id = any(${path})
        and a.status = 'active' and a.replaces_builtin and a.valid_during @> ${scope.today}::date
    ), assigned as (
      select a.user_id from core.access_role_assignments a
      join core.access_roles r on r.tenant_id = a.tenant_id and r.id = a.access_role_id
        and r.status = 'active'
      where a.tenant_id = ${scope.tenantId}::uuid and a.org_id = any(${path})
        and a.status = 'active' and a.valid_during @> ${scope.today}::date
        and ${scope.capability} = any(r.capabilities)
    ), builtin as (
      select h.user_id from held h
      where h.user_id not in (select user_id from replaced)
        and coalesce((
          select ${scope.capability} = any(r.capabilities)
          from core.access_roles r
          where r.tenant_id = ${scope.tenantId}::uuid and r.status = 'active'
            and r.builtin_key = case when h.role in ${FAMILY_ROLES} then 'family' else h.role end
            and (r.org_id is null or r.org_id = any(${path}))
          order by coalesce(array_position(${path}, r.org_id), 1000000)
          limit 1), false)
    )
    select u.id, u.full_name_en, u.full_name_ar
    from core.users u
    where u.tenant_id = ${scope.tenantId}::uuid and u.status = 'active'
      and exists (select 1 from core.accounts a where a.tenant_id = u.tenant_id and a.user_id = u.id
        and a.status = 'active' and a.state in ('active', 'locked'))
      and exists (select 1 from held h where h.user_id = u.id and h.role = any(${textArray([...STAFF_ROLES])}))
      and (u.id in (select user_id from assigned) or u.id in (select user_id from builtin))
    order by coalesce(u.full_name_en, u.full_name_ar), u.id`);
  return rows.map((row) => ({
    id: row.id,
    nameEn: row.full_name_en,
    nameAr: row.full_name_ar,
  }));
}
