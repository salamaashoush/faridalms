import * as v from "valibot";

import { CAPABILITIES } from "./capabilities";
import { FEATURES } from "./features";
import { loginNameSchema } from "./first-sign-in";

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

/**
 * How long a student who has left stays a student to the app: to the end of
 * the school year, so the family still reads the last reports, or no longer
 * than the last day.
 */
export const LEAVER_ACCESS = ["year_end", "last_day"] as const;
export type LeaverAccess = (typeof LEAVER_ACCESS)[number];

export const recordLeavingSchema = v.object({
  studentId: id,
  lastDay: isoDate,
  exitTypeId: id,
  destination: optionalText(160),
  access: v.picklist(LEAVER_ACCESS),
});
export type RecordLeavingInput = v.InferInput<typeof recordLeavingSchema>;

export const cancelLeavingSchema = v.object({ studentId: id });

export const saveArrivalSchema = v.object({
  studentId: id,
  placementId: id,
  entryTypeId: v.union([v.literal(""), id]),
  previousSchool: optionalText(160),
});
export type SaveArrivalInput = v.InferInput<typeof saveArrivalSchema>;

/**
 * The day a leaver's sign-in, and their family's view of them, close. The
 * school year they left in is theirs to the day the next one begins, since
 * results and reports come out after lessons end; a school with no later
 * year set up gives the year's own end.
 */
export function leaverAccessEnd(input: {
  years: readonly { startsOn: string }[];
  year: { endsBefore: string };
  /** The day after the student's last. */
  left: string;
  access: LeaverAccess;
}): string {
  if (input.access === "last_day") return input.left;
  const next = input.years
    .map((row) => row.startsOn)
    .filter((starts) => starts >= input.year.endsBefore)
    .toSorted()[0];
  return next ?? input.year.endsBefore;
}

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

export const HEALTH_SEVERITIES = ["mild", "moderate", "severe"] as const;

export const saveHealthRecordSchema = v.object({
  studentId: id,
  id: v.optional(id),
  expectedVersion: v.optional(version),
  kindId: id,
  hasAlert: v.boolean(),
  recordedOn: v.optional(v.union([v.literal(""), isoDate]), ""),
  text: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2000)),
  severity: v.optional(
    v.union([v.literal(""), v.picklist(HEALTH_SEVERITIES)]),
    "",
  ),
  actionPlan: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(2000)), ""),
});

export const removeHealthRecordSchema = v.object({
  studentId: id,
  id,
  expectedVersion: version,
});

const countryCode = v.pipe(v.string(), v.regex(/^[A-Z]{2}$/));

export const saveDemographicsSchema = v.object({
  userId: id,
  expectedVersion: v.nullable(version),
  birthCountryCode: v.optional(v.union([v.literal(""), countryCode]), ""),
  birthCity: optionalText(100),
  nationalityCodes: v.pipe(v.array(countryCode), v.maxLength(4)),
  religionId: v.optional(v.union([v.literal(""), id]), ""),
  homeLanguages: v.pipe(
    v.array(v.pipe(v.string(), v.regex(/^[a-z]{2,3}$/))),
    v.maxLength(6),
  ),
});

export const postalAddressSchema = v.object({
  lines: v.pipe(
    v.array(v.pipe(v.string(), v.trim(), v.maxLength(120))),
    v.maxLength(3),
  ),
  city: optionalText(80),
  region: optionalText(80),
  postalCode: optionalText(20),
  country: v.optional(v.union([v.literal(""), countryCode]), ""),
});
export type PostalAddressInput = v.InferOutput<typeof postalAddressSchema>;

/** One line for lists and search, in the order an envelope reads. */
export function addressLine(address: {
  lines: readonly string[];
  city: string | null;
  region: string | null;
  postalCode: string | null;
}) {
  return [...address.lines, address.city, address.region, address.postalCode]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(", ");
}

export const saveContactsSchema = v.object({
  userId: id,
  phone: v.optional(phone, ""),
  email: v.optional(v.union([v.literal(""), v.pipe(email, v.email())]), ""),
  address: postalAddressSchema,
});
export type SaveContactsInput = v.InferInput<typeof saveContactsSchema>;

export const saveCustodySchema = v.object({
  studentId: id,
  relationshipId: id,
  expectedVersion: version,
  contactRestrictions: optionalText(250),
  educationalRights: v.picklist(["full", "restricted", "none"]),
  communicationIsolated: v.boolean(),
  pickup: v.nullable(v.picklist(["allowed", "not_allowed", "ask_office"])),
});

export const personSearchSchema = v.object({
  q: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(100)),
});

export const setFeatureSchema = v.object({
  feature: v.picklist(FEATURES),
  enabled: v.boolean(),
});

export const saveSignInSchema = v.object({
  userId: id,
  loginName: loginNameSchema,
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

/** The digits a school's Arabic interface writes numbers in. */
export const DIGITS = ["latn", "arab"] as const;
export type Digits = (typeof DIGITS)[number];

/** How a school sets mathematics within Arabic text. */
export const ARABIC_MATH = ["ltr", "rtl"] as const;
export type ArabicMath = (typeof ARABIC_MATH)[number];

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
  secondaryCalendar: v.optional(
    v.picklist(["", "islamic-umalqura", "islamic-civil"]),
    "",
  ),
  /** How the Arabic interface writes digits: Western 0-9, or Arabic-Indic ٠-٩. */
  digits: v.optional(v.picklist(DIGITS), "latn"),
  /** Mathematics within Arabic text: left to right, or in Arabic notation. */
  arabicMath: v.optional(v.picklist(ARABIC_MATH), "ltr"),
  phone: optionalText(40),
  email: optionalText(254),
  websiteUrl: optionalText(2048),
  /** The school's own logo, printed on its paper: empty for none, left out to keep it. */
  logoFileId: v.optional(v.union([v.literal(""), id])),
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

export const accessChangesSchema = v.object({
  page: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10000)),
    1,
  ),
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

/** A person's photo, or none to take it away. */
export const setPhotoSchema = v.object({
  personId: id,
  fileId: v.nullable(id),
});
