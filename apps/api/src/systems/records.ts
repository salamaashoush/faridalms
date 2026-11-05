import type {
  HealthChangeRow,
  HealthRow,
} from "@faridalms/database/stores/records";

import { withPurpose } from "@faridalms/database/context";
import { decryptField } from "@faridalms/database/crypto";
import {
  arrangementsOf,
  keepArrangements,
} from "@faridalms/database/stores/arrangements";
import { arrangeDue } from "@faridalms/database/stores/coursework";
import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import {
  filesByIds,
  linkFiles,
  rehostFiles,
  retireFile,
} from "@faridalms/database/stores/files";
import { schoolProfile } from "@faridalms/database/stores/identity";
import {
  childrenOf,
  permittingLink,
  replaceContact,
} from "@faridalms/database/stores/persons";
import { closeRequest, requestById } from "@faridalms/database/stores/privacy";
import {
  demographicsOf,
  familyHealthChanges,
  familyHealthRecordsOf,
  healthChangeById,
  healthChangeOf,
  healthChangeQueue,
  healthQueueStudents,
  healthRecordOf,
  healthRecordsOf,
  insertHealthChange,
  insertHealthRecord,
  refreshMedicalAlert,
  removeHealthRecord,
  resealHealthChange,
  restrictionsOf,
  saveDemographicsRow,
  saveRestriction,
  setHealthReport,
  shareHealthReport,
  updateCustodyFlags,
  updateHealthRecord,
} from "@faridalms/database/stores/records";
import {
  guardiansOf,
  refreshCustodyAlert,
} from "@faridalms/database/stores/students";
import {
  arrangementsRefSchema,
  NO_ARRANGEMENTS,
  saveArrangementsSchema,
} from "@faridalms/domain/arrangements";
import { healthReportName, safeFilename } from "@faridalms/domain/file";
import {
  askHealthChangeSchema,
  attachHealthReportSchema,
  CONTACT_LABELS,
  decideHealthChangeSchema,
  FAMILY_HEALTH_KINDS,
  HEALTH_SEVERITIES,
  healthChangesSchema,
  removeHealthRecordSchema,
  removeHealthReportSchema,
  saveCustodySchema,
  saveDemographicsSchema,
  saveHealthRecordSchema,
  shareHealthReportSchema,
} from "@faridalms/domain/people";
import { toE164 } from "@faridalms/domain/phone";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { changeCipher, healthCipher, openSealed, seal } from "../core/health";
import { notify } from "../core/notify";
import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { withPurposeFor } from "../core/purpose";
import { reachesStudent, requireStudent, scopeFor } from "../core/reach";
import { logFamilyRequest } from "../core/records-requests";
import { registerHostReader } from "../files/authorize";

const AUDIT_ACTIONS = {
  accepted: "health_change.accept",
  declined: "health_change.decline",
} as const;

const id = v.pipe(v.string(), v.uuid());

interface HealthPayload {
  text?: string;
  value?: string;
  severity?: string;
  action_plan?: string;
  /** The name the record's report was uploaded under; the file keeps a generic one. */
  report_name?: string;
}

function isPayload(value: unknown): value is HealthPayload {
  return typeof value === "object" && value !== null;
}

function severityOf(value: string | undefined) {
  return HEALTH_SEVERITIES.find((severity) => severity === value) ?? null;
}

/**
 * A report as a file card shows it: the name it was uploaded under, which
 * only the record holds, with the type and size its stored file has.
 */
async function reportFiles(context: UnitContext, ids: (string | null)[]) {
  const files = await withPurpose(context.tx, "health", (tx) =>
    filesByIds(
      tx,
      context.tenantId,
      ids.filter((fileId): fileId is string => fileId !== null),
    ),
  );
  return (fileId: string, name: string | undefined) => {
    const file = files.find((row) => row.id === fileId);
    return {
      fileId,
      name: name ?? healthReportName(file?.name ?? ""),
      mediaType: file?.mediaType ?? "application/octet-stream",
      sizeBytes: file?.sizeBytes ?? 0,
    };
  };
}

export const health = readProcedure
  .input(v.object({ studentId: id }))
  .handler(async ({ input, context }) => {
    await requireStudent(context, "people", input.studentId);
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
    const reportOf = await reportFiles(
      context,
      rows.map((row) => row.fileId),
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
            healthCipher(context, row.id, row.keyVersion),
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
          report: row.fileId
            ? {
                ...reportOf(row.fileId, payload.report_name),
                shared: row.reportShared,
              }
            : null,
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
    await requireStudent(context, "people", input.studentId);
    const rowId = input.id ?? Bun.randomUUIDv7();
    await withPurposeFor(
      context,
      {
        purpose: "health",
        subjectUserId: input.studentId,
        reason: input.id ? "Changed a health record" : "Added a health record",
        write: true,
      },
      async (tx) => {
        const current = input.id
          ? (await healthRecordsOf(tx, context.tenantId, input.studentId)).find(
              (row) => row.id === input.id,
            )
          : undefined;
        if (input.id && !current)
          throw new ORPCError("CONFLICT", { message: "conflict.version" });
        const held = current ? await openRecord(context, current) : {};
        const payload: HealthPayload = {
          ...(held.report_name ? { report_name: held.report_name } : {}),
          text: input.text,
          ...(input.severity ? { severity: input.severity } : {}),
          ...(input.actionPlan ? { action_plan: input.actionPlan } : {}),
        };
        const record = {
          tenantId: context.tenantId,
          studentId: input.studentId,
          kindId: input.kindId,
          hasAlert: input.hasAlert,
          recordedOn: input.recordedOn || null,
          ...(await seal(
            context,
            (keyVersion) => healthCipher(context, rowId, keyVersion),
            payload,
          )),
        };
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
    await requireStudent(context, "people", input.studentId);
    const gone = await withPurposeFor(
      context,
      {
        purpose: "health",
        subjectUserId: input.studentId,
        reason: "Removed a health record",
        write: true,
      },
      async (tx) => {
        const current = (
          await healthRecordsOf(tx, context.tenantId, input.studentId)
        ).find((row) => row.id === input.id);
        const removed = await removeHealthRecord(tx, {
          tenantId: context.tenantId,
          id: input.id,
          studentId: input.studentId,
          expectedVersion: input.expectedVersion,
        });
        if (!removed)
          throw new ORPCError("CONFLICT", { message: "conflict.version" });
        await refreshMedicalAlert(tx, context.tenantId, input.studentId);
        return current?.fileId
          ? retireFile(tx, {
              tenantId: context.tenantId,
              id: current.fileId,
              host: { type: "health_record", id: input.id },
            })
          : null;
      },
    );
    dropBytes(context, gone);
    return { removed: true };
  });

/** What a health record holds, opened with the key version it was sealed under. */
async function openRecord(
  context: UnitContext,
  row: HealthRow,
): Promise<HealthPayload> {
  const held = await openSealed(
    context,
    healthCipher(context, row.id, row.keyVersion),
    row.ciphertext,
  );
  return isPayload(held) ? held : {};
}

/** A report's bytes go once the change that let go of it commits. */
function dropBytes(context: UnitContext, key: string | null) {
  if (key) context.afterCommit(() => context.files.remove(key));
}

/**
 * Makes a file the record's report, with the name it was uploaded under
 * sealed into the record, and lets go of the report the record held
 * before, answering its key. `place` puts the file in the record's keeping.
 * Run with the health purpose set.
 */
async function giveReport(
  context: UnitContext,
  tx: UnitContext["tx"],
  input: {
    studentId: string;
    record: HealthRow;
    report: { fileId: string; name: string };
    shared: boolean;
    place: () => Promise<boolean>;
  },
): Promise<string | null> {
  const { record, report } = input;
  if (!(await input.place()))
    throw new ORPCError("CONFLICT", { message: "files.not_linkable" });
  const sealed = await seal(
    context,
    (keyVersion) => healthCipher(context, record.id, keyVersion),
    {
      ...(await openRecord(context, record)),
      report_name: safeFilename(report.name),
    },
  );
  const saved = await setHealthReport(tx, {
    tenantId: context.tenantId,
    id: record.id,
    studentId: input.studentId,
    expectedVersion: record.version,
    fileId: report.fileId,
    shared: input.shared,
    ...sealed,
  });
  if (!saved) throw new ORPCError("CONFLICT", { message: "conflict.version" });
  return record.fileId && record.fileId !== report.fileId
    ? retireFile(tx, {
        tenantId: context.tenantId,
        id: record.fileId,
        host: { type: "health_record", id: record.id },
      })
    : null;
}

/** A record the health staff work on, at the version they read, or a conflict. */
async function recordToChange(
  context: UnitContext,
  tx: UnitContext["tx"],
  input: { studentId: string; recordId: string; expectedVersion: number },
) {
  const record = (
    await healthRecordsOf(tx, context.tenantId, input.studentId)
  ).find((row) => row.id === input.recordId);
  if (!record) throw new ORPCError("NOT_FOUND");
  if (record.version !== input.expectedVersion)
    throw new ORPCError("CONFLICT", { message: "conflict.version" });
  return record;
}

/**
 * The health staff give a record its report, such as a doctor's letter,
 * replacing any it held. The file was uploaded as a medical report, so it
 * rests sealed under the school's files key.
 */
export const attachHealthReport = writeProcedure
  .input(attachHealthReportSchema)
  .handler(async ({ input, context }) => {
    await requireStudent(context, "people", input.studentId);
    const gone = await withPurposeFor(
      context,
      {
        purpose: "health",
        subjectUserId: input.studentId,
        reason: "Attached a report to a health record",
        write: true,
      },
      async (tx) =>
        giveReport(context, tx, {
          studentId: input.studentId,
          record: await recordToChange(context, tx, input),
          report: input.report,
          shared: input.shared,
          place: async () =>
            (
              await linkFiles(tx, {
                tenantId: context.tenantId,
                userId: context.actor.userId,
                ids: [input.report.fileId],
                purpose: "health_report",
                host: { type: "health_record", id: input.recordId },
              })
            ).length === 1,
        }),
    );
    dropBytes(context, gone);
    return { id: input.recordId };
  });

/** Whether a family that reads the medical summary may open the record's report. */
export const shareReport = writeProcedure
  .input(shareHealthReportSchema)
  .handler(async ({ input, context }) => {
    await requireStudent(context, "people", input.studentId);
    await withPurposeFor(
      context,
      {
        purpose: "health",
        subjectUserId: input.studentId,
        reason: input.shared
          ? "Shared a health report with the family"
          : "Stopped sharing a health report with the family",
        write: true,
      },
      async (tx) => {
        await recordToChange(context, tx, input);
        if (
          !(await shareHealthReport(tx, {
            tenantId: context.tenantId,
            id: input.recordId,
            studentId: input.studentId,
            expectedVersion: input.expectedVersion,
            shared: input.shared,
          }))
        )
          throw new ORPCError("CONFLICT", { message: "conflict.version" });
      },
    );
    return { shared: input.shared };
  });

/** Takes a record's report away; the file goes with it. */
export const removeReport = writeProcedure
  .input(removeHealthReportSchema)
  .handler(async ({ input, context }) => {
    await requireStudent(context, "people", input.studentId);
    const gone = await withPurposeFor(
      context,
      {
        purpose: "health",
        subjectUserId: input.studentId,
        reason: "Removed a health record's report",
        write: true,
      },
      async (tx) => {
        const record = await recordToChange(context, tx, input);
        if (!record.fileId) throw new ORPCError("NOT_FOUND");
        const held = await openRecord(context, record);
        const sealed = await seal(
          context,
          (keyVersion) => healthCipher(context, record.id, keyVersion),
          Object.fromEntries(
            Object.entries(held).filter(([field]) => field !== "report_name"),
          ),
        );
        if (
          !(await setHealthReport(tx, {
            tenantId: context.tenantId,
            id: record.id,
            studentId: input.studentId,
            expectedVersion: record.version,
            fileId: null,
            shared: false,
            ...sealed,
          }))
        )
          throw new ORPCError("CONFLICT", { message: "conflict.version" });
        return retireFile(tx, {
          tenantId: context.tenantId,
          id: record.fileId,
          host: { type: "health_record", id: record.id },
        });
      },
    );
    dropBytes(context, gone);
    return { removed: true };
  });

export const demographics = readProcedure
  .input(v.object({ userId: id }))
  .handler(async ({ input, context }) => {
    await requireStudent(context, "people", input.userId);
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
    await requireStudent(context, "people", input.userId);
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
    await requireStudent(context, "people", input.studentId);
    const links = await guardiansOf(
      context.tx,
      scopeFor(context, "people"),
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
        portalAccess: link.portalAccess,
        relationMeaning: link.relationMeaning,
        accessBasis: link.accessBasis,
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
    await requireStudent(context, "people", input.studentId);
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

/**
 * Whoever keeps arrangements sees every student of the school; others see
 * the students they may read at all, whose arrangements they apply.
 */
async function requireArranged(context: UnitContext, studentId: string) {
  await requireStudent(context, "support", studentId);
}

/** A student's access arrangements, for the staff who teach or support them. */
export const arrangements = readProcedure
  .input(arrangementsRefSchema)
  .handler(async ({ input, context }) => {
    if (!can(context, "people:read") && !can(context, "support:manage"))
      throw new ORPCError("FORBIDDEN");
    await requireArranged(context, input.studentId);
    const kept = await arrangementsOf(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      studentId: input.studentId,
    });
    return {
      arrangements: kept?.arrangements ?? NO_ARRANGEMENTS,
      version: kept?.version ?? 0,
      canWrite: can(context, "support:manage"),
    };
  });

/**
 * Keeps a student's access arrangements. Days added to due dates reach the
 * work they are set from now on and work still to come due.
 */
export const saveArrangements = writeProcedure
  .input(saveArrangementsSchema)
  .handler(async ({ input, context }) => {
    if (!can(context, "support:manage")) throw new ORPCError("FORBIDDEN");
    await requireArranged(context, input.studentId);
    const version = await keepArrangements(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      studentId: input.studentId,
      expectedVersion: input.expectedVersion,
      arrangements: input.arrangements,
    });
    if (version === null)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await arrangeDue(context.tx, {
      tenantId: context.tenantId,
      studentIds: [input.studentId],
      from: context.now,
    });
    await audit(context, {
      action: "student.arrangements",
      objectType: "user",
      objectId: input.studentId,
      studentUserId: input.studentId,
      details: { ...input.arrangements },
    });
    return { version };
  });

// --- the family's medical summary ------------------------------------------

type Severity = (typeof HEALTH_SEVERITIES)[number];

interface RecordValue {
  text: string;
  severity: Severity | null;
}

interface ContactValue {
  phone: string | null;
}

type ChangeValue = RecordValue | ContactValue;

interface ChangePayload {
  before: ChangeValue | null;
  after: ChangeValue;
  reason?: string;
  /** The name of the report the family sent with the change. */
  report?: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function recordValueOf(value: unknown): RecordValue {
  const payload = isObject(value) ? value : {};
  const text = payload.text ?? payload.value;
  return {
    text: typeof text === "string" ? text : "",
    severity: severityOf(
      typeof payload.severity === "string" ? payload.severity : undefined,
    ),
  };
}

function changeValueOf(value: unknown): ChangeValue | null {
  if (!isObject(value)) return null;
  if ("phone" in value)
    return { phone: typeof value.phone === "string" ? value.phone : null };
  return recordValueOf(value);
}

function changePayloadOf(value: unknown): ChangePayload {
  const payload = isObject(value) ? value : {};
  return {
    before: changeValueOf(payload.before),
    after: changeValueOf(payload.after) ?? { text: "", severity: null },
    ...(typeof payload.reason === "string" ? { reason: payload.reason } : {}),
    ...(typeof payload.report === "string" ? { report: payload.report } : {}),
  };
}

const sameValue = (a: ChangeValue, b: ChangeValue) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Severity describes an allergy; any other kind keeps none. */
const severityFor = (kind: string, severity: "" | Severity) =>
  kind === "allergy" && severity ? severity : null;

function stateOf(outcome: HealthChangeRow["outcome"]) {
  if (outcome === "completed") return "accepted" as const;
  if (outcome === "refused") return "declined" as const;
  if (outcome === "withdrawn") return "withdrawn" as const;
  return "open" as const;
}

const healthKinds = (context: UnitContext) =>
  descriptorsFor(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    namespace: "health_record_kind",
    today: context.today,
    includeRetired: true,
  });

/** The child's emergency contacts, in the order the office calls them. */
async function emergencyContactsOf(context: UnitContext, studentId: string) {
  const [links, relations] = await Promise.all([
    guardiansOf(context.tx, scopeFor(context, "people"), studentId),
    descriptorsFor(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      namespace: "relation",
      today: context.today,
      includeRetired: true,
    }),
  ]);
  return links
    .filter((link) => link.emergencyContact)
    .toSorted((a, b) => (a.contactPriority ?? 99) - (b.contactPriority ?? 99))
    .map((link) => {
      const relation = relations.find((row) => row.id === link.relationId);
      const phone = link.contacts.find((contact) => contact.kind === "phone");
      return {
        relationshipId: link.relationshipId,
        userId: link.userId,
        fullNameEn: link.fullNameEn,
        fullNameAr: link.fullNameAr,
        relation: relation
          ? { labelEn: relation.labelEn, labelAr: relation.labelAr }
          : null,
        phone: phone?.value ?? null,
        phoneLabel: phone?.label ?? null,
      };
    });
}

/**
 * A guardian's own link to a child they follow in the portal, and whether it
 * lets them read the medical summary; not found for any other child.
 */
async function familyLinkTo(context: UnitContext, studentId: string) {
  requireCapability(context, "children:read");
  const link = (
    await childrenOf(context.tx, scopeFor(context, "own"), context.actor.userId)
  ).find((row) => row.visible && row.studentId === studentId);
  if (!link) throw new ORPCError("NOT_FOUND");
  const permitting = await permittingLink(context.tx, {
    tenantId: context.tenantId,
    viewerId: context.actor.userId,
    studentId,
    today: context.today,
    purpose: "health",
  });
  return permitting !== null;
}

async function openChange(context: UnitContext, row: HealthChangeRow) {
  return changePayloadOf(
    await openSealed(
      context,
      changeCipher(context, row.id, row.keyVersion),
      row.ciphertext,
    ),
  );
}

/**
 * A child's medical summary as a guardian the school permits reads it:
 * allergies, conditions, medicines, diet and doctor, the emergency
 * contacts, and the changes this guardian has asked for. Notes and plans
 * the health staff keep are not part of it. Any other guardian learns only
 * that the summary is not shared with them.
 */
export const familyHealth = readProcedure
  .input(v.object({ studentId: id }))
  .handler(async ({ input, context }) => {
    if (!(await familyLinkTo(context, input.studentId)))
      return { permitted: false as const };
    const [rows, changes, kinds] = await withPurposeFor(
      context,
      {
        purpose: "health",
        subjectUserId: input.studentId,
        reason: "A guardian opened the child's medical summary",
        write: false,
        capabilities: ["children:read"],
      },
      (tx) =>
        Promise.all([
          familyHealthRecordsOf(tx, {
            tenantId: context.tenantId,
            studentId: input.studentId,
            viewerId: context.actor.userId,
            today: context.today,
            meanings: FAMILY_HEALTH_KINDS,
          }),
          familyHealthChanges(tx, {
            tenantId: context.tenantId,
            orgId: context.schoolId,
            studentId: input.studentId,
            requestedByUserId: context.actor.userId,
          }),
          healthKinds(context),
        ]),
    );
    const meaningOf = (kindId: string | null) =>
      FAMILY_HEALTH_KINDS.find(
        (kind) => kind === kinds.find((row) => row.id === kindId)?.meaning,
      ) ?? null;
    const reportOf = await reportFiles(context, [
      ...rows.map((row) => (row.reportShared ? row.fileId : null)),
      ...changes.map((row) => row.fileId),
    ]);
    const records = await Promise.all(
      rows.flatMap((row) => {
        const kind = meaningOf(row.kindId);
        if (!kind) return [];
        return [
          openSealed(
            context,
            healthCipher(context, row.id, row.keyVersion),
            row.ciphertext,
          ).then((held) => ({
            id: row.id,
            version: row.version,
            kind,
            ...recordValueOf(held),
            // The family learns a report exists, and opens it once shared.
            report: row.fileId
              ? row.reportShared
                ? {
                    shared: true as const,
                    ...reportOf(
                      row.fileId,
                      isPayload(held) ? held.report_name : undefined,
                    ),
                  }
                : { shared: false as const }
              : null,
          })),
        ];
      }),
    );
    const asked = await Promise.all(
      changes.map(async (row) => {
        const payload = await openChange(context, row);
        return {
          id: row.requestId,
          target: row.target,
          kind: meaningOf(row.kindId),
          recordId: row.recordId,
          relationshipId: row.relationshipId,
          before: payload.before,
          after: payload.after,
          reason: payload.reason ?? null,
          report: row.fileId ? reportOf(row.fileId, payload.report) : null,
          state: stateOf(row.outcome),
          askedOn: row.receivedOn,
          dueOn: row.dueOn,
        };
      }),
    );
    const contacts = await emergencyContactsOf(context, input.studentId);
    return {
      permitted: true as const,
      records,
      contacts: contacts.map((contact) => ({
        relationshipId: contact.relationshipId,
        fullNameEn: contact.fullNameEn,
        fullNameAr: contact.fullNameAr,
        relation: contact.relation,
        phone: contact.phone,
      })),
      changes: asked,
    };
  });

/**
 * A permitted guardian asks the school to add or change one entry of the
 * medical summary, or an emergency contact's phone. It joins the office's
 * register as a correction with its deadline, and the record stays as it
 * is until the health staff accept it.
 */
export const askHealthChange = writeProcedure
  .input(askHealthChangeSchema)
  .handler(async ({ input, context }) => {
    if (!(await familyLinkTo(context, input.studentId)))
      throw new ORPCError("FORBIDDEN", { message: "health.not_permitted" });
    const country =
      (await schoolProfile(context.tx, context.schoolId))?.countryCode ?? "EG";
    return withPurposeFor(
      context,
      {
        purpose: "health",
        subjectUserId: input.studentId,
        reason: "A guardian asked to change the child's medical summary",
        write: true,
        capabilities: ["children:read"],
      },
      async (tx) => {
        let before: ChangeValue | null = null;
        let after: ChangeValue;
        let kindId: string | null = null;
        let recordId: string | null = null;
        let relationshipId: string | null = null;
        const rowId = Bun.randomUUIDv7();
        const report = input.target === "record" ? input.report : undefined;
        if (input.target === "record") {
          const kind = (await healthKinds(context)).find(
            (row) => row.meaning === input.kind,
          );
          if (!kind)
            throw new ORPCError("BAD_REQUEST", { message: "health.kind" });
          kindId = kind.id;
          after = {
            text: input.text,
            severity: severityFor(input.kind, input.severity),
          };
          if (input.recordId) {
            const current = (
              await familyHealthRecordsOf(tx, {
                tenantId: context.tenantId,
                studentId: input.studentId,
                viewerId: context.actor.userId,
                today: context.today,
                meanings: [input.kind],
              })
            ).find((row) => row.id === input.recordId);
            if (!current) throw new ORPCError("NOT_FOUND");
            if (current.version !== input.expectedVersion)
              throw new ORPCError("CONFLICT", { message: "conflict.version" });
            recordId = current.id;
            before = recordValueOf(
              await openSealed(
                context,
                healthCipher(context, current.id, current.keyVersion),
                current.ciphertext,
              ),
            );
          }
        } else {
          const contact = (
            await emergencyContactsOf(context, input.studentId)
          ).find((row) => row.relationshipId === input.relationshipId);
          if (!contact) throw new ORPCError("NOT_FOUND");
          const phone = toE164(input.phone, country);
          if (!phone)
            throw new ORPCError("BAD_REQUEST", {
              message: "contact_point.phone_invalid",
            });
          relationshipId = contact.relationshipId;
          before = { phone: contact.phone };
          after = { phone };
        }
        if (before && sameValue(before, after) && !report)
          throw new ORPCError("BAD_REQUEST", {
            message: "health.change_unchanged",
          });
        if (
          report &&
          (
            await linkFiles(tx, {
              tenantId: context.tenantId,
              userId: context.actor.userId,
              ids: [report.fileId],
              purpose: "health_report",
              host: { type: "health_change", id: rowId },
            })
          ).length !== 1
        )
          throw new ORPCError("CONFLICT", { message: "files.not_linkable" });
        const request = await logFamilyRequest(context, {
          studentId: input.studentId,
          details: null,
          topic: "health",
        });
        const payload: ChangePayload = {
          before,
          after,
          ...(report ? { report: safeFilename(report.name) } : {}),
        };
        const sealed = await seal(
          context,
          (keyVersion) => changeCipher(context, rowId, keyVersion),
          payload,
        );
        const kept = await insertHealthChange(tx, {
          tenantId: context.tenantId,
          id: rowId,
          requestId: request.id,
          studentId: input.studentId,
          requestedByUserId: context.actor.userId,
          today: context.today,
          target: input.target,
          kindId,
          recordId,
          relationshipId,
          ...sealed,
          fileId: report?.fileId ?? null,
        });
        if (!kept)
          throw new ORPCError("FORBIDDEN", { message: "health.not_permitted" });
        return request;
      },
    );
  });

/**
 * The changes families asked for that the health staff answer, open ones
 * first by the day they fall due, each beside what the school holds now so
 * the two can be compared.
 */
export const healthChanges = readProcedure
  .input(healthChangesSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "health:write");
    const scope = {
      ...scopeFor(context, "people"),
      orgId: context.schoolId,
      open: input.open,
    };
    const students = await healthQueueStudents(context.tx, scope);
    const { rows, current, kinds } = await withPurposeFor(
      context,
      {
        purpose: "health",
        subjectUserId: students,
        reason: "Opened the changes families asked for",
        write: true,
      },
      async (tx) => {
        const [queue, held, labels] = await Promise.all([
          healthChangeQueue(tx, scope),
          Promise.all(
            students.map((studentId) =>
              healthRecordsOf(tx, context.tenantId, studentId),
            ),
          ),
          healthKinds(context),
        ]);
        return { rows: queue, current: held.flat(), kinds: labels };
      },
    );
    const reportOf = await reportFiles(
      context,
      rows.map((row) => row.fileId),
    );
    const contacts = new Map(
      await Promise.all(
        [
          ...new Set(
            rows
              .filter((row) => row.target === "contact")
              .map((row) => row.studentId),
          ),
        ].map(
          async (studentId) =>
            [studentId, await emergencyContactsOf(context, studentId)] as const,
        ),
      ),
    );
    const changes = await Promise.all(
      rows.map(async (row) => {
        const payload = await openChange(context, row);
        const kind = kinds.find((entry) => entry.id === row.kindId);
        const record = current.find((entry) => entry.id === row.recordId);
        const contact = contacts
          .get(row.studentId)
          ?.find((entry) => entry.relationshipId === row.relationshipId);
        const now: ChangeValue | null =
          row.target === "contact"
            ? { phone: contact?.phone ?? null }
            : record
              ? recordValueOf(
                  await openSealed(
                    context,
                    healthCipher(context, record.id, record.keyVersion),
                    record.ciphertext,
                  ),
                )
              : null;
        return {
          id: row.requestId,
          studentId: row.studentId,
          studentNameEn: row.studentNameEn,
          studentNameAr: row.studentNameAr,
          requesterNameEn: row.requesterNameEn,
          requesterNameAr: row.requesterNameAr,
          target: row.target,
          kind: kind
            ? {
                meaning: kind.meaning,
                labelEn: kind.labelEn,
                labelAr: kind.labelAr,
              }
            : null,
          contact: contact
            ? {
                fullNameEn: contact.fullNameEn,
                fullNameAr: contact.fullNameAr,
                relation: contact.relation,
              }
            : null,
          adds: row.target === "record" && row.recordId === null,
          missing: row.recordId !== null && !record,
          now,
          nowVersion: record?.version ?? null,
          asked: payload.after,
          askedBefore: payload.before,
          reason: payload.reason ?? null,
          report: row.fileId ? reportOf(row.fileId, payload.report) : null,
          state: stateOf(row.outcome),
          askedOn: row.receivedOn,
          dueOn: row.dueOn,
          decidedAt: row.closedAt,
        };
      }),
    );
    return { today: context.today, changes };
  });

const ANSWERED = {
  accepted: "Accepted from the medical summary changes.",
  declined: "Declined from the medical summary changes.",
};

/** Applies a change to its record, answering the record it is now. */
async function applyRecordChange(
  context: UnitContext,
  tx: UnitContext["tx"],
  row: HealthChangeRow,
  after: RecordValue,
  expectedVersion: number | undefined,
): Promise<string> {
  const severity = after.severity ? { severity: after.severity } : {};
  let recordId = row.recordId;
  if (!recordId) {
    if (!row.kindId) throw new Error("a record change carries its kind");
    const added = Bun.randomUUIDv7();
    recordId = added;
    const sealed = await seal(
      context,
      (keyVersion) => healthCipher(context, added, keyVersion),
      { text: after.text, ...severity },
    );
    await insertHealthRecord(tx, {
      tenantId: context.tenantId,
      id: added,
      studentId: row.studentId,
      kindId: row.kindId,
      hasAlert: false,
      recordedOn: context.today,
      ...sealed,
    });
  } else {
    const current = (
      await healthRecordsOf(tx, context.tenantId, row.studentId)
    ).find((record) => record.id === row.recordId);
    if (!current)
      throw new ORPCError("CONFLICT", { message: "health.change_stale" });
    if (current.version !== expectedVersion)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    const held = await openSealed(
      context,
      healthCipher(context, current.id, current.keyVersion),
      current.ciphertext,
    );
    const kept: HealthPayload = isPayload(held) ? held : {};
    const sealed = await seal(
      context,
      (keyVersion) => healthCipher(context, current.id, keyVersion),
      {
        ...(kept.action_plan ? { action_plan: kept.action_plan } : {}),
        ...(kept.report_name ? { report_name: kept.report_name } : {}),
        text: after.text,
        ...severity,
      },
    );
    const saved = await updateHealthRecord(tx, {
      tenantId: context.tenantId,
      id: current.id,
      studentId: row.studentId,
      expectedVersion: current.version,
      kindId: current.kindId,
      hasAlert: current.hasAlert,
      recordedOn: current.recordedOn,
      ...sealed,
    });
    if (!saved)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
  }
  await refreshMedicalAlert(tx, context.tenantId, row.studentId);
  return recordId;
}

/**
 * Makes the report a family sent with an accepted change the report of
 * the record the change applied to, answering the key of the one replaced.
 */
async function keepChangeReport(
  context: UnitContext,
  tx: UnitContext["tx"],
  input: {
    row: HealthChangeRow;
    payload: ChangePayload;
    recordId: string;
    shared: boolean;
  },
) {
  const { row } = input;
  const fileId = row.fileId;
  const record = (
    await healthRecordsOf(tx, context.tenantId, row.studentId)
  ).find((entry) => entry.id === input.recordId);
  if (!fileId || !record) return null;
  return giveReport(context, tx, {
    studentId: row.studentId,
    record,
    report: { fileId, name: input.payload.report ?? healthReportName(fileId) },
    shared: input.shared,
    place: async () => {
      await rehostFiles(tx, {
        tenantId: context.tenantId,
        from: { type: "health_change", id: row.id },
        to: { type: "health_record", id: record.id },
        ids: [fileId],
      });
      return true;
    },
  });
}

async function applyContactChange(
  context: UnitContext,
  row: HealthChangeRow,
  phone: string | null,
) {
  const contact = (await emergencyContactsOf(context, row.studentId)).find(
    (entry) => entry.relationshipId === row.relationshipId,
  );
  if (!contact || !phone)
    throw new ORPCError("CONFLICT", { message: "health.change_stale" });
  const label =
    CONTACT_LABELS.find((known) => known === contact.phoneLabel) ?? "mobile";
  await replaceContact(context.tx, {
    tenantId: context.tenantId,
    userId: contact.userId,
    kind: "phone",
    label,
    value: phone,
    normalized: phone,
  });
  await audit(context, {
    action: "contacts.update",
    objectType: "user",
    objectId: contact.userId,
    subjectUserId: contact.userId,
    change: {
      table: "core.contact_points",
      before: { phone: contact.phone },
      after: { phone },
    },
  });
}

/**
 * The health staff answer a change. Accepting applies it, in this
 * transaction, to the version of the record they compared; declining keeps
 * the reason with the change. Either closes the correction request, goes on
 * the student's history with who asked, and tells that guardian.
 */
export const decideHealthChange = writeProcedure
  .input(decideHealthChangeSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "health:write");
    const request = await requestById(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      id: input.id,
    });
    if (!request || request.topic !== "health")
      throw new ORPCError("NOT_FOUND");
    if (request.outcome)
      throw new ORPCError("CONFLICT", { message: "health.change_decided" });
    const change = await withPurposeFor(
      context,
      {
        purpose: "health",
        subjectUserId: request.subjectUserId,
        reason:
          input.decision === "accepted"
            ? "Applied a change a family asked for"
            : "Declined a change a family asked for",
        write: true,
      },
      async (tx) => {
        const row = await healthChangeOf(tx, {
          ...scopeFor(context, "people"),
          orgId: context.schoolId,
          requestId: input.id,
        });
        if (!row) throw new ORPCError("NOT_FOUND");
        const payload = await openChange(context, row);
        let gone: string | null = null;
        if (input.decision === "declined") {
          const sealed = await seal(
            context,
            (keyVersion) => changeCipher(context, row.id, keyVersion),
            { ...payload, reason: input.reason },
          );
          await resealHealthChange(tx, {
            tenantId: context.tenantId,
            id: row.id,
            ...sealed,
          });
        } else if (row.target === "record" && "text" in payload.after) {
          const recordId = await applyRecordChange(
            context,
            tx,
            row,
            payload.after,
            input.expectedVersion,
          );
          if (input.keepReport)
            gone = await keepChangeReport(context, tx, {
              row,
              payload,
              recordId,
              shared: input.shareReport,
            });
        } else if (row.target === "contact" && "phone" in payload.after)
          await applyContactChange(context, row, payload.after.phone);
        else throw new Error("a health change's payload must match its target");
        const closed = await closeRequest(tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          id: input.id,
          outcome: input.decision === "accepted" ? "completed" : "refused",
          note: ANSWERED[input.decision],
          closedByUserId: context.actor.userId,
          topic: "health",
        });
        if (!closed)
          throw new ORPCError("CONFLICT", { message: "health.change_decided" });
        return { ...row, gone };
      },
    );
    dropBytes(context, change.gone);
    await audit(context, {
      action: AUDIT_ACTIONS[input.decision],
      objectType: "records_request",
      objectId: input.id,
      subjectUserId: change.studentId,
      studentUserId: change.studentId,
      details: {
        requestedBy: change.requestedByUserId,
        target: change.target,
      },
    });
    await notify(context, [change.requestedByUserId], {
      kind: "correction",
      subject: { type: "records_request", id: input.id },
      params: {
        studentId: change.studentId,
        studentName: change.studentNameEn ?? change.studentNameAr ?? "",
        studentNameAr: change.studentNameAr ?? change.studentNameEn ?? "",
        report: input.decision,
      },
    });
    return { decision: input.decision };
  });

/**
 * A record's report opens for the health staff who reach its student, and
 * for a guardian who reads the medical summary once the school shares it.
 */
registerHostReader("health_record", async (context, recordId, file) => {
  const record = await withPurpose(context.tx, "health", (tx) =>
    healthRecordOf(tx, context.tenantId, recordId),
  );
  if (!file || !record || record.fileId !== file.id) return false;
  if (can(context, "health:read"))
    return reachesStudent(context, "people", record.studentId);
  if (!can(context, "children:read")) return false;
  return withPurpose(context.tx, "health", async (tx) =>
    (
      await familyHealthRecordsOf(tx, {
        tenantId: context.tenantId,
        studentId: record.studentId,
        viewerId: context.actor.userId,
        today: context.today,
        meanings: FAMILY_HEALTH_KINDS,
      })
    ).some(
      (row) =>
        row.id === recordId && row.fileId === file.id && row.reportShared,
    ),
  );
});

/** A report a family sent with a change opens for the health staff who answer it. */
registerHostReader("health_change", (context, changeId, file) =>
  withPurpose(context.tx, "health", async (tx) => {
    if (!file || !can(context, "health:write")) return false;
    const change = await healthChangeById(tx, {
      ...scopeFor(context, "people"),
      orgId: context.schoolId,
      id: changeId,
    });
    return change?.fileId === file.id;
  }),
);
