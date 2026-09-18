import type { Permission, Role } from "@faridalms/domain/identity";

import * as m from "~/i18n/messages";

export type Stage = "early_years" | "primary" | "middle";

export const STAGE_LABEL: Record<Stage, () => string> = {
  early_years: m.adminStageEarlyYears,
  primary: m.adminStagePrimary,
  middle: m.adminStageMiddle,
};

export const ROLE_LABEL: Record<Role, () => string> = {
  admin: m.roleAdmin,
  teacher: m.roleTeacher,
  parent: m.roleParent,
  student: m.roleStudent,
};

export const PERMISSION_LABEL: Record<Permission, () => string> = {
  "access:manage": m.accessManagePermission,
  "school:manage": m.adminPermSchoolManage,
  "site:manage": m.adminPermSiteManage,
  "users:read": m.adminPermUsersRead,
  "users:manage": m.adminPermUsersManage,
  "classes:read": m.adminPermClassesRead,
  "classes:manage": m.adminPermClassesManage,
  "calendar:manage": m.adminPermCalendarManage,
  "announcements:manage": m.adminPermAnnouncementsManage,
  "reports:read": m.adminPermReportsRead,
  "roster:read": m.adminPermRosterRead,
  "assignments:author": m.adminPermAssignmentsAuthor,
  "assignments:read": m.navAssignments,
  "submissions:grade": m.adminPermSubmissionsGrade,
  "attendance:record": m.adminPermAttendanceRecord,
  "student-profile:read": m.accessStudentProfile,
  "student-contacts:read": m.accessStudentContacts,
  "student-medical:read": m.accessStudentMedical,
  "children:read": m.adminPermChildrenRead,
  "own-work:read": m.adminPermOwnWorkRead,
  "own-work:submit": m.adminPermOwnWorkSubmit,
  "grades:read": m.adminPermGradesRead,
  "attendance:read": m.adminPermAttendanceRead,
  "timetable:read": m.adminPermTimetableRead,
  "messages:read": m.adminPermMessagesRead,
  "messages:send": m.adminPermMessagesSend,
  "newsletters:read": m.adminPermNewslettersRead,
  "calendar:read": m.adminPermCalendarRead,
};
