import type { Permission, Role } from "~/data/identity";

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
  "school:manage": m.adminPermSchoolManage,
  "users:read": m.adminPermUsersRead,
  "users:manage": m.adminPermUsersManage,
  "classes:read": m.adminPermClassesRead,
  "classes:manage": m.adminPermClassesManage,
  "calendar:manage": m.adminPermCalendarManage,
  "announcements:manage": m.adminPermAnnouncementsManage,
  "reports:read": m.adminPermReportsRead,
  "roster:read": m.adminPermRosterRead,
  "assignments:author": m.adminPermAssignmentsAuthor,
  "submissions:grade": m.adminPermSubmissionsGrade,
  "attendance:record": m.adminPermAttendanceRecord,
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
