import * as v from "valibot";

import { CAPABILITIES } from "./capabilities";
import { viewsSchema } from "./classes";
import { loginNameSchema } from "./first-sign-in";
import { SWITCHED_MODULES } from "./modules";
import { pageField, pageSizeField } from "./paging";

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
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
  status: v.optional(v.array(v.picklist(STUDENT_STATUSES)), []),
  missing: v.optional(v.array(v.picklist(["account"])), []),
  /** By name, by reference, or by a module's column under its key. */
  sort: v.optional(v.pipe(v.string(), v.regex(/^[a-z]{1,20}$/)), "name"),
  dir: v.optional(v.picklist(["asc", "desc"]), "asc"),
  page: pageField,
  pageSize: pageSizeField,
});
export const studentDirectoryInputSchema = v.object({
  ...studentDirectorySchema.entries,
  views: viewsSchema,
});

export type StudentDirectoryQuery = v.InferOutput<
  typeof studentDirectorySchema
>;

const phone = v.pipe(v.string(), v.trim(), v.maxLength(40));
const email = v.pipe(v.string(), v.trim(), v.toLowerCase(), v.maxLength(254));

/** A phone or email to find who already holds it. */
export const contactLookupSchema = v.object({
  phone: v.optional(phone, ""),
  email: v.optional(email, ""),
});

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
  /** What modules keep about the student, each read by its own schema. */
  parts: v.optional(v.record(v.string(), v.unknown()), {}),
});
export type SaveStudentInput = v.InferInput<typeof saveStudentSchema>;

export const recordLeavingSchema = v.pipe(
  v.object({
    studentId: id,
    lastDay: isoDate,
    /**
     * The last day the student and their family still read the record;
     * empty when that ends with the last day at school.
     */
    accessUntil: v.optional(v.union([v.literal(""), isoDate]), ""),
    /** What modules record of the departure, each read by its own schema. */
    parts: v.optional(v.record(v.string(), v.unknown()), {}),
  }),
  v.forward(
    v.check(
      (value) => value.accessUntil === "" || value.accessUntil >= value.lastDay,
      "validation.ends_before_start",
    ),
    ["accessUntil"],
  ),
);
export type RecordLeavingInput = v.InferInput<typeof recordLeavingSchema>;

export const cancelLeavingSchema = v.object({ studentId: id });

export const studentMatchesSchema = v.object({
  names: personNamesSchema,
  birthDate: isoDate,
  exceptId: v.optional(id),
});

export const staffDirectorySchema = v.object({
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100)), ""),
  role: v.optional(v.array(v.string()), []),
  sort: v.optional(v.picklist(["name", "role", "signedIn"]), "name"),
  dir: v.optional(v.picklist(["asc", "desc"]), "asc"),
  page: pageField,
  pageSize: pageSizeField,
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

const reportName = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1),
  v.maxLength(255),
);

/**
 * A medical report the family sends, or the health staff keep, with the
 * name it was uploaded under; the file itself is stored under a generic one.
 */
export const healthReportSchema = v.object({ fileId: id, name: reportName });
export type HealthReportInput = v.InferInput<typeof healthReportSchema>;

/**
 * The health staff give a record its report, replacing any it held, and
 * say whether a family that reads the summary may open it.
 */
export const attachHealthReportSchema = v.object({
  studentId: id,
  recordId: id,
  expectedVersion: version,
  report: v.object(healthReportSchema.entries, "validation.report_required"),
  shared: v.boolean(),
});
export type AttachHealthReportInput = v.InferInput<
  typeof attachHealthReportSchema
>;

export const shareHealthReportSchema = v.object({
  studentId: id,
  recordId: id,
  expectedVersion: version,
  shared: v.boolean(),
});

export const removeHealthReportSchema = v.object({
  studentId: id,
  recordId: id,
  expectedVersion: version,
});

/**
 * The kinds of health record the medical summary holds, which a learner,
 * or someone permitted to act for them, reads and may ask the school to
 * change, by their meaning. Everything else the school records stays with
 * its health staff.
 */
export const SUMMARY_KINDS = [
  "allergy",
  "chronic_condition",
  "medication",
  "dietary_requirement",
  "doctor",
] as const;
export type SummaryKind = (typeof SUMMARY_KINDS)[number];

/**
 * A proposed change to the medical summary: a record of one of its kinds
 * to add, or to change from the version the asker read, or a new phone for
 * one of the learner's emergency contacts.
 */
export const askHealthChangeSchema = v.variant("target", [
  v.object({
    target: v.literal("record"),
    studentId: id,
    kind: v.picklist(SUMMARY_KINDS),
    recordId: v.optional(id),
    expectedVersion: v.optional(version),
    text: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(2000)),
    severity: v.optional(
      v.union([v.literal(""), v.picklist(HEALTH_SEVERITIES)]),
      "",
    ),
    /** A doctor's letter or the like, for the office to read with the change. */
    report: v.optional(healthReportSchema),
  }),
  v.object({
    target: v.literal("contact"),
    studentId: id,
    contactId: id,
    phone: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40)),
  }),
]);
export type AskHealthChangeInput = v.InferInput<typeof askHealthChangeSchema>;

export const healthChangesSchema = v.object({
  open: v.optional(v.boolean(), true),
});

/**
 * The office's answer to a change: accepting applies it to the version of
 * the record the office compared, and may make the report the asker sent
 * the record's own; declining says why.
 */
export const decideHealthChangeSchema = v.variant("decision", [
  v.object({
    id,
    decision: v.literal("accepted"),
    expectedVersion: v.optional(version),
    keepReport: v.optional(v.boolean(), false),
    shareReport: v.optional(v.boolean(), false),
  }),
  v.object({
    id,
    decision: v.literal("declined"),
    reason: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(1000)),
  }),
]);
export type DecideHealthChangeInput = v.InferInput<
  typeof decideHealthChangeSchema
>;

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

export const CONTACT_LABELS = [
  "mobile",
  "home",
  "work",
  "personal",
  "emergency",
  "other",
] as const;
export type ContactLabel = (typeof CONTACT_LABELS)[number];

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

/**
 * What the contacts sheet shows of a person: their first phone and email
 * and their address, as the rows hold them. A save names what it showed,
 * since those rows are replaced rather than versioned.
 */
export function shownContacts(
  contacts: readonly { kind: string; value: string }[],
) {
  const first = (kind: string) =>
    contacts.find((contact) => contact.kind === kind)?.value ?? "";
  return {
    phone: first("phone"),
    email: first("email"),
    address: first("postal"),
  };
}

const shownContactsSchema = v.object({
  phone: v.pipe(v.string(), v.maxLength(400)),
  email: v.pipe(v.string(), v.maxLength(400)),
  address: v.pipe(v.string(), v.maxLength(400)),
});

export const saveContactsSchema = v.object({
  userId: id,
  /** What the sheet showed, refused as stale if the rows no longer hold it. */
  expected: shownContactsSchema,
  phone: v.optional(phone, ""),
  email: v.optional(v.union([v.literal(""), v.pipe(email, v.email())]), ""),
  address: postalAddressSchema,
});
export type SaveContactsInput = v.InferInput<typeof saveContactsSchema>;

export const personSearchSchema = v.object({
  q: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(100)),
});

export const setFeatureSchema = v.object({
  feature: v.picklist(SWITCHED_MODULES),
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
  /**
   * The age from which learners sign, ask and report for themselves, by
   * their date of birth on the school's day; left out to keep it.
   */
  learnersDecideFrom: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(25)),
  ),
  /**
   * The school states that every learner it teaches is an adult, so each
   * decides for themself whatever their birth date; left out to keep it.
   */
  learnersAreAdults: v.optional(v.boolean()),
  phone: optionalText(40),
  email: optionalText(254),
  /**
   * The school's logo, on its paper, its website and its sign-in pages:
   * empty for none, left out to keep it.
   */
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
  page: pageField,
});

export const endAccessAssignmentSchema = v.object({
  assignmentId: id,
  expectedVersion: version,
});

/** Status on the student list, from the student's placements (never from a tombstone). */
/**
 * Where a student stands at the school by their student roles: enrolled
 * while one holds, enrolling before one begins, left once they have ended.
 */
export function roleStatus(
  roles: readonly { from: string; to: string | null }[],
  today: string,
): StudentStatus | null {
  if (roles.length === 0) return null;
  if (
    roles.some(
      (row) => row.from <= today && (row.to === null || today < row.to),
    )
  )
    return "enrolled";
  return roles.some((row) => row.from > today) ? "pre_enrolled" : "left";
}

/** A person's photo, or none to take it away. */
export const setPhotoSchema = v.object({
  personId: id,
  fileId: v.nullable(id),
});
