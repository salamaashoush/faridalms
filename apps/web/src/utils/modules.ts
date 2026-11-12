import type { ModuleId } from "@faridalms/domain/modules";

import * as m from "~/i18n/messages";

export const MODULE_LABEL: Record<ModuleId, () => string> = {
  school_years: m.moduleSchoolYears,
  grade_levels: m.moduleGradeLevels,
  homerooms: m.moduleHomerooms,
  families: m.moduleFamilies,
  coursework: m.moduleCoursework,
  peer_review: m.modulePeerReview,
  gradebook: m.moduleGradebook,
  attendance: m.moduleAttendance,
  timetable: m.moduleTimetable,
  website: m.moduleWebsite,
  custom_domains: m.moduleCustomDomains,
  admissions: m.moduleAdmissions,
  student_records: m.moduleStudentRecords,
  badges: m.moduleBadges,
  standards: m.moduleStandards,
  elearning: m.moduleElearning,
  early_years: m.moduleEarlyYears,
  coding: m.moduleCoding,
  video: m.moduleVideo,
  sso: m.moduleSso,
  sms: m.moduleSms,
};
