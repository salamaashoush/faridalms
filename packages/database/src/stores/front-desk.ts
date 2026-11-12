import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { holds, isoOf, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface DeskStudent {
  id: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  photoFileId: string | null;
}

/** Students on roll in a school on a day whose name matches. */
export async function findStudents(
  tx: Tx,
  input: { tenantId: string; schoolId: string; day: string; q: string },
): Promise<DeskStudent[]> {
  const rows = await tx.execute<{
    id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    photo_file_id: string | null;
  }>(sql`
    select distinct on (u.full_name_en, u.id) u.id, u.full_name_en, u.full_name_ar,
           u.photo_file_id
    from core.enrollments n
    join core.users u on u.tenant_id = n.tenant_id and u.id = n.user_id
    where n.tenant_id = ${input.tenantId}::uuid and n.org_id = ${input.schoolId}::uuid
      and n.role = 'student' and n.status = 'active' and n.valid_during @> ${input.day}::date
      and (${holds(input.q, [sql`u.full_name_en`, sql`u.full_name_ar`])})
    order by u.full_name_en, u.id
    limit 20`);
  return rows.map((row) => ({
    id: row.id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    photoFileId: row.photo_file_id,
  }));
}

export async function insertMovement(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    studentId: string;
    day: string;
    direction: "in" | "out";
    at: string;
    reasonId: string | null;
    collectedById: string | null;
    collectedByName: string | null;
    note: string | null;
    actorId: string;
  },
): Promise<string> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.student_movements
      (tenant_id, org_id, student_user_id, day_on, direction, at, reason_descriptor_id,
       collected_by_user_id, collected_by_name, note, recorded_by_user_id)
    values (${input.tenantId}::uuid, ${input.schoolId}::uuid, ${input.studentId}::uuid,
      ${input.day}::date, ${input.direction}, ${input.at}::time, ${input.reasonId}::uuid,
      ${input.collectedById}::uuid, ${input.collectedByName}, ${input.note},
      ${input.actorId}::uuid)
    returning id`);
  if (!row) throw new Error("movement not inserted");
  return row.id;
}

export interface Movement {
  id: string;
  studentId: string;
  fullNameEn: string | null;
  fullNameAr: string | null;
  direction: "in" | "out";
  at: string;
  reasonId: string | null;
  reasonEn: string | null;
  reasonAr: string | null;
  collectedByNameEn: string | null;
  collectedByNameAr: string | null;
  note: string | null;
  byNameEn: string | null;
  byNameAr: string | null;
  recordedAt: string;
}

/** A day's arrivals and departures through reception, or one student's. */
export async function movementsOn(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    day: string;
    studentIds?: readonly string[];
  },
): Promise<Movement[]> {
  if (input.studentIds?.length === 0) return [];
  const only = input.studentIds
    ? sql`and m.student_user_id = any(${uuidArray(input.studentIds)})`
    : sql``;
  const rows = await tx.execute<{
    id: string;
    student_user_id: string;
    full_name_en: string | null;
    full_name_ar: string | null;
    direction: "in" | "out";
    at: string;
    reason_descriptor_id: string | null;
    reason_en: string | null;
    reason_ar: string | null;
    collected_en: string | null;
    collected_ar: string | null;
    note: string | null;
    by_en: string | null;
    by_ar: string | null;
    recorded_at: string;
  }>(sql`
    select m.id, m.student_user_id, s.full_name_en, s.full_name_ar, m.direction,
           to_char(m.at, 'HH24:MI') as at, m.reason_descriptor_id,
           d.label_en as reason_en, d.label_ar as reason_ar,
           coalesce(c.full_name_en, m.collected_by_name) as collected_en,
           coalesce(c.full_name_ar, m.collected_by_name) as collected_ar,
           m.note, b.full_name_en as by_en, b.full_name_ar as by_ar,
           ${isoOf(sql`m.created_at`)} as recorded_at
    from core.student_movements m
    join core.users s on s.tenant_id = m.tenant_id and s.id = m.student_user_id
    join core.users b on b.tenant_id = m.tenant_id and b.id = m.recorded_by_user_id
    left join core.users c on c.tenant_id = m.tenant_id and c.id = m.collected_by_user_id
    left join core.descriptors d on d.tenant_id = m.tenant_id and d.id = m.reason_descriptor_id
    where m.tenant_id = ${input.tenantId}::uuid and m.org_id = ${input.schoolId}::uuid
      and m.day_on = ${input.day}::date and m.status = 'active' ${only}
    order by m.at desc, m.created_at desc`);
  return rows.map((row) => ({
    id: row.id,
    studentId: row.student_user_id,
    fullNameEn: row.full_name_en,
    fullNameAr: row.full_name_ar,
    direction: row.direction,
    at: row.at,
    reasonId: row.reason_descriptor_id,
    reasonEn: row.reason_en,
    reasonAr: row.reason_ar,
    collectedByNameEn: row.collected_en,
    collectedByNameAr: row.collected_ar,
    note: row.note,
    byNameEn: row.by_en,
    byNameAr: row.by_ar,
    recordedAt: row.recorded_at,
  }));
}
