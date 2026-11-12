import { SettingsPage } from "@faridalms/ui/system/settings-section";
import { UserCheck } from "lucide-react";

import type { ModuleFillings } from "~/utils/extension";

import { settingsTabs } from "~/components/admin/slots";
import { navItems } from "~/components/app/navigation";
import { classRecordTabs } from "~/components/classes/slots";
import { setupItemWords } from "~/components/home/slots";
import { mailboxWords } from "~/components/messages/slots";
import {
  studentOverviewParts,
  studentRecordTabs,
} from "~/components/people/slots";
import * as m from "~/i18n/messages";
import { attendanceSettingsQuery } from "~/queries/attendance";
import { fill } from "~/utils/extension";
import { modulePages } from "~/utils/pages";

import { AttendanceRules } from "./AttendanceRules";
import { ClassAttendance } from "./ClassAttendance";
import { OUTCOME_LABEL } from "./format";
import { ATTENDANCE_NOTICES, REGISTER_REMINDERS } from "./notices";
import { StudentAttendance } from "./StudentAttendance";
import { StudentAttendanceSummary } from "./StudentSummary";
import { ATTENDANCE_TODAY } from "./today";

/** Attendance's pages and links. */
export const ATTENDANCE: ModuleFillings = {
  module: "attendance",
  fillings: [
    fill(mailboxWords, {
      mailbox: "attendance",
      event: () => null,
      outcomes: OUTCOME_LABEL,
    }),
    ATTENDANCE_NOTICES,
    REGISTER_REMINDERS,
    fill(setupItemWords, {
      item: "first_register",
      label: m.onboardingFirstRegister,
    }),
    ...ATTENDANCE_TODAY,
    fill(studentOverviewParts, {
      key: "attendance",
      place: 20,
      shows: (access) => access.attendance === true,
      Part: ({ studentId, onTab }) => (
        <StudentAttendanceSummary
          studentId={studentId}
          onOpen={() => onTab("attendance")}
        />
      ),
    }),
    fill(studentRecordTabs, {
      value: "attendance",
      label: m.attendanceTitle,
      place: 80,
      shows: (access) => access.attendance === true,
      Tab: StudentAttendance,
    }),
    fill(classRecordTabs, {
      value: "attendance",
      label: m.attendanceTitle,
      place: 40,
      capability: "attendance:read",
      Tab: ClassAttendance,
    }),
    fill(settingsTabs, {
      value: "attendance",
      label: m.attendanceTitle,
      place: 30,
      queries: () => [attendanceSettingsQuery],
      Tab: () => (
        <SettingsPage>
          <AttendanceRules />
        </SettingsPage>
      ),
    }),
    fill(modulePages, [
      "/attendance",
      "/me/attendance",
      "/family/attendance",
      "/registers",
    ]),
    fill(navItems, {
      workspace: "staff",
      section: "teaching",
      item: {
        to: "/attendance",
        label: m.navAttendance,
        icon: UserCheck,
        capability: ["attendance:record", "attendance:manage"],
        place: 60,
      },
    }),
    fill(navItems, {
      workspace: "me",
      section: "home",
      item: {
        to: "/me/attendance",
        label: m.navAttendance,
        icon: UserCheck,
        capability: "attendance:read",
        place: 40,
      },
    }),
    fill(navItems, {
      workspace: "family",
      section: "home",
      item: {
        to: "/family/attendance",
        label: m.navAttendance,
        icon: UserCheck,
        capability: "children:read",
        place: 50,
      },
    }),
  ],
};
