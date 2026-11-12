import * as v from "valibot";

import type { Capability } from "./capabilities";
import type { NotificationKind } from "./notifications";
import type { OnboardingItem } from "./onboarding";
import type { SearchKind } from "./search";
import type { TemplateKind } from "./templates";

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
  "elearning",
  "standards",
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
  /** The product's words it owns, which mean something only where it is on. */
  owns?: ModuleWords;
}

/**
 * Words of the product's vocabulary a module owns. A capability it owns is
 * kept on a role while it is off and grants nothing; a notice, a kind of
 * search hit, of template or of calendar entry is not offered.
 */
export interface ModuleWords {
  capabilities?: readonly Capability[];
  notices?: readonly NotificationKind[];
  searchKinds?: readonly SearchKind[];
  templateKinds?: readonly TemplateKind[];
  calendarCategories?: readonly string[];
  /** The setup steps it measures, which a school without it never takes. */
  setupItems?: readonly OnboardingItem[];
}
export type Vocabulary = keyof ModuleWords;

export const MODULES: Record<ModuleId, ModuleSpec> = {
  school_years: {
    requires: [],
    basic: true,
    schoolSwitch: false,
    systems: ["years", "rollover"],
    owns: {
      capabilities: ["years:manage", "years:reopen"],
      notices: ["reenrolment"],
      setupItems: ["year_ready"],
    },
  },
  grade_levels: {
    requires: [],
    basic: true,
    schoolSwitch: false,
    systems: ["gradeLevels"],
  },
  homerooms: {
    requires: [],
    basic: true,
    schoolSwitch: false,
    systems: ["homerooms"],
  },
  families: {
    requires: [],
    basic: true,
    schoolSwitch: false,
    systems: ["guardians"],
    owns: {
      setupItems: ["guardians_linked", "families_signed_in"],
      capabilities: [
        "guardians:manage",
        "custody:read",
        "custody:write",
        "children:read",
      ],
    },
  },
  coursework: {
    requires: [],
    basic: true,
    schoolSwitch: false,
    // Reading aloud is marked in quizzes and lessons alike; its record and
    // norms stand with the coursework every school has.
    systems: ["coursework", "grading", "bank", "reading"],
    owns: {
      setupItems: ["first_assignment"],
      notices: ["assignment", "feedback", "grades", "reply"],
      searchKinds: ["assignments"],
      templateKinds: ["assignment"],
    },
  },
  peer_review: {
    requires: [["coursework"]],
    basic: false,
    schoolSwitch: false,
    systems: ["peer"],
    owns: { notices: ["peer_review"] },
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
    systems: ["attendance", "absenceReports", "frontDesk"],
    owns: {
      setupItems: ["first_register"],
      capabilities: [
        "attendance:record",
        "attendance:read",
        "attendance:manage",
      ],
      notices: ["absence"],
    },
  },
  timetable: {
    requires: [],
    basic: true,
    schoolSwitch: false,
    systems: ["timetable", "cover", "periods"],
    owns: {
      capabilities: ["timetable:read", "timetable:manage"],
      setupItems: ["timetable_ready"],
    },
  },
  website: {
    requires: [],
    basic: false,
    schoolSwitch: false,
    systems: ["site"],
    owns: {
      templateKinds: ["section"],
      setupItems: ["website_published"],
    },
  },
  custom_domains: {
    requires: [],
    basic: false,
    schoolSwitch: false,
    systems: ["hosts"],
    owns: { setupItems: ["custom_domain"] },
  },
  admissions: {
    requires: [],
    basic: false,
    schoolSwitch: false,
    systems: ["admissions", "intakes", "applications", "applying", "decisions"],
    owns: {
      setupItems: ["admissions_ready"],
      capabilities: [
        "admissions:read",
        "admissions:manage",
        "admissions:decide",
        "admissions:configure",
        "applications:submit",
      ],
      notices: ["enquiry", "application", "admission_event"],
      templateKinds: ["admission_letter"],
      calendarCategories: ["admissions"],
    },
  },
  student_records: {
    requires: [],
    basic: false,
    schoolSwitch: false,
    systems: ["records"],
    owns: { capabilities: ["health:read", "health:write", "support:manage"] },
  },
  badges: {
    // Badges sign in young children, whom only their grade marks as young.
    requires: [["grade_levels"]],
    basic: false,
    schoolSwitch: false,
    systems: ["badges"],
    owns: { capabilities: ["badges:issue"] },
  },
  standards: {
    requires: [["coursework"], ["elearning"]],
    basic: false,
    schoolSwitch: false,
    systems: ["standards"],
    owns: { capabilities: ["standards:manage"] },
  },
  elearning: {
    requires: [],
    basic: false,
    schoolSwitch: true,
    systems: ["learning"],
    owns: {
      capabilities: ["learning:author", "learning:read"],
      searchKinds: ["learning"],
      templateKinds: ["lesson", "unit_plan", "module"],
    },
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

/** A school's administrator asking about a module its plan does not have. */
export const askAboutModuleSchema = v.object({
  module: v.picklist(MODULE_IDS),
});

/** The API namespaces every school answers, whatever its plan. */
export const CORE_SYSTEMS = [
  "identifiers",
  "identity",
  "people",
  "access",
  "school",
  "classes",
  "consents",
  "schoolDays",
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

/**
 * API namespaces a module owns that do what it does together with modules
 * it does not require, answered only where those are on too: following up
 * absences calls those who act for a learner, say.
 */
export const LINK_SYSTEMS: Readonly<
  Record<string, { owner: ModuleId; needs: readonly ModuleId[] }>
> = {
  followUp: { owner: "attendance", needs: ["families"] },
  familyShares: { owner: "coursework", needs: ["families"] },
};

/** The module that owns an API namespace, or null for core. */
export function moduleOfSystem(system: string): ModuleId | null {
  return (
    MODULE_IDS.find((id) => MODULES[id].systems.includes(system)) ??
    LINK_SYSTEMS[system]?.owner ??
    null
  );
}

/** Every module that must be on for a namespace to answer: its owner and what it needs. */
export function modulesOfSystem(system: string): ModuleId[] {
  const owner = moduleOfSystem(system);
  return owner ? [owner, ...(LINK_SYSTEMS[system]?.needs ?? [])] : [];
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

/** The module that owns a word of a vocabulary, or null for core's. */
export function ownerOf(vocabulary: Vocabulary, word: string): ModuleId | null {
  return (
    MODULE_IDS.find((id) => {
      const words: readonly string[] | undefined =
        MODULES[id].owns?.[vocabulary];
      return words?.includes(word) ?? false;
    }) ?? null
  );
}

/** Whether a word means something at a school: core's, or its owner's on. */
export function wordOn(
  vocabulary: Vocabulary,
  word: string,
  on: Readonly<Record<ModuleId, boolean>>,
): boolean {
  const owner = ownerOf(vocabulary, word);
  return owner === null || on[owner];
}
