import type { RetentionRules } from "@faridalms/domain/privacy";

import { and, eq, isNull, sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { legalHolds } from "../tables/documents";
import { retentionSettings } from "../tables/privacy";
import { textArray, uuidArray } from "./sql";
import { STAFF_ROLES } from "./staff";

type Tx = CellTransaction;

interface OrgScope {
  tenantId: string;
  orgId: string;
}

const NO_RULES: RetentionRules = {
  studentRule: null,
  studentValue: null,
  staffYears: null,
};

export async function retentionOf(
  tx: Tx,
  scope: OrgScope,
): Promise<RetentionRules> {
  const [row] = await tx
    .select({
      studentRule: retentionSettings.studentRule,
      studentValue: retentionSettings.studentValue,
      staffYears: retentionSettings.staffYears,
    })
    .from(retentionSettings)
    .where(
      and(
        eq(retentionSettings.tenantId, scope.tenantId),
        eq(retentionSettings.orgId, scope.orgId),
        eq(retentionSettings.status, "active"),
      ),
    );
  return row ?? NO_RULES;
}

export async function saveRetention(
  tx: Tx,
  input: OrgScope & RetentionRules,
): Promise<{ before: RetentionRules; after: RetentionRules }> {
  const before = await retentionOf(tx, input);
  const after = {
    studentRule: input.studentRule,
    studentValue: input.studentValue,
    staffYears: input.staffYears,
  };
  const updated = await tx
    .update(retentionSettings)
    .set(after)
    .where(
      and(
        eq(retentionSettings.tenantId, input.tenantId),
        eq(retentionSettings.orgId, input.orgId),
        eq(retentionSettings.status, "active"),
      ),
    )
    .returning({ id: retentionSettings.id });
  if (updated.length === 0)
    await tx
      .insert(retentionSettings)
      .values({ tenantId: input.tenantId, orgId: input.orgId, ...after });
  return { before, after };
}

export interface LeaverRow {
  userId: string;
  kind: "student" | "staff";
  fullNameEn: string | null;
  fullNameAr: string | null;
  birthDate: string | null;
  /** The last day they belonged to any school of the tenant. */
  leftOn: string;
}

/**
 * People who were students or staff of the school and now belong to no
 * school of the tenant, today or later, and have not been erased.
 */
export async function leaversOf(
  tx: Tx,
  scope: OrgScope & { today: string },
): Promise<LeaverRow[]> {
  const rows = await tx.execute<{
    user_id: string;
    kind: "student" | "staff";
    full_name_en: string | null;
    full_name_ar: string | null;
    birth_date: string | null;
    left_on: string;
  }>(sql`
    with spans as (
      select y.student_user_id as user_id, 'student' as kind, y.org_id, y.valid_during
      from core.student_school_years y
      where y.tenant_id = ${scope.tenantId}::uuid and y.status = 'active'
      union all
      select r.user_id, 'staff', r.org_id, r.valid_during
      from core.user_roles r
      where r.tenant_id = ${scope.tenantId}::uuid and r.status = 'active'
        and r.role = any(${textArray([...STAFF_ROLES])})
    ), people as (
      select user_id, kind,
             max(upper(valid_during)) - 1 as left_on,
             bool_or(upper_inf(valid_during) or upper(valid_during) > ${scope.today}::date) as staying,
             bool_or(org_id = ${scope.orgId}::uuid) as here
      from spans
      group by user_id, kind
    )
    select u.id as user_id, p.kind, u.full_name_en, u.full_name_ar,
           u.birth_date::text as birth_date, p.left_on::text as left_on
    from people p
    join core.users u on u.tenant_id = ${scope.tenantId}::uuid and u.id = p.user_id
      and u.status = 'active' and u.erased_at is null
    where p.here and not p.staying
      and not exists (select 1 from people q where q.user_id = p.user_id and q.staying)
    order by p.left_on, u.id`);
  return rows.map((row) => ({
    userId: row.user_id,
    kind: row.kind,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    birthDate: row.birth_date,
    leftOn: row.left_on,
  }));
}

/** The exam sessions whose coursework each student handed in. */
export async function examWorkOf(
  tx: Tx,
  input: { tenantId: string; studentIds: string[] },
): Promise<{ studentId: string; sessionId: string }[]> {
  if (input.studentIds.length === 0) return [];
  const rows = await tx.execute<{ student_id: string; session_id: string }>(sql`
    select distinct s.student_user_id as student_id, k.session_id
    from core.submissions s
    join core.coursework_assessments k on k.tenant_id = s.tenant_id
      and k.assignment_id = s.assignment_id and k.status = 'active'
    where s.tenant_id = ${input.tenantId}::uuid and s.status = 'active'
      and s.student_user_id = any(${uuidArray(input.studentIds)})
      and exists (select 1 from core.submission_attempts t
                  where t.tenant_id = s.tenant_id and t.submission_id = s.id and t.status = 'active')`);
  return rows.map((row) => ({
    studentId: row.student_id,
    sessionId: row.session_id,
  }));
}

/** How much assessed coursework each of the school's exam sessions holds. */
export async function sessionWorkOf(
  tx: Tx,
  scope: OrgScope,
): Promise<{ sessionId: string; assignments: number; handedIn: number }[]> {
  const rows = await tx.execute<{
    session_id: string;
    assignments: number;
    handed_in: number;
  }>(sql`
    select k.session_id,
           count(distinct k.assignment_id)::int as assignments,
           count(distinct s.id) filter (where exists (
             select 1 from core.submission_attempts t
             where t.tenant_id = s.tenant_id and t.submission_id = s.id and t.status = 'active'))::int as handed_in
    from core.coursework_assessments k
    join core.assignments a on a.tenant_id = k.tenant_id and a.id = k.assignment_id
      and a.org_id = ${scope.orgId}::uuid and a.status = 'active'
    left join core.submissions s on s.tenant_id = k.tenant_id and s.assignment_id = k.assignment_id
      and s.status = 'active'
    where k.tenant_id = ${scope.tenantId}::uuid and k.status = 'active'
    group by k.session_id`);
  return rows.map((row) => ({
    sessionId: row.session_id,
    assignments: row.assignments,
    handedIn: row.handed_in,
  }));
}

export interface HoldRow {
  id: string;
  subjectUserId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  reason: string;
  placedAt: string;
  placedByEn: string | null;
  placedByAr: string | null;
}

/** Active legal holds on people the school has had. */
export async function holdsOf(tx: Tx, scope: OrgScope): Promise<HoldRow[]> {
  const rows = await tx.execute<{
    id: string;
    subject_user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    reason: string;
    placed_at: string;
    placed_by_en: string | null;
    placed_by_ar: string | null;
  }>(sql`
    select h.id, h.subject_user_id, u.full_name_en, u.full_name_ar, h.reason,
           h.created_at::text as placed_at,
           b.full_name_en as placed_by_en, b.full_name_ar as placed_by_ar
    from core.legal_holds h
    join core.users u on u.tenant_id = h.tenant_id and u.id = h.subject_user_id
    join core.users b on b.tenant_id = h.tenant_id and b.id = h.placed_by_user_id
    where h.tenant_id = ${scope.tenantId}::uuid and h.status = 'active' and h.released_at is null
      and (exists (select 1 from core.student_school_years y
                   where y.tenant_id = h.tenant_id and y.student_user_id = h.subject_user_id
                     and y.org_id = ${scope.orgId}::uuid and y.status = 'active')
           or exists (select 1 from core.user_roles r
                      where r.tenant_id = h.tenant_id and r.user_id = h.subject_user_id
                        and r.org_id = ${scope.orgId}::uuid and r.status = 'active'))
    order by h.created_at desc, h.id`);
  return rows.map((row) => ({
    id: row.id,
    subjectUserId: row.subject_user_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    reason: row.reason,
    placedAt: row.placed_at,
    placedByEn: row.placed_by_en,
    placedByAr: row.placed_by_ar,
  }));
}

export async function placeHold(
  tx: Tx,
  input: {
    tenantId: string;
    subjectUserId: string;
    reason: string;
    placedByUserId: string;
  },
): Promise<string> {
  const [row] = await tx
    .insert(legalHolds)
    .values(input)
    .returning({ id: legalHolds.id });
  if (!row) throw new Error("legal hold not inserted");
  return row.id;
}

/** Releases an active hold; null when there was none to release. */
export async function releaseHold(
  tx: Tx,
  input: { tenantId: string; id: string; releasedByUserId: string },
): Promise<{ subjectUserId: string; reason: string } | null> {
  const [row] = await tx
    .update(legalHolds)
    .set({
      releasedAt: sql`statement_timestamp()`,
      releasedByUserId: input.releasedByUserId,
    })
    .where(
      and(
        eq(legalHolds.tenantId, input.tenantId),
        eq(legalHolds.id, input.id),
        eq(legalHolds.status, "active"),
        isNull(legalHolds.releasedAt),
      ),
    )
    .returning({
      subjectUserId: legalHolds.subjectUserId,
      reason: legalHolds.reason,
    });
  return row ?? null;
}

/** Whether the person has ever been a student or staff member of the school. */
export async function hadAtSchool(
  tx: Tx,
  scope: OrgScope & { userId: string },
): Promise<boolean> {
  const rows = await tx.execute<{ found: boolean }>(sql`
    select exists (select 1 from core.student_school_years y
                   where y.tenant_id = ${scope.tenantId}::uuid and y.student_user_id = ${scope.userId}::uuid
                     and y.org_id = ${scope.orgId}::uuid and y.status = 'active')
        or exists (select 1 from core.user_roles r
                   where r.tenant_id = ${scope.tenantId}::uuid and r.user_id = ${scope.userId}::uuid
                     and r.org_id = ${scope.orgId}::uuid and r.status = 'active'
                     and r.role = any(${textArray([...STAFF_ROLES])})) as found`);
  return rows[0]?.found ?? false;
}
