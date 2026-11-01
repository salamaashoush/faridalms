import type { Needs, NeedsKind } from "@faridalms/domain/admissions";

import { decryptField, encryptField } from "@faridalms/database/crypto";
import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import {
  healthRecordsOf,
  insertHealthRecord,
  removeHealthRecord,
  updateHealthRecord,
} from "@faridalms/database/stores/records";
import { emptyNeeds, NEEDS_KINDS } from "@faridalms/domain/admissions";

import type { UnitContext } from "./context";

export const healthCipher = (
  context: Pick<UnitContext, "tenantId">,
  rowId: string,
  keyVersion: number,
) => ({
  tenantId: context.tenantId,
  table: "health.records",
  column: "ciphertext",
  rowId,
  keyVersion,
});

/** The health kinds an application asks about, by meaning. Run with the health purpose set. */
async function needsKinds(context: UnitContext) {
  const kinds = await descriptorsFor(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    namespace: "health_record_kind",
    today: context.today,
    includeRetired: true,
  });
  const byMeaning = new Map<NeedsKind, string>();
  for (const kind of kinds)
    if ((NEEDS_KINDS as readonly string[]).includes(kind.meaning ?? ""))
      byMeaning.set(kind.meaning as NeedsKind, kind.id);
  return byMeaning;
}

/**
 * An applicant's health and needs as the family wrote them: one health
 * record per kind asked, in the health system, so they need no copying when
 * the child is enrolled. Run with the health purpose set.
 */
export async function readNeeds(
  context: UnitContext,
  applicantId: string,
): Promise<Needs & { ids: Partial<Record<NeedsKind, string>> }> {
  const [rows, kinds] = await Promise.all([
    healthRecordsOf(context.tx, context.tenantId, applicantId),
    needsKinds(context),
  ]);
  const needs = emptyNeeds();
  const ids: Partial<Record<NeedsKind, string>> = {};
  for (const [meaning, kindId] of kinds) {
    const row = rows.find((record) => record.kindId === kindId);
    if (!row) continue;
    const key = await context.keys.version(
      context.tx,
      context.tenantId,
      "health",
      row.keyVersion,
    );
    const parsed: unknown = JSON.parse(
      await decryptField(
        key.key,
        new Uint8Array(row.ciphertext),
        healthCipher(context, row.id, row.keyVersion),
      ),
    );
    const text =
      typeof parsed === "object" && parsed !== null && "text" in parsed
        ? String(parsed.text)
        : "";
    needs[meaning] = text;
    ids[meaning] = row.id;
  }
  return { ...needs, ids };
}

/**
 * Brings an applicant's health records in line with what the family wrote:
 * a kind answered gets its record, one emptied loses it. Run with the
 * health purpose set. Answers the kinds that changed, by name only.
 */
export async function writeNeeds(
  context: UnitContext,
  applicantId: string,
  needs: Needs,
): Promise<NeedsKind[]> {
  const [rows, kinds, current] = await Promise.all([
    healthRecordsOf(context.tx, context.tenantId, applicantId),
    needsKinds(context),
    readNeeds(context, applicantId),
  ]);
  const key = await context.keys.active(context.tx, context.tenantId, "health");
  const changed: NeedsKind[] = [];
  for (const meaning of NEEDS_KINDS) {
    const kindId = kinds.get(meaning);
    const text = needs[meaning].trim();
    if (!kindId || text === current[meaning]) continue;
    changed.push(meaning);
    const row = rows.find((record) => record.kindId === kindId);
    if (row && !text) {
      await removeHealthRecord(context.tx, {
        tenantId: context.tenantId,
        id: row.id,
        studentId: applicantId,
        expectedVersion: row.version,
      });
      continue;
    }
    const id = row?.id ?? Bun.randomUUIDv7();
    const record = {
      tenantId: context.tenantId,
      id,
      studentId: applicantId,
      kindId,
      hasAlert: false,
      recordedOn: context.today,
      keyVersion: key.version,
      ciphertext: await encryptField(
        key.key,
        JSON.stringify({ text }),
        healthCipher(context, id, key.version),
      ),
    };
    if (row)
      await updateHealthRecord(context.tx, {
        ...record,
        expectedVersion: row.version,
      });
    else await insertHealthRecord(context.tx, record);
  }
  return changed;
}
