import type { Capability } from "@faridalms/domain/capabilities";

import { CAPABILITIES } from "@faridalms/domain/capabilities";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";

import { roleLabel } from "./format";

export const CAPABILITY_LABEL: Record<Capability, () => string> = {
  "access:manage": m.capAccessManage,
  "school:manage": m.capSchoolManage,
  "years:manage": m.capYearsManage,
  "years:reopen": m.capYearsReopen,
  "people:read": m.capPeopleRead,
  "people:manage": m.capPeopleManage,
  "people:import": m.capPeopleImport,
  "staff:manage": m.capStaffManage,
  "guardians:manage": m.capGuardiansManage,
  "contacts:read": m.capContactsRead,
  "health:read": m.capHealthRead,
  "health:write": m.capHealthWrite,
  "demographics:read": m.capDemographicsRead,
  "demographics:write": m.capDemographicsWrite,
  "custody:read": m.capCustodyRead,
  "custody:write": m.capCustodyWrite,
  "identifiers:read": m.capIdentifiersRead,
  "erasure:approve": m.capErasureApprove,
  "audit:read": m.capAuditRead,
  "classes:read": m.capClassesRead,
  "classes:manage": m.capClassesManage,
  "calendar:manage": m.capCalendarManage,
  "announcements:manage": m.capAnnouncementsManage,
  "newsletters:manage": m.capNewslettersManage,
  "site:manage": m.capSiteManage,
  "reports:read": m.capReportsRead,
  "roster:read": m.capRosterRead,
  "assignments:author": m.capAssignmentsAuthor,
  "assignments:read": m.capAssignmentsRead,
  "submissions:grade": m.capSubmissionsGrade,
  "attendance:record": m.capAttendanceRecord,
  "attendance:read": m.capAttendanceRead,
  "grades:read": m.capGradesRead,
  "timetable:read": m.capTimetableRead,
  "timetable:manage": m.capTimetableManage,
  "messages:read": m.capMessagesRead,
  "messages:send": m.capMessagesSend,
  "calendar:read": m.capCalendarRead,
  "children:read": m.capChildrenRead,
  "own-work:read": m.capOwnWorkRead,
  "own-work:submit": m.capOwnWorkSubmit,
  "learning:author": m.capLearningAuthor,
  "learning:read": m.capLearningRead,
};

type Area = "school" | "records" | "teaching" | "everyone";

const AREA_OF: Record<Capability, Area> = {
  "access:manage": "school",
  "school:manage": "school",
  "years:manage": "school",
  "years:reopen": "school",
  "people:read": "records",
  "people:manage": "records",
  "people:import": "records",
  "staff:manage": "records",
  "guardians:manage": "records",
  "contacts:read": "records",
  "health:read": "records",
  "health:write": "records",
  "demographics:read": "records",
  "demographics:write": "records",
  "custody:read": "records",
  "custody:write": "records",
  "identifiers:read": "records",
  "erasure:approve": "school",
  "audit:read": "school",
  "classes:read": "teaching",
  "classes:manage": "school",
  "calendar:manage": "school",
  "announcements:manage": "school",
  "newsletters:manage": "school",
  "site:manage": "school",
  "reports:read": "teaching",
  "roster:read": "teaching",
  "assignments:author": "teaching",
  "assignments:read": "everyone",
  "submissions:grade": "teaching",
  "attendance:record": "teaching",
  "attendance:read": "teaching",
  "grades:read": "teaching",
  "timetable:read": "everyone",
  "timetable:manage": "school",
  "messages:read": "everyone",
  "messages:send": "everyone",
  "calendar:read": "everyone",
  "children:read": "everyone",
  "own-work:read": "everyone",
  "own-work:submit": "everyone",
  "learning:author": "teaching",
  "learning:read": "everyone",
};

const AREA_LABEL: Record<Area, () => string> = {
  school: m.capAreaSchool,
  records: m.capAreaRecords,
  teaching: m.capAreaTeaching,
  everyone: m.capAreaEveryone,
};

export const CAPABILITY_AREAS = (
  ["school", "records", "teaching", "everyone"] as const
).map((area) => ({
  area,
  label: AREA_LABEL[area],
  capabilities: CAPABILITIES.filter(
    (capability) => AREA_OF[capability] === area,
  ),
}));

/** Capabilities that reach special-category data or who holds access. */
export const SENSITIVE_CAPABILITIES: ReadonlySet<Capability> = new Set([
  "access:manage",
  "people:manage",
  "health:read",
  "health:write",
  "demographics:read",
  "demographics:write",
  "custody:read",
  "custody:write",
  "identifiers:read",
  "erasure:approve",
  "years:reopen",
  "audit:read",
]);

export function accessRoleName(role: {
  builtinKey: string | null;
  nameEn: string | null;
  nameAr: string | null;
}) {
  const named = inLocale(role.nameEn, role.nameAr);
  if (named) return named;
  return role.builtinKey === "family"
    ? m.naturalRoleFamily()
    : roleLabel(role.builtinKey ?? "");
}
