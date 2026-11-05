import * as v from "valibot";

import { BASIC_ENTITLEMENTS, entitlementsSchema, settableOf } from "./plans";

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

export type AdministratorInput = v.InferInput<typeof administratorSchema>;

const tenantEntries = {
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
};

type TenantShape = {
  kind: "school" | "school_group";
  nameEn: string | null;
  nameAr: string | null;
  schools: { nameEn: string | null; nameAr: string | null; slug: string }[];
};

const oneSchoolAlone = (spec: TenantShape) =>
  spec.kind === "school_group" || spec.schools.length === 1;
const groupNamed = (spec: TenantShape) => spec.kind === "school" || named(spec);
const distinctAddresses = (spec: TenantShape) =>
  new Set(spec.schools.map((school) => school.slug)).size ===
  spec.schools.length;

/** A standalone school's tenant takes its names from the school. */
function namedAfterSchool<T extends TenantShape>(spec: T): T {
  const [first] = spec.schools;
  return spec.kind === "school" && first
    ? { ...spec, nameEn: first.nameEn, nameAr: first.nameAr }
    : spec;
}

const ONE_SCHOOL = "A standalone school has exactly one school.";
const GROUP_NAME = "Give the group a name in English or Arabic.";
const OWN_ADDRESS = "Give each school its own address.";

/**
 * A school or group as it is set up before anyone runs it: its names and
 * addresses, where its schools are and which language they start in.
 */
export const tenantSpecSchema = v.pipe(
  v.object(tenantEntries),
  v.forward(
    v.check((spec) => oneSchoolAlone(spec), ONE_SCHOOL),
    ["schools"],
  ),
  v.forward(
    v.check((spec) => groupNamed(spec), GROUP_NAME),
    ["nameEn"],
  ),
  v.forward(
    v.check((spec) => distinctAddresses(spec), OWN_ADDRESS),
    ["schools"],
  ),
  v.transform((spec) => namedAfterSchool(spec)),
);
export type TenantSpec = v.InferOutput<typeof tenantSpecSchema>;
export type TenantSpecInput = v.InferInput<typeof tenantSpecSchema>;

/**
 * A school or group as an operator creates it: the tenant, each school's
 * first administrator and a group's own administrator, each emailed a link
 * to choose a password, and what its schools are entitled to, Basic unless
 * the operator says otherwise.
 */
export const newSchoolSchema = v.pipe(
  v.object({
    ...tenantEntries,
    /** Each school's first administrator, in the order of the schools. */
    administrators: v.array(administratorSchema),
    /** A group's administrator, who runs every school of it. */
    groupAdministrator: v.optional(v.nullable(administratorSchema), null),
    entitlements: v.optional(entitlementsSchema, () =>
      settableOf(BASIC_ENTITLEMENTS),
    ),
  }),
  v.forward(
    v.check((spec) => oneSchoolAlone(spec), ONE_SCHOOL),
    ["schools"],
  ),
  v.forward(
    v.check((spec) => groupNamed(spec), GROUP_NAME),
    ["nameEn"],
  ),
  v.forward(
    v.check((spec) => distinctAddresses(spec), OWN_ADDRESS),
    ["schools"],
  ),
  v.forward(
    v.check(
      (spec) => spec.administrators.length === spec.schools.length,
      "Give each school its first administrator.",
    ),
    ["administrators"],
  ),
  v.forward(
    v.check(
      (spec) =>
        spec.kind === "school_group" || spec.groupAdministrator === null,
      "Only a group has a group administrator.",
    ),
    ["groupAdministrator"],
  ),
  v.forward(
    v.check((spec) => {
      const emails = [
        ...spec.administrators.map((person) => person.email),
        ...(spec.groupAdministrator ? [spec.groupAdministrator.email] : []),
      ];
      return new Set(emails).size === emails.length;
    }, "Give each administrator their own email; a group administrator already runs every school."),
    ["administrators"],
  ),
  v.transform((spec) => namedAfterSchool(spec)),
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

/** How far a tenant's people may use it: the console's only lifecycle moves. */
export const TENANT_LIFECYCLES = ["active", "read_only", "suspended"] as const;

/**
 * What an operator sets a school to: full or restricted access keep the
 * tenant active in its cell, where restricted stops it buying or growing.
 */
export const SCHOOL_STANDINGS = [
  "full",
  "restricted",
  "read_only",
  "suspended",
] as const;
export type SchoolStanding = (typeof SCHOOL_STANDINGS)[number];

export const lifecycleOf = (
  standing: SchoolStanding,
): (typeof TENANT_LIFECYCLES)[number] =>
  standing === "full" || standing === "restricted" ? "active" : standing;

export const setStandingSchema = v.object({
  tenantId: id,
  standing: v.picklist(SCHOOL_STANDINGS),
  reason: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
});

export const setLifecycleSchema = v.object({
  tenantId: id,
  lifecycle: v.picklist(TENANT_LIFECYCLES),
  reason: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
});
export type SetLifecycle = v.InferOutput<typeof setLifecycleSchema>;

/** Tells a cell the directory changed what a tenant's schools may use. */
export const entitlementsChangedSchema = v.object({ tenantId: id });
export type EntitlementsChanged = v.InferOutput<
  typeof entitlementsChangedSchema
>;

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
  /** False when the cell already held the tenant and only links were sent. */
  created: boolean;
  /** Each link: the school it runs, none for the group's, where it went and the sign-in name it opens. */
  sent: { schoolId: string | null; sentTo: string; loginName: string }[];
}

export interface ReissueResult {
  sentTo: string;
  loginName: string;
  /** True when the link replaces a password the person had already chosen. */
  reset: boolean;
}
