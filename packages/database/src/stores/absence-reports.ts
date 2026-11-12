import type {
  AbsenceReportKind,
  AbsenceReportStatus,
} from "@faridalms/domain/attendance";
import type { SQL } from "drizzle-orm";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

import { bounds, isoOf, uuidArray } from "./sql";

type Tx = CellTransaction;

export interface AbsenceReport {
  id: string;
  studentId: string;
  studentNameEn: string | null;
  studentNameAr: string | null;
  reporterId: string;
  reporterNameEn: string | null;
  reporterNameAr: string | null;
  kind: AbsenceReportKind;
  from: string;
  /** The last day, inclusive. */
  to: string;
  at: string | null;
  reasonId: string;
  reasonEn: string | null;
  reasonAr: string | null;
  note: string | null;
  fileId: string | null;
  fileName: string | null;
  decision: AbsenceReportStatus;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

const lastDay = (span: string) => {
  const { from, to } = bounds(span);
  const end = new Date(`${to ?? from}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  return { from, to: end.toISOString().slice(0, 10) };
};

async function select(
  tx: Tx,
  tenantId: string,
  where: SQL,
  order: SQL = sql`r.created_at desc`,
): Promise<AbsenceReport[]> {
  const rows = await tx.execute<{
    id: string;
    student_user_id: string;
    student_en: string | null;
    student_ar: string | null;
    reported_by_user_id: string;
    reporter_en: string | null;
    reporter_ar: string | null;
    kind: AbsenceReportKind;
    span: string;
    at: string | null;
    reason_descriptor_id: string;
    reason_en: string | null;
    reason_ar: string | null;
    note: string | null;
    file_id: string | null;
    file_name: string | null;
    decision: AbsenceReportStatus;
    decided_at: string | null;
    decision_note: string | null;
    created_at: string;
  }>(sql`
    select r.id, r.student_user_id, s.full_name_en as student_en, s.full_name_ar as student_ar,
           r.reported_by_user_id, p.full_name_en as reporter_en, p.full_name_ar as reporter_ar,
           r.kind, r.span::text as span, to_char(r.at, 'HH24:MI') as at,
           r.reason_descriptor_id, d.label_en as reason_en, d.label_ar as reason_ar,
           r.note, r.file_id, f.name as file_name, r.decision,
           ${isoOf(sql`r.decided_at`)} as decided_at, r.decision_note,
           ${isoOf(sql`r.created_at`)} as created_at
    from core.absence_reports r
    join core.users s on s.tenant_id = r.tenant_id and s.id = r.student_user_id
    join core.users p on p.tenant_id = r.tenant_id and p.id = r.reported_by_user_id
    join core.descriptors d on d.tenant_id = r.tenant_id and d.id = r.reason_descriptor_id
    left join core.files f on f.tenant_id = r.tenant_id and f.id = r.file_id and f.status = 'active'
    where r.tenant_id = ${tenantId}::uuid and r.status = 'active' and ${where}
    order by ${order}
    limit 500`);
  return rows.map((row) => ({
    id: row.id,
    studentId: row.student_user_id,
    studentNameEn: row.student_en,
    studentNameAr: row.student_ar,
    reporterId: row.reported_by_user_id,
    reporterNameEn: row.reporter_en,
    reporterNameAr: row.reporter_ar,
    kind: row.kind,
    ...lastDay(row.span),
    at: row.at,
    reasonId: row.reason_descriptor_id,
    reasonEn: row.reason_en,
    reasonAr: row.reason_ar,
    note: row.note,
    fileId: row.file_id,
    fileName: row.file_name,
    decision: row.decision,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
    createdAt: row.created_at,
  }));
}

export async function insertReport(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    studentId: string;
    reporterId: string;
    kind: AbsenceReportKind;
    from: string;
    to: string;
    at: string | null;
    reasonId: string;
    note: string | null;
    fileId: string | null;
  },
): Promise<string> {
  const [row] = await tx.execute<{ id: string }>(sql`
    insert into core.absence_reports
      (tenant_id, org_id, student_user_id, reported_by_user_id, kind,
       span, at, reason_descriptor_id, note, file_id)
    values (${input.tenantId}::uuid, ${input.schoolId}::uuid,
      ${input.studentId}::uuid, ${input.reporterId}::uuid, ${input.kind},
      daterange(${input.from}::date, ${input.to}::date, '[]'), ${input.at}::time,
      ${input.reasonId}::uuid, ${input.note}, ${input.fileId}::uuid)
    returning id`);
  if (!row) throw new Error("absence report not inserted");
  return row.id;
}

/** Reports for some students, newest first. */
export function reportsFor(
  tx: Tx,
  input: { tenantId: string; schoolId: string; studentIds: readonly string[] },
): Promise<AbsenceReport[]> {
  return select(
    tx,
    input.tenantId,
    sql`r.org_id = ${input.schoolId}::uuid
      and r.student_user_id = any(${uuidArray(input.studentIds)})`,
  );
}

/** A school's reports: those waiting first, or every one. */
export function reportInbox(
  tx: Tx,
  input: { tenantId: string; schoolId: string; open: boolean },
): Promise<AbsenceReport[]> {
  return select(
    tx,
    input.tenantId,
    input.open
      ? sql`r.org_id = ${input.schoolId}::uuid and r.decision = 'pending'`
      : sql`r.org_id = ${input.schoolId}::uuid`,
    input.open ? sql`lower(r.span), r.created_at` : sql`r.created_at desc`,
  );
}

export async function reportById(
  tx: Tx,
  input: { tenantId: string; schoolId: string; id: string },
): Promise<AbsenceReport | null> {
  const [row] = await select(
    tx,
    input.tenantId,
    sql`r.org_id = ${input.schoolId}::uuid and r.id = ${input.id}::uuid`,
  );
  return row ?? null;
}

/** Reports still standing on a day: waiting for the office, or accepted. */
export function reportsOn(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    studentIds: readonly string[];
    day: string;
  },
): Promise<AbsenceReport[]> {
  if (input.studentIds.length === 0) return Promise.resolve([]);
  return select(
    tx,
    input.tenantId,
    sql`r.org_id = ${input.schoolId}::uuid
      and r.student_user_id = any(${uuidArray(input.studentIds)})
      and r.span @> ${input.day}::date and r.decision in ('pending', 'accepted')`,
  );
}

/** Takes back a report the office has not yet decided. */
export async function withdrawReport(
  tx: Tx,
  input: { tenantId: string; id: string },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.absence_reports set decision = 'withdrawn'
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and status = 'active' and decision = 'pending'
    returning id`);
  return rows.length > 0;
}

/** Records the office's decision on a report still waiting for one. */
export async function decideReport(
  tx: Tx,
  input: {
    tenantId: string;
    id: string;
    decision: "accepted" | "declined";
    note: string | null;
    actorId: string;
  },
): Promise<boolean> {
  const rows = await tx.execute<{ id: string }>(sql`
    update core.absence_reports
    set decision = ${input.decision}, decided_by_user_id = ${input.actorId}::uuid,
        decided_at = statement_timestamp(), decision_note = ${input.note}
    where tenant_id = ${input.tenantId}::uuid and id = ${input.id}::uuid
      and status = 'active' and decision = 'pending'
    returning id`);
  return rows.length > 0;
}

/**
 * A student's marks on some days that a reason would explain: absences, and
 * late arrivals or early leaves.
 */
export async function marksToExplain(
  tx: Tx,
  input: {
    tenantId: string;
    schoolId: string;
    studentId: string;
    from: string;
    to: string;
    kind: AbsenceReportKind;
    /** Only marks no one has given a reason yet. */
    unexplained?: boolean;
  },
): Promise<{ id: string; date: string }[]> {
  const meanings =
    input.kind === "absent"
      ? sql`('absent', 'excused')`
      : input.kind === "late"
        ? sql`('late')`
        : sql`('left_early')`;
  const rows = await tx.execute<{ id: string; taken_on: string }>(sql`
    select e.id, to_char(e.taken_on, 'YYYY-MM-DD') as taken_on
    from core.attendance_events e
    join core.attendance_registers g on g.tenant_id = e.tenant_id and g.id = e.register_id
    where e.tenant_id = ${input.tenantId}::uuid and g.org_id = ${input.schoolId}::uuid
      and e.student_user_id = ${input.studentId}::uuid and e.status = 'active'
      and e.taken_on between ${input.from}::date and ${input.to}::date
      and e.category_meaning in ${meanings}
      ${input.unexplained ? sql`and e.reason_descriptor_id is null` : sql``}`);
  return rows.map((row) => ({ id: row.id, date: row.taken_on }));
}
