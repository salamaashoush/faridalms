import * as v from "valibot";

import { schoolPlanSchema } from "./plans";

/** The audience of the token the operator console signs for the provisioner. */
export const PROVISION_AUDIENCE = "farida-provision";
/** How long a provisioning token is good for, in seconds. */
export const PROVISION_TOKEN_SECONDS = 60;

/** The directory's `schools_slug_check`: one DNS label. */
export const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/**
 * Labels the platform answers on itself, so no school may take one as its
 * address. The edge routes `ops`, `collab` and `api` under the portal domain
 * and `files`, `media` and `play` under the sites domain to services, never
 * to a school.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  "www",
  "api",
  "files",
  "media",
  "play",
  "collab",
  "auth",
  "admin",
  "ops",
  "connect",
  "site",
  "app",
  "mail",
  "status",
  "docs",
  "help",
  "support",
]);

export const MAX_GROUP_SCHOOLS = 20;

const id = v.pipe(v.string(), v.uuid());

// Every field takes its own output again, so the console can send what it
// validated and the provisioner validate it a second time.
const optionalText = (max: number) =>
  v.pipe(
    v.optional(v.nullable(v.string()), null),
    v.transform((value) => value?.trim() || null),
    v.nullable(
      v.pipe(v.string(), v.maxLength(max, `Keep it to ${max} characters.`)),
    ),
  );

const named = (value: { nameEn: string | null; nameAr: string | null }) =>
  value.nameEn !== null || value.nameAr !== null;

export const slugSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.regex(
    SLUG,
    "Use lowercase letters, digits and hyphens, up to 64, starting and ending with a letter or digit.",
  ),
  v.check(
    (slug) => !RESERVED_SLUGS.has(slug),
    "The platform uses this address itself.",
  ),
);

function isTimeZone(zone: string) {
  if (zone !== "UTC" && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/.test(zone))
    return false;
  try {
    return (
      new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions()
        .timeZone !== ""
    );
  } catch {
    return false;
  }
}

export const timeZoneSchema = v.pipe(
  v.string(),
  v.trim(),
  v.check(isTimeZone, "Use an IANA time zone, such as Africa/Cairo."),
);

const countryCode = v.pipe(
  v.string(),
  v.trim(),
  v.toUpperCase(),
  v.regex(/^[A-Z]{2}$/, "Use a two-letter country code, such as EG."),
);

const emailSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.maxLength(254, "Keep it to 254 characters."),
  v.email("Enter an email address."),
);

export const newSchoolSiteSchema = v.pipe(
  v.object({
    nameEn: optionalText(160),
    nameAr: optionalText(160),
    slug: slugSchema,
    timeZone: timeZoneSchema,
    countryCode,
  }),
  v.forward(
    v.check(
      (school) => named(school),
      "Give the school a name in English or Arabic.",
    ),
    ["nameEn"],
  ),
);

export const administratorSchema = v.pipe(
  v.object({
    givenNameEn: optionalText(75),
    familyNameEn: optionalText(75),
    givenNameAr: optionalText(75),
    familyNameAr: optionalText(75),
    email: emailSchema,
  }),
  v.forward(
    v.check(
      (person) =>
        [
          person.givenNameEn,
          person.familyNameEn,
          person.givenNameAr,
          person.familyNameAr,
        ].some((part) => part !== null),
      "Give the administrator a name in English or Arabic.",
    ),
    ["givenNameEn"],
  ),
);

/**
 * A school or group as an operator creates it: its names and addresses, where
 * its schools are and which language they start in, the first administrator
 * who is emailed a link to choose a password, and optionally a plan. A
 * standalone school takes its tenant's names from the school.
 */
export const newSchoolSchema = v.pipe(
  v.object({
    kind: v.picklist(["school", "school_group"]),
    nameEn: optionalText(160),
    nameAr: optionalText(160),
    cellId: v.pipe(
      v.string(),
      v.regex(/^[a-z]{2}-[0-9]{1,2}$/, "Choose a cell."),
    ),
    defaultLocale: v.picklist(["en", "ar"]),
    jurisdictions: v.pipe(
      v.array(countryCode),
      v.minLength(1, "Name at least one jurisdiction."),
      v.maxLength(10, "Name at most ten jurisdictions."),
      v.check(
        (codes) => new Set(codes).size === codes.length,
        "Name each jurisdiction once.",
      ),
    ),
    schools: v.pipe(
      v.array(newSchoolSiteSchema),
      v.minLength(1, "Add a school."),
      v.maxLength(
        MAX_GROUP_SCHOOLS,
        `A group starts with at most ${MAX_GROUP_SCHOOLS} schools.`,
      ),
    ),
    administrator: administratorSchema,
    plan: v.optional(v.nullable(schoolPlanSchema), null),
  }),
  v.forward(
    v.check(
      (spec) => spec.kind === "school_group" || spec.schools.length === 1,
      "A standalone school has exactly one school.",
    ),
    ["schools"],
  ),
  v.forward(
    v.check(
      (spec) => spec.kind === "school" || named(spec),
      "Give the group a name in English or Arabic.",
    ),
    ["nameEn"],
  ),
  v.forward(
    v.check(
      (spec) =>
        new Set(spec.schools.map((school) => school.slug)).size ===
        spec.schools.length,
      "Give each school its own address.",
    ),
    ["schools"],
  ),
  v.transform((spec) => {
    const [first] = spec.schools;
    return spec.kind === "school" && first
      ? { ...spec, nameEn: first.nameEn, nameAr: first.nameAr }
      : spec;
  }),
);
export type NewSchool = v.InferOutput<typeof newSchoolSchema>;
export type NewSchoolInput = v.InferInput<typeof newSchoolSchema>;

/** What the console asks the provisioner to create, with the ids it chose. */
export const provisionTenantSchema = v.pipe(
  v.object({
    tenantId: id,
    schoolIds: v.pipe(v.array(id), v.minLength(1)),
    spec: newSchoolSchema,
  }),
  v.check(
    (request) => request.schoolIds.length === request.spec.schools.length,
    "Every school needs one id.",
  ),
);
export type ProvisionTenant = v.InferOutput<typeof provisionTenantSchema>;

/**
 * A new link for a school's administrator: the one with this email, or the
 * school's first administrator when none is given.
 */
export const reissueInviteSchema = v.object({
  tenantId: id,
  schoolId: id,
  email: v.optional(v.nullable(emailSchema), null),
});
export type ReissueInvite = v.InferOutput<typeof reissueInviteSchema>;

export interface ProvisionResult {
  tenantId: string;
  schoolIds: string[];
  /** False when the cell already held the tenant and only a link was sent. */
  created: boolean;
  /** Where the link went and the sign-in name it opens. */
  sentTo: string;
  loginName: string;
}

export interface ReissueResult {
  sentTo: string;
  loginName: string;
  /** True when the link replaces a password the person had already chosen. */
  reset: boolean;
}
