import * as v from "valibot";

import { CAPABILITIES } from "./capabilities";

const id = v.pipe(v.string(), v.uuid());
const version = v.pipe(v.number(), v.integer(), v.minValue(1));
const isoDate = v.pipe(v.string(), v.isoDate());

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

/** A person's name in one script, as its parts. */
export const namePartsSchema = v.object({
  given: optionalText(75),
  middle: optionalText(150),
  family: optionalText(75),
});
export type NameParts = v.InferOutput<typeof namePartsSchema>;

export function fullName(parts: {
  given: string | null;
  middle: string | null;
  family: string | null;
}): string | null {
  const joined = [parts.given, parts.middle, parts.family]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .trim();
  return joined === "" ? null : joined;
}

export const personNamesSchema = v.pipe(
  v.object({ ar: namePartsSchema, en: namePartsSchema }),
  v.check(
    (names) => fullName(names.ar) !== null || fullName(names.en) !== null,
    "validation.name_required",
  ),
);
export type PersonNames = v.InferOutput<typeof personNamesSchema>;
export type PersonNamesInput = v.InferInput<typeof personNamesSchema>;

export const STUDENT_STATUSES = [
  "enrolled",
  "pre_enrolled",
  "left",
  "graduated",
  "unplaced",
] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export const studentDirectorySchema = v.object({
  year: v.optional(v.union([v.literal(""), id]), ""),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
  grade: v.optional(v.array(id), []),
  status: v.optional(v.array(v.picklist(STUDENT_STATUSES)), []),
  missing: v.optional(v.array(v.picklist(["guardian", "account"])), []),
  sort: v.optional(v.picklist(["name", "reference", "grade"]), "name"),
  dir: v.optional(v.picklist(["asc", "desc"]), "asc"),
  page: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10000)),
    1,
  ),
  pageSize: v.optional(v.picklist([25, 50]), 25),
});
export type StudentDirectoryQuery = v.InferOutput<
  typeof studentDirectorySchema
>;

export const RELATIONSHIP_FLAGS = [
  "legalGuardian",
  "portalAccess",
  "receivesNotifications",
  "primaryContact",
  "emergencyContact",
  "livesWith",
] as const;

export const relationshipFlagsSchema = v.object({
  relationId: id,
  legalGuardian: v.nullable(v.boolean()),
  portalAccess: v.boolean(),
  receivesNotifications: v.boolean(),
  primaryContact: v.boolean(),
  emergencyContact: v.boolean(),
  livesWith: v.nullable(v.boolean()),
  pickup: v.nullable(v.picklist(["allowed", "not_allowed", "ask_office"])),
});
export type RelationshipFlags = v.InferOutput<typeof relationshipFlagsSchema>;

const phone = v.pipe(v.string(), v.trim(), v.maxLength(40));
const email = v.pipe(v.string(), v.trim(), v.toLowerCase(), v.maxLength(254));

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

export const saveStudentSchema = v.object({
  id: v.optional(id),
  expectedVersion: v.optional(version),
  names: personNamesSchema,
  preferredName: optionalText(75),
  reference: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.maxLength(24),
    v.regex(/^[A-Za-z0-9/_-]+$/, "validation.reference"),
  ),
  birthDate: v.optional(v.union([v.literal(""), isoDate]), ""),
  sexId: v.optional(v.union([v.literal(""), id]), ""),
  /** The grade for the working year; empty leaves the student unplaced. */
  gradeId: v.optional(v.union([v.literal(""), id]), ""),
  guardians: v.optional(
    v.pipe(v.array(guardianLinkSchema), v.maxLength(6)),
    [],
  ),
});
export type SaveStudentInput = v.InferInput<typeof saveStudentSchema>;

export const studentMatchesSchema = v.object({
  names: personNamesSchema,
  birthDate: isoDate,
  exceptId: v.optional(id),
});

export const guardianLookupSchema = v.object({
  phone: v.optional(phone, ""),
  email: v.optional(email, ""),
});

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

export const staffDirectorySchema = v.object({
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
  role: v.optional(v.array(v.string()), []),
  sort: v.optional(v.picklist(["name", "role", "signedIn"]), "name"),
  dir: v.optional(v.picklist(["asc", "desc"]), "asc"),
  page: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10000)),
    1,
  ),
  pageSize: v.optional(v.picklist([25, 50]), 25),
});
export type StaffDirectoryQuery = v.InferOutput<typeof staffDirectorySchema>;

export const STAFF_ROLE_CHOICES = [
  "teacher",
  "aide",
  "counselor",
  "principal",
  "site_administrator",
  "staff",
] as const;

export const saveStaffSchema = v.object({
  id: v.optional(id),
  expectedVersion: v.optional(version),
  existingUserId: v.optional(id),
  names: personNamesSchema,
  email: v.pipe(email, v.email()),
  phone: v.optional(phone, ""),
  roles: v.pipe(
    v.array(v.picklist(STAFF_ROLE_CHOICES)),
    v.minLength(1, "validation.role_required"),
  ),
  positionId: v.optional(v.union([v.literal(""), id]), ""),
  titleEn: optionalText(100),
  titleAr: optionalText(100),
});
export type SaveStaffInput = v.InferInput<typeof saveStaffSchema>;

export const saveSignInSchema = v.object({
  userId: id,
  loginName: v.pipe(email, v.email()),
  // Empty keeps the current password; a sign-in being created needs one.
  password: v.union([
    v.literal(""),
    v.pipe(v.string(), v.minLength(15), v.maxLength(256)),
  ]),
});
export type SaveSignInInput = v.InferInput<typeof saveSignInSchema>;

export const accountStateSchema = v.object({
  userId: id,
  state: v.picklist(["active", "disabled"]),
  reason: optionalText(500),
});

export const saveSchoolSchema = v.object({
  expectedVersion: version,
  nameEn: optionalText(160),
  nameAr: optionalText(160),
  identifier: optionalText(64),
  timeZone: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  defaultLocale: v.picklist(["ar", "en"]),
  weekStart: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(7)),
  weekendDays: v.pipe(
    v.array(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(7))),
    v.maxLength(3),
  ),
  phone: optionalText(40),
  email: optionalText(254),
  websiteUrl: optionalText(2048),
});

export const saveAccessRoleSchema = v.object({
  id: v.optional(id),
  expectedVersion: v.optional(version),
  nameEn: optionalText(80),
  nameAr: optionalText(80),
  descriptionEn: optionalText(500),
  descriptionAr: optionalText(500),
  capabilities: v.pipe(
    v.array(v.picklist(CAPABILITIES)),
    v.maxLength(CAPABILITIES.length),
  ),
});

export const assignAccessRoleSchema = v.object({
  userId: id,
  accessRoleId: id,
  replacesBuiltin: v.optional(v.boolean(), false),
  startsOn: v.optional(isoDate),
  endsOn: v.optional(v.union([v.literal(""), isoDate]), ""),
  reason: optionalText(500),
});

export const endAccessAssignmentSchema = v.object({
  assignmentId: id,
  expectedVersion: version,
});

/** Status on the student list, from the student's placements (never from a tombstone). */
export function studentStatus(
  placements: readonly {
    validFrom: string;
    validTo: string;
    exitMeaning: string | null;
  }[],
  today: string,
): StudentStatus {
  if (placements.length === 0) return "unplaced";
  if (placements.some((row) => row.validFrom <= today && today < row.validTo))
    return "enrolled";
  const latest = placements.toSorted((a, b) =>
    b.validTo.localeCompare(a.validTo),
  )[0];
  if (latest && latest.validFrom > today) return "pre_enrolled";
  if (latest?.exitMeaning === "graduated") return "graduated";
  if (latest?.exitMeaning) return "left";
  // A year that ended without an exit is a student who continues.
  return "enrolled";
}
