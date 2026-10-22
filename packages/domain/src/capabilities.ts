/**
 * What a procedure may do. A capability lets a procedure run; relationship
 * functions decide which records it reaches, so none of these grants a record.
 */
export const CAPABILITIES = [
  "access:manage",
  "school:manage",
  "years:manage",
  "years:reopen",
  "people:read",
  "people:manage",
  "people:import",
  "staff:manage",
  "guardians:manage",
  "contacts:read",
  "health:read",
  "health:write",
  "support:manage",
  "demographics:read",
  "demographics:write",
  "custody:read",
  "custody:write",
  "identifiers:read",
  "erasure:approve",
  "privacy:manage",
  "audit:read",
  "classes:read",
  "classes:manage",
  "calendar:manage",
  "calendar:author",
  "announcements:manage",
  "news:manage",
  "site:manage",
  "reports:read",
  "roster:read",
  "assignments:author",
  "assignments:read",
  "submissions:grade",
  "attendance:record",
  "attendance:read",
  "attendance:manage",
  "grades:read",
  "timetable:read",
  "timetable:manage",
  "messages:read",
  "messages:send",
  "calendar:read",
  "children:read",
  "own-work:read",
  "own-work:submit",
  "learning:author",
  "learning:read",
  "standards:manage",
  "exams:manage",
  "badges:issue",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export type Profile =
  | "staff_admin"
  | "staff"
  | "family"
  | "student"
  | "young_student";

const EVERYONE: readonly Capability[] = [
  "assignments:read",
  "messages:read",
  "messages:send",
  "calendar:read",
  "timetable:read",
];

const TEACHING: readonly Capability[] = [
  ...EVERYONE,
  "people:read",
  "contacts:read",
  "classes:read",
  "roster:read",
  "assignments:author",
  "submissions:grade",
  "attendance:record",
  "attendance:read",
  "grades:read",
  "reports:read",
  "learning:author",
  "learning:read",
  "calendar:author",
  "badges:issue",
];

const ADMINISTRATION: readonly Capability[] = CAPABILITIES.filter(
  (capability) => capability !== "erasure:approve",
);

/** Seed capabilities of the built-in access roles, keyed by `builtin_key`. */
export const BUILTIN_CAPABILITIES: Record<
  | "site_administrator"
  | "district_administrator"
  | "system_administrator"
  | "principal"
  | "teacher"
  | "aide"
  | "counselor"
  | "proctor"
  | "staff"
  | "student"
  | "family",
  readonly Capability[]
> = {
  site_administrator: ADMINISTRATION,
  district_administrator: ADMINISTRATION,
  system_administrator: CAPABILITIES,
  principal: ADMINISTRATION,
  teacher: TEACHING,
  aide: [
    ...EVERYONE,
    "people:read",
    "classes:read",
    "roster:read",
    "attendance:record",
    "attendance:read",
    "learning:read",
  ],
  counselor: [...TEACHING, "health:read", "custody:read", "support:manage"],
  proctor: [...EVERYONE, "classes:read", "roster:read", "attendance:record"],
  staff: [
    ...EVERYONE,
    "people:read",
    "contacts:read",
    "classes:read",
    "attendance:read",
  ],
  student: [
    ...EVERYONE,
    "own-work:read",
    "own-work:submit",
    "grades:read",
    "attendance:read",
    "learning:read",
  ],
  family: [
    ...EVERYONE,
    "children:read",
    "contacts:read",
    "grades:read",
    "attendance:read",
    "learning:read",
  ],
};

/**
 * The profile caps what any combination of roles can grant: a family or
 * student session never administers, whatever else the person holds.
 */
export const PROFILE_CAPS: Record<Profile, ReadonlySet<Capability>> = {
  staff_admin: new Set(CAPABILITIES),
  staff: new Set(
    CAPABILITIES.filter(
      (capability) =>
        ![
          "access:manage",
          "school:manage",
          "years:manage",
          "years:reopen",
          "erasure:approve",
        ].includes(capability),
    ),
  ),
  family: new Set(BUILTIN_CAPABILITIES.family),
  student: new Set(BUILTIN_CAPABILITIES.student),
  young_student: new Set<Capability>([
    "assignments:read",
    "own-work:read",
    "own-work:submit",
    "learning:read",
    "timetable:read",
  ]),
};

export const ACCESS_ADMIN: Capability = "access:manage";
