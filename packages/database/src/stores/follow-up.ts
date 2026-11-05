import type { ContactOutcome } from "@faridalms/domain/attendance";
import type { SQL } from "drizzle-orm";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { isoOf, uuidArray } from "./sql";

type Tx = CellTransaction;

/** An unexplained mark no family report covers. */
const unreported = (day: SQL) => sql`not exists (
  select 1 from core.absence_reports r
  where r.tenant_id = e.tenant_id and r.student_user_id = e.student_user_id
    and r.status = 'active' and r.decision in ('pending', 'accepted')
    and r.span @> ${day})`;

export interface CallRow {
  studentId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  homeroomCode: string | null;
  homeroomTitleEn: string | null;
  homeroomTitleAr: string | null;
  /** The first period the child was marked away in. */
  periodNameEn: string | null;
  periodNameAr: string | null;
}

/**
 * Children away on a day with no reason and no word from their family:
 * whom the office calls on the first day of an absence.
 */
export async function callList(
  tx: Tx,
  input: { tenantId: string; schoolId: string; day: string },
): Promise<CallRow[]> {
  const rows = await tx.execute<{
    student_user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    homeroom_code: string | null;
    homeroom_en: string | null;
    homeroom_ar: string | null;
    period_en: string | null;
    period_ar: string | null;
  }>(sql`
    with away as (
      select distinct on (e.student_user_id) e.student_user_id, p.name_en, p.name_ar
      from core.attendance_events e
      join core.attendance_registers g on g.tenant_id = e.tenant_id and g.id = e.register_id
      join core.class_periods p on p.tenant_id = g.tenant_id and p.id = g.class_period_id
      where e.tenant_id = ${input.tenantId}::uuid and g.org_id = ${input.schoolId}::uuid
        and e.taken_on = ${input.day}::date and e.status = 'active'
        and e.category_meaning = 'absent' and e.reason_descriptor_id is null
        and ${unreported(sql`${input.day}::date`)}
      order by e.student_user_id, p.sequence
    )
    select a.student_user_id, u.full_name_en, u.full_name_ar,
           h.code as homeroom_code, h.title_en as homeroom_en, h.title_ar as homeroom_ar,
           a.name_en as period_en, a.name_ar as period_ar
    from away a
    join core.users u on u.tenant_id = ${input.tenantId}::uuid and u.id = a.student_user_id
    left join lateral (
      select c.code, c.title_en, c.title_ar from core.enrollments n
      join core.classes c on c.tenant_id = n.tenant_id and c.id = n.class_id
        and c.class_type = 'homeroom'
      where n.tenant_id = u.tenant_id and n.user_id = u.id and n.role = 'student'
        and n.status = 'active' and n.valid_during @> ${input.day}::date
      limit 1) h on true
    order by h.code nulls last, u.full_name_en`);
  return rows.map((row) => ({
    studentId: row.student_user_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    homeroomCode: row.homeroom_code,
    homeroomTitleEn: row.homeroom_en,
    homeroomTitleAr: row.homeroom_ar,
    periodNameEn: row.period_en,
    periodNameAr: row.period_ar,
  }));
}

export interface Guardian {
  studentId: string;
  userId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  relationEn: string | null;
  relationAr: string | null;
  phone: string | null;
  emergency: boolean;
}

/**
 * Whom to call for each child, in the order the family gave: primary
 * contacts first. Contacts the school must not reach are left out.
 */
export async function guardiansToCall(
  tx: Tx,
  input: { tenantId: string; studentIds: readonly string[]; day: string },
): Promise<Guardian[]> {
  if (input.studentIds.length === 0) return [];
  const rows = await tx.execute<{
    student_user_id: string;
    related_user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    relation_en: string | null;
    relation_ar: string | null;
    phone: string | null;
    emergency_contact: boolean;
  }>(sql`
    select l.student_user_id, l.related_user_id, u.full_name_en, u.full_name_ar,
           d.label_en as relation_en, d.label_ar as relation_ar, l.emergency_contact,
           (select coalesce(c.normalized, c.value) from core.contact_points c
             where c.tenant_id = u.tenant_id and c.user_id = u.id and c.kind = 'phone'
               and c.status = 'active'
             order by c.priority nulls last, c.created_at limit 1) as phone
    from core.user_relationships l
    join core.users u on u.tenant_id = l.tenant_id and u.id = l.related_user_id
    left join core.descriptors d on d.tenant_id = l.tenant_id and d.id = l.relation_descriptor_id
    where l.tenant_id = ${input.tenantId}::uuid
      and l.student_user_id = any(${uuidArray(input.studentIds)})
      and app.guardian_permits(l, ${input.day}::date, 'call')
    order by l.student_user_id, l.primary_contact desc, l.contact_priority nulls last,
             u.full_name_en`);
  return rows.map((row) => ({
    studentId: row.student_user_id,
    userId: row.related_user_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    relationEn: row.relation_en,
    relationAr: row.relation_ar,
    phone: row.phone,
    emergency: row.emergency_contact,
  }));
}

export interface ContactRow {
  id: string;
  studentId: string;
  outcome: ContactOutcome;
  note: string | null;
  byNameEn: string | null;
  byNameAr: string | null;
  at: string;
}

/**
 * The calls the office logged on a day about children's absences. A call
 * is a logged contact in the attendance office's conversation with the
 * child's family, so it is read from there with the rest of that
 * conversation, as Messages shows it.
 */
export async function contactsOn(
  tx: Tx,
  input: { tenantId: string; schoolId: string; day: string },
): Promise<ContactRow[]> {
  const rows = await tx.execute<{
    id: string;
    student_user_id: string;
    outcome: ContactOutcome;
    note: string;
    by_en: string | null;
    by_ar: string | null;
    at: string;
  }>(sql`
    select x.id, x.details ->> 'studentId' as student_user_id, x.details ->> 'outcome' as outcome,
           x.body as note, u.full_name_en as by_en, u.full_name_ar as by_ar,
           ${isoOf(sql`x.created_at`)} as at
    from core.messages x
    join core.message_threads t on t.tenant_id = x.tenant_id and t.id = x.thread_id
      and t.mailbox = 'attendance' and t.org_id = ${input.schoolId}::uuid and t.status = 'active'
    left join core.users u on u.tenant_id = x.tenant_id and u.id = x.author_user_id
    where x.tenant_id = ${input.tenantId}::uuid and x.status = 'active' and x.kind = 'call'
      and x.details ? 'studentId' and x.details ->> 'on' = ${input.day}
    order by x.created_at`);
  return rows.map((row) => ({
    id: row.id,
    studentId: row.student_user_id,
    outcome: row.outcome,
    note: row.note || null,
    byNameEn: row.by_en,
    byNameAr: row.by_ar,
    at: row.at,
  }));
}

export interface OverdueRow {
  studentId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  marks: number;
  oldest: string;
}

/**
 * Children with absences still unexplained from before `before`, when the
 * reason was due: the oldest first.
 */
export async function overdueReasons(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    from: string;
    before: string;
    limit: number;
    offset: number;
  },
): Promise<{ rows: OverdueRow[]; total: number }> {
  const rows = await tx.execute<{
    student_user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    marks: number;
    oldest: string;
    total: number;
  }>(sql`
    select e.student_user_id, u.full_name_en, u.full_name_ar, count(*)::int as marks,
           to_char(min(e.taken_on), 'YYYY-MM-DD') as oldest, (count(*) over ())::int as total
    from core.attendance_events e
    join core.attendance_registers g on g.tenant_id = e.tenant_id and g.id = e.register_id
    join core.users u on u.tenant_id = e.tenant_id and u.id = e.student_user_id
    where e.tenant_id = ${input.tenantId}::uuid and g.org_id = ${input.schoolId}::uuid
      and e.taken_on >= ${input.from}::date and e.taken_on < ${input.before}::date
      and e.status = 'active' and e.category_meaning = 'absent'
      and e.reason_descriptor_id is null and ${unreported(sql`e.taken_on`)}
    group by e.student_user_id, u.full_name_en, u.full_name_ar
    order by min(e.taken_on), u.full_name_en, e.student_user_id
    limit ${input.limit} offset ${input.offset}`);
  return {
    rows: rows.map((row) => ({
      studentId: row.student_user_id,
      fullNameEn: row.full_name_en,
      fullNameAr: row.full_name_ar,
      marks: row.marks,
      oldest: row.oldest,
    })),
    total: rows[0]?.total ?? 0,
  };
}
