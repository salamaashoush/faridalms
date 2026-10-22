import type { Arrangements, ExtraTime } from "@faridalms/domain/arrangements";

import { sql } from "drizzle-orm";

import type { CellTransaction } from "../context";

type Tx = CellTransaction;

type ArrangementRecord = {
  student_user_id: string;
  extra_time: number;
  unlimited_time: boolean;
  read_aloud: boolean;
  fewer_choices: boolean;
  extension_days: number;
  version: number;
};

const arrangementsOfRow = (row: ArrangementRecord): Arrangements => ({
  extraTime: row.extra_time as ExtraTime,
  unlimitedTime: row.unlimited_time,
  readAloud: row.read_aloud,
  fewerChoices: row.fewer_choices,
  extensionDays: row.extension_days,
});

/** A student's arrangements at a school, with the version to change them from. */
export async function arrangementsOf(
  tx: Tx,
  input: { tenantId: string; orgId: string; studentId: string },
): Promise<{ arrangements: Arrangements; version: number } | null> {
  const [row] = await tx.execute<ArrangementRecord>(sql`
    select student_user_id, extra_time, unlimited_time, read_aloud, fewer_choices,
      extension_days, version
    from core.access_arrangements
    where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
      and student_user_id = ${input.studentId}::uuid and status = 'active'`);
  return row
    ? { arrangements: arrangementsOfRow(row), version: row.version }
    : null;
}

/**
 * Keeps a student's arrangements, the first time or over the version the
 * caller read; null when another change came first.
 */
export async function keepArrangements(
  tx: Tx,
  input: {
    tenantId: string;
    orgId: string;
    studentId: string;
    expectedVersion: number;
    arrangements: Arrangements;
  },
): Promise<number | null> {
  const value = input.arrangements;
  const [row] =
    input.expectedVersion === 0
      ? await tx.execute<{ version: number }>(sql`
          insert into core.access_arrangements (tenant_id, org_id, student_user_id, extra_time,
            unlimited_time, read_aloud, fewer_choices, extension_days)
          values (${input.tenantId}::uuid, ${input.orgId}::uuid, ${input.studentId}::uuid,
            ${value.extraTime}, ${value.unlimitedTime}, ${value.readAloud}, ${value.fewerChoices},
            ${value.extensionDays})
          on conflict (tenant_id, org_id, student_user_id) where status = 'active' do nothing
          returning version`)
      : await tx.execute<{ version: number }>(sql`
          update core.access_arrangements
          set extra_time = ${value.extraTime}, unlimited_time = ${value.unlimitedTime},
            read_aloud = ${value.readAloud}, fewer_choices = ${value.fewerChoices},
            extension_days = ${value.extensionDays}
          where tenant_id = ${input.tenantId}::uuid and org_id = ${input.orgId}::uuid
            and student_user_id = ${input.studentId}::uuid and status = 'active'
            and version = ${input.expectedVersion}
          returning version`);
  return row?.version ?? null;
}
