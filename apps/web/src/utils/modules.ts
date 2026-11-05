import type { ModuleId } from "@faridalms/domain/modules";

import * as m from "~/i18n/messages";

/**
 * The pages each module owns, by the start of their path. The navigation
 * hides what a school does not have and the app answers its pages as not
 * found, both from this one list, so a page and its link cannot disagree.
 */
const PAGES: Partial<Record<ModuleId, readonly string[]>> = {
  coursework: [
    "/teach/assignments",
    "/teach/assignment-editor",
    "/teach/grading",
    "/me/assignments",
    "/family/assignments",
    "/assignments",
  ],
  gradebook: ["/teach/gradebook", "/me/grades", "/family/grades"],
  attendance: [
    "/admin/attendance",
    "/teach/attendance",
    "/me/attendance",
    "/family/attendance",
    "/registers",
  ],
  timetable: [
    "/admin/timetable",
    "/teach/timetable",
    "/me/timetable",
    "/family/timetable",
  ],
  news: ["/news", "/news-editor"],
  website: ["/admin/site", "/admin/site-page-editor"],
  admissions: ["/admissions", "/family/applications"],
  student_records: ["/health-changes", "/family/health"],
  badges: ["/badges"],
  standards: ["/standards"],
  exams: ["/exams"],
  elearning: [
    "/teach/modules",
    "/teach/module-editor",
    "/teach/module-plan",
    "/teach/lesson-editor",
    "/teach/year-map",
    "/teach/board",
    "/teach/live",
    "/me/modules",
    "/family/modules",
    "/modules",
    "/lessons",
    "/lesson-frame",
    "/practice",
  ],
};

const OWNED = Object.entries(PAGES).flatMap(([module, prefixes]) =>
  prefixes.map((prefix) => ({ prefix, module: module as ModuleId })),
);

/** The module a page belongs to, or null for a page every school has. */
export function moduleOfPath(path: string): ModuleId | null {
  return (
    OWNED.find(({ prefix }) => path === prefix || path.startsWith(`${prefix}/`))
      ?.module ?? null
  );
}

/** Whether a school with these modules on shows the page. */
export const pageOn = (
  modules: Record<ModuleId, boolean>,
  path: string,
): boolean => {
  const module = moduleOfPath(path);
  return module === null || modules[module];
};

export const MODULE_LABEL: Record<ModuleId, () => string> = {
  coursework: m.moduleCoursework,
  peer_review: m.modulePeerReview,
  gradebook: m.moduleGradebook,
  attendance: m.moduleAttendance,
  timetable: m.moduleTimetable,
  news: m.moduleNews,
  website: m.moduleWebsite,
  custom_domains: m.moduleCustomDomains,
  admissions: m.moduleAdmissions,
  student_records: m.moduleStudentRecords,
  badges: m.moduleBadges,
  standards: m.moduleStandards,
  exams: m.moduleExams,
  elearning: m.moduleElearning,
  early_years: m.moduleEarlyYears,
  coding: m.moduleCoding,
  video: m.moduleVideo,
  integrations: m.moduleIntegrations,
  sso: m.moduleSso,
  sms: m.moduleSms,
};
