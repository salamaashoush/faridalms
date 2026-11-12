/**
 * The parts of the product a school is entitled to, each a module with a
 * stable id. Core is what every school has and is no module: people and
 * access, courses, classes and enrolments, communication, privacy and
 * consent, files, documents and search.
 */
export const MODULE_IDS = [
  "school_years",
  "grade_levels",
  "homerooms",
  "families",
  "coursework",
  "peer_review",
  "gradebook",
  "attendance",
  "timetable",
  "website",
  "custom_domains",
  "admissions",
  "student_records",
  "badges",
  "standards",
  "elearning",
  "early_years",
  "coding",
  "video",
  "sso",
  "sms",
] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export interface ModuleSpec {
  /** On only when one of these groups is on in full: `[["coursework"], ["elearning"]]`. */
  requires: readonly (readonly ModuleId[])[];
  /** In Basic, what a new school starts with. */
  basic: boolean;
  /** The school switches it on within its entitlement; otherwise it is on when entitled. */
  schoolSwitch: boolean;
  /** The API namespaces it owns, answered only where it is on; a nested one is `outer/inner`. */
  systems: readonly string[];
}

export const MODULES: Record<ModuleId, ModuleSpec> = {
  school_years: { requires: [], basic: true, schoolSwitch: false, systems: [] },
  grade_levels: { requires: [], basic: true, schoolSwitch: false, systems: [] },
  homerooms: { requires: [], basic: true, schoolSwitch: false, systems: [] },
  families: { requires: [], basic: true, schoolSwitch: false, systems: [] },
  coursework: {
    requires: [],
    basic: true,
    schoolSwitch: false,
    // Reading aloud is marked in quizzes and lessons alike; its record and
    // norms stand with the coursework every school has.
    systems: ["coursework", "grading", "bank", "reading"],
  },
  peer_review: {
    requires: [["coursework"]],
    basic: false,
    schoolSwitch: false,
    systems: ["peer"],
  },
  gradebook: {
    requires: [["coursework"]],
    basic: true,
    schoolSwitch: false,
    systems: ["gradebook"],
  },
  attendance: {
    requires: [],
    basic: true,
    schoolSwitch: false,
    systems: ["attendance", "absenceReports", "followUp", "frontDesk"],
  },
  timetable: {
    requires: [],
    basic: true,
    schoolSwitch: false,
    systems: ["timetable", "cover"],
  },
  website: {
    requires: [],
    basic: false,
    schoolSwitch: false,
    systems: ["site"],
  },
  custom_domains: {
    requires: [],
    basic: false,
    schoolSwitch: false,
    systems: ["hosts"],
  },
  admissions: {
    requires: [],
    basic: false,
    schoolSwitch: false,
    systems: ["admissions", "intakes", "applications", "applying", "decisions"],
  },
  student_records: {
    requires: [],
    basic: false,
    schoolSwitch: false,
    systems: ["records"],
  },
  badges: {
    requires: [],
    basic: false,
    schoolSwitch: false,
    systems: ["badges"],
  },
  standards: {
    requires: [["coursework"], ["elearning"]],
    basic: false,
    schoolSwitch: false,
    systems: ["standards"],
  },
  elearning: {
    requires: [],
    basic: false,
    schoolSwitch: true,
    systems: ["learning"],
  },
  early_years: {
    requires: [["elearning"]],
    basic: false,
    schoolSwitch: true,
    systems: [],
  },
  coding: {
    requires: [["coursework"], ["elearning"]],
    basic: false,
    schoolSwitch: false,
    systems: [],
  },
  video: { requires: [], basic: false, schoolSwitch: false, systems: [] },
  sso: { requires: [], basic: false, schoolSwitch: false, systems: [] },
  sms: { requires: [], basic: false, schoolSwitch: false, systems: [] },
};

/** The API namespaces every school answers, whatever its plan. */
export const CORE_SYSTEMS = [
  "identifiers",
  "identity",
  "people",
  "access",
  "school",
  "classes",
  "consents",
  "years",
  "files",
  "documents",
  "comments",
  // Templates hold the admission letters and message templates, pictures
  // the open pictures every editor places, and media what the school
  // keeps for all of them, so none belongs to one module.
  "templates",
  "pictures",
  "media",
  "shared",
  // The language model helps write whatever document a teacher may change,
  // lessons and briefs alike; the record's own module still decides that.
  "assistant",
  "privacy",
  "rollover",
  "messages",
  "announcements",
  "calendar",
  "notifications",
  "product",
  "home",
  "search",
  // A school's invoices, read from the operator console.
  "billing",
] as const;

export const BASIC_MODULES: readonly ModuleId[] = MODULE_IDS.filter(
  (id) => MODULES[id].basic,
);

/** Modules a school switches on itself within its entitlement; each starts off. */
export const SWITCHED_MODULES = [
  "elearning",
  "early_years",
] as const satisfies readonly ModuleId[];
export type SwitchedModule = (typeof SWITCHED_MODULES)[number];

/** The module that owns an API namespace, or null for core. */
export function moduleOfSystem(system: string): ModuleId | null {
  return MODULE_IDS.find((id) => MODULES[id].systems.includes(system)) ?? null;
}

/**
 * Which modules are on at a school: entitled, with what each requires on,
 * and switched on by the school where the school switches it.
 */
export function modulesOn(input: {
  entitled: (id: ModuleId) => boolean;
  switchedOn: (id: ModuleId) => boolean;
}): Record<ModuleId, boolean> {
  const on = {} as Record<ModuleId, boolean>;
  // Requirements name only modules earlier in the list, so one pass settles them.
  for (const id of MODULE_IDS) {
    const spec = MODULES[id];
    on[id] =
      input.entitled(id) &&
      (!spec.schoolSwitch || input.switchedOn(id)) &&
      (spec.requires.length === 0 ||
        spec.requires.some((group) => group.every((need) => on[need])));
  }
  return on;
}
