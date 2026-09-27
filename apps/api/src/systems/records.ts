import type { Scope } from "@faridalms/database/stores/students";

import { decryptField, encryptField } from "@faridalms/database/crypto";
import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import {
  demographicsOf,
  healthRecordsOf,
  insertHealthRecord,
  refreshMedicalAlert,
  removeHealthRecord,
  restrictionsOf,
  saveDemographicsRow,
  saveRestriction,
  updateCustodyFlags,
  updateHealthRecord,
} from "@faridalms/database/stores/records";
import {
  guardiansOf,
  isVisibleStudent,
  refreshCustodyAlert,
} from "@faridalms/database/stores/students";
import {
  HEALTH_SEVERITIES,
  removeHealthRecordSchema,
  saveCustodySchema,
  saveDemographicsSchema,
  saveHealthRecordSchema,
} from "@faridalms/domain/people";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { can, readProcedure, writeProcedure } from "../core/procedure";
import { withPurposeFor } from "../core/purpose";

const id = v.pipe(v.string(), v.uuid());

function scopeOf(context: UnitContext): Scope {
  return {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    today: context.today,
    viewerId: context.actor.userId,
    schoolWide: can(context, "people:manage"),
  };
}

async function requireStudent(context: UnitContext, studentId: string) {
  if (!(await isVisibleStudent(context.tx, scopeOf(context), studentId)))
    throw new ORPCError("NOT_FOUND");
}

const cipher = (context: UnitContext, rowId: string, keyVersion: number) => ({
  tenantId: context.tenantId,
  table: "health.records",
  column: "ciphertext",
  rowId,
  keyVersion,
});

interface HealthPayload {
  text?: string;
  value?: string;
  severity?: string;
  action_plan?: string;
}

function isPayload(value: unknown): value is HealthPayload {
  return typeof value === "object" && value !== null;
}

function severityOf(value: string | undefined) {
  return HEALTH_SEVERITIES.find((severity) => severity === value) ?? null;
}

export const health = readProcedure
  .input(v.object({ studentId: id }))
  .handler(async ({ input, context }) => {
    await requireStudent(context, input.studentId);
    const [rows, kinds] = await withPurposeFor(
      context,
      {
        purpose: "health",
        subjectUserId: input.studentId,
        reason: "Opened the student's health records",
        write: false,
      },
      async (tx) =>
        Promise.all([
          healthRecordsOf(tx, context.tenantId, input.studentId),
          descriptorsFor(tx, {
            tenantId: context.tenantId,
            schoolId: context.schoolId,
            namespace: "health_record_kind",
            today: context.today,
            includeRetired: true,
          }),
        ]),
    );
    const records = await Promise.all(
      rows.map(async (row) => {
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
            cipher(context, row.id, row.keyVersion),
          ),
        );
        const payload = isPayload(parsed) ? parsed : {};
        const kind = kinds.find((entry) => entry.id === row.kindId);
        return {
          id: row.id,
          version: row.version,
          kindId: row.kindId,
          kind: kind ? { labelEn: kind.labelEn, labelAr: kind.labelAr } : null,
          hasAlert: row.hasAlert,
          recordedOn: row.recordedOn,
          text: payload.text ?? payload.value ?? "",
          severity: severityOf(payload.severity),
          actionPlan: payload.action_plan ?? null,
        };
      }),
    );
    return {
      records,
      kinds: kinds.map((kind) => ({
        id: kind.id,
        code: kind.code,
        labelEn: kind.labelEn,
        labelAr: kind.labelAr,
      })),
      canWrite: can(context, "health:write"),
    };
  });

export const saveHealth = writeProcedure
  .input(saveHealthRecordSchema)
  .handler(async ({ input, context }) => {
    await requireStudent(context, input.studentId);
    const key = await context.keys.active(
      context.tx,
      context.tenantId,
      "health",
    );
    const rowId = input.id ?? Bun.randomUUIDv7();
    const payload: HealthPayload = {
      text: input.text,
      ...(input.severity ? { severity: input.severity } : {}),
      ...(input.actionPlan ? { action_plan: input.actionPlan } : {}),
    };
    const ciphertext = await encryptField(
      key.key,
      JSON.stringify(payload),
      cipher(context, rowId, key.version),
    );
    const record = {
      tenantId: context.tenantId,
      studentId: input.studentId,
      kindId: input.kindId,
      hasAlert: input.hasAlert,
      recordedOn: input.recordedOn || null,
      keyVersion: key.version,
      ciphertext,
    };
    await withPurposeFor(
      context,
      {
        purpose: "health",
        subjectUserId: input.studentId,
        reason: input.id ? "Changed a health record" : "Added a health record",
        write: true,
      },
      async (tx) => {
        if (input.id) {
          const saved = await updateHealthRecord(tx, {
            ...record,
            id: input.id,
            expectedVersion: input.expectedVersion ?? 0,
          });
          if (!saved)
            throw new ORPCError("CONFLICT", { message: "conflict.version" });
        } else await insertHealthRecord(tx, { ...record, id: rowId });
        await refreshMedicalAlert(tx, context.tenantId, input.studentId);
      },
    );
    return { id: rowId };
  });

export const removeHealth = writeProcedure
  .input(removeHealthRecordSchema)
  .handler(async ({ input, context }) => {
    await requireStudent(context, input.studentId);
    await withPurposeFor(
      context,
      {
        purpose: "health",
        subjectUserId: input.studentId,
        reason: "Removed a health record",
        write: true,
      },
      async (tx) => {
        const removed = await removeHealthRecord(tx, {
          tenantId: context.tenantId,
          id: input.id,
          studentId: input.studentId,
          expectedVersion: input.expectedVersion,
        });
        if (!removed)
          throw new ORPCError("CONFLICT", { message: "conflict.version" });
        await refreshMedicalAlert(tx, context.tenantId, input.studentId);
      },
    );
    return { removed: true };
  });

export const demographics = readProcedure
  .input(v.object({ userId: id }))
  .handler(async ({ input, context }) => {
    await requireStudent(context, input.userId);
    const row = await withPurposeFor(
      context,
      {
        purpose: "demographics",
        subjectUserId: input.userId,
        reason: "Opened the student's background details",
        write: false,
      },
      (tx) => demographicsOf(tx, context.tenantId, input.userId),
    );
    return { ...row, canWrite: can(context, "demographics:write") };
  });

export const saveDemographics = writeProcedure
  .input(saveDemographicsSchema)
  .handler(async ({ input, context }) => {
    await requireStudent(context, input.userId);
    await withPurposeFor(
      context,
      {
        purpose: "demographics",
        subjectUserId: input.userId,
        reason: "Changed the student's background details",
        write: true,
      },
      async (tx) => {
        const saved = await saveDemographicsRow(tx, {
          tenantId: context.tenantId,
          userId: input.userId,
          expectedVersion: input.expectedVersion,
          birthCountryCode: input.birthCountryCode || null,
          birthCity: input.birthCity,
          nationalityCodes: [...new Set(input.nationalityCodes)],
          religionId: input.religionId || null,
          homeLanguages: [...new Set(input.homeLanguages)],
        });
        if (!saved)
          throw new ORPCError("CONFLICT", { message: "conflict.version" });
      },
    );
    return { saved: true };
  });

/** Each guardian link's restrictions, for staff who hold custody records. */
export const custody = readProcedure
  .input(v.object({ studentId: id }))
  .handler(async ({ input, context }) => {
    await requireStudent(context, input.studentId);
    const links = await guardiansOf(
      context.tx,
      scopeOf(context),
      input.studentId,
    );
    const restrictions = await withPurposeFor(
      context,
      {
        purpose: "custody",
        subjectUserId: input.studentId,
        reason: "Opened the student's custody records",
        write: false,
      },
      (tx) =>
        restrictionsOf(
          tx,
          context.tenantId,
          links.map((link) => link.relationshipId),
        ),
    );
    return {
      links: links.map((link) => ({
        relationshipId: link.relationshipId,
        version: link.version,
        fullNameEn: link.fullNameEn,
        fullNameAr: link.fullNameAr,
        pickup: link.pickup,
        educationalRights: link.educationalRights,
        communicationIsolated: link.communicationIsolated,
        contactRestrictions:
          restrictions.find((row) => row.relationshipId === link.relationshipId)
            ?.contactRestrictions ?? null,
      })),
      canWrite: can(context, "custody:write"),
    };
  });

export const saveCustody = writeProcedure
  .input(saveCustodySchema)
  .handler(async ({ input, context }) => {
    await requireStudent(context, input.studentId);
    await withPurposeFor(
      context,
      {
        purpose: "custody",
        subjectUserId: input.studentId,
        reason: "Changed a guardian's custody record",
        write: true,
      },
      async (tx) => {
        const saved = await updateCustodyFlags(tx, {
          tenantId: context.tenantId,
          studentId: input.studentId,
          relationshipId: input.relationshipId,
          expectedVersion: input.expectedVersion,
          educationalRights: input.educationalRights,
          communicationIsolated: input.communicationIsolated,
          pickup: input.pickup,
        });
        if (!saved)
          throw new ORPCError("CONFLICT", { message: "conflict.version" });
        await saveRestriction(tx, {
          tenantId: context.tenantId,
          relationshipId: input.relationshipId,
          contactRestrictions: input.contactRestrictions,
        });
        await refreshCustodyAlert(
          tx,
          context.tenantId,
          input.studentId,
          context.today,
        );
      },
    );
    return { saved: true };
  });
