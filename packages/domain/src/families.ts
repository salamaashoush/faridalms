import * as v from "valibot";

import { healthReportSchema, personNamesSchema } from "./people";

const id = v.pipe(v.string(), v.uuid());
const version = v.pipe(v.number(), v.integer(), v.minValue(1));
const phone = v.pipe(v.string(), v.trim(), v.maxLength(40));
const email = v.pipe(v.string(), v.trim(), v.toLowerCase(), v.maxLength(254));
const optionalText = (max: number) =>
  v.optional(
    v.pipe(
      v.string(),
      v.trim(),
      v.maxLength(max),
      v.transform((value) => (value === "" ? null : value)),
    ),
    "",
  );

export const RESIDENCES = ["primary", "secondary", "none"] as const;
export type Residence = (typeof RESIDENCES)[number];

export const relationshipFlagsSchema = v.object({
  relationId: id,
  legalGuardian: v.nullable(v.boolean()),
  portalAccess: v.boolean(),
  receivesNotifications: v.boolean(),
  primaryContact: v.boolean(),
  emergencyContact: v.boolean(),
  residence: v.nullable(v.picklist(RESIDENCES)),
  pickup: v.nullable(v.picklist(["allowed", "not_allowed", "ask_office"])),
});
export type RelationshipFlags = v.InferOutput<typeof relationshipFlagsSchema>;

export const newGuardianSchema = v.object({
  names: personNamesSchema,
  phone: v.optional(phone, ""),
  email: v.optional(v.union([v.literal(""), v.pipe(email, v.email())]), ""),
});

export const guardianLinkSchema = v.object({
  existingUserId: v.optional(id),
  person: v.optional(newGuardianSchema),
  flags: relationshipFlagsSchema,
});
export type GuardianLinkInput = v.InferInput<typeof guardianLinkSchema>;

export const saveRelationshipSchema = v.object({
  studentId: id,
  relationshipId: v.optional(id),
  expectedVersion: v.optional(version),
  existingUserId: v.optional(id),
  person: v.optional(newGuardianSchema),
  flags: relationshipFlagsSchema,
});

export const endRelationshipSchema = v.object({
  relationshipId: id,
  expectedVersion: version,
});

export const saveCustodySchema = v.object({
  studentId: id,
  relationshipId: id,
  expectedVersion: version,
  contactRestrictions: optionalText(250),
  educationalRights: v.picklist(["full", "restricted", "none"]),
  communicationIsolated: v.boolean(),
  pickup: v.nullable(v.picklist(["allowed", "not_allowed", "ask_office"])),
});

export const attachCourtOrderSchema = v.object({
  studentId: id,
  relationshipId: id,
  order: v.object(healthReportSchema.entries, "validation.report_required"),
});
export type AttachCourtOrderInput = v.InferInput<typeof attachCourtOrderSchema>;

export const removeCourtOrderSchema = v.object({
  studentId: id,
  relationshipId: id,
});

/** The guardians linked when a student is first saved, the student form's part under `families`. */
export const familyPartSchema = v.pipe(
  v.array(guardianLinkSchema),
  v.maxLength(6),
);

/** The children a guardian is linked to, for their record. */
export const childrenOfSchema = v.object({ userId: id });
