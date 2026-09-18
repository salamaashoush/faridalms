import type { Permission, Role } from "@faridalms/domain/identity";
import type { LucideIcon } from "lucide-react";

import {
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Mail,
  Newspaper,
  School,
  Settings,
  Table2,
  UserCheck,
  Users,
} from "lucide-react";

import * as m from "~/i18n/messages";

export interface NavItem {
  to: string;
  label: () => string;
  icon: LucideIcon;
  /** Hidden unless the role holds this capability. */
  permission?: Permission;
  /** Match the route exactly, for section index pages. */
  exact?: boolean;
}

export interface NavSection {
  title: () => string;
  items: NavItem[];
}

/**
 * One nav tree per role. Roles get genuinely different information
 * architectures rather than one menu with items greyed out, because an admin
 * and a five-year-old's parent are not doing variations of the same job.
 */
export const NAVIGATION: Record<Role, NavSection[]> = {
  admin: [
    {
      title: m.navSectionSchool,
      items: [
        {
          to: "/admin",
          label: m.navOverview,
          icon: LayoutDashboard,
          exact: true,
        },
        { to: "/admin/students", label: m.navStudents, icon: GraduationCap },
        { to: "/admin/staff", label: m.navStaff, icon: Users },
        { to: "/admin/classes", label: m.navClasses, icon: School },
      ],
    },
    {
      title: m.navSectionCommunication,
      items: [
        { to: "/admin/messages", label: m.navMessages, icon: Mail },
        { to: "/admin/newsletters", label: m.navNewsletters, icon: Newspaper },
        { to: "/admin/calendar", label: m.navCalendar, icon: CalendarDays },
      ],
    },
    {
      title: m.navSectionSettings,
      items: [{ to: "/admin/settings", label: m.navSettings, icon: Settings }],
    },
  ],

  teacher: [
    {
      title: m.navSectionTeaching,
      items: [
        {
          to: "/teach",
          label: m.navOverview,
          icon: LayoutDashboard,
          exact: true,
        },
        { to: "/teach/classes", label: m.navMyClasses, icon: School },
        {
          to: "/teach/assignments",
          label: m.navAssignments,
          icon: ClipboardList,
        },
        { to: "/teach/grading", label: m.navGrading, icon: ClipboardCheck },
        { to: "/teach/attendance", label: m.navAttendance, icon: UserCheck },
      ],
    },
    {
      title: m.navSectionSchool,
      items: [
        { to: "/teach/timetable", label: m.navTimetable, icon: Table2 },
        { to: "/teach/messages", label: m.navMessages, icon: Mail },
        { to: "/teach/calendar", label: m.navCalendar, icon: CalendarDays },
      ],
    },
  ],

  parent: [
    {
      title: m.navSectionFamily,
      items: [
        {
          to: "/family",
          label: m.navOverview,
          icon: LayoutDashboard,
          exact: true,
        },
        { to: "/family/children", label: m.navChildren, icon: GraduationCap },
        {
          to: "/family/assignments",
          label: m.navAssignments,
          icon: ClipboardList,
        },
        { to: "/family/grades", label: m.navGrades, icon: BookOpen },
        { to: "/family/attendance", label: m.navAttendance, icon: UserCheck },
        { to: "/family/timetable", label: m.navTimetable, icon: Table2 },
      ],
    },
    {
      title: m.navSectionSchool,
      items: [
        { to: "/family/messages", label: m.navMessages, icon: Mail },
        { to: "/family/newsletters", label: m.navNewsletters, icon: Newspaper },
        { to: "/family/calendar", label: m.navCalendar, icon: CalendarDays },
      ],
    },
  ],

  student: [
    {
      title: m.navSectionMyWork,
      items: [
        { to: "/me", label: m.navOverview, icon: LayoutDashboard, exact: true },
        { to: "/me/assignments", label: m.navAssignments, icon: ClipboardList },
        { to: "/me/grades", label: m.navGrades, icon: BookOpen },
        { to: "/me/timetable", label: m.navTimetable, icon: Table2 },
        { to: "/me/attendance", label: m.navAttendance, icon: UserCheck },
      ],
    },
    {
      title: m.navSectionSchool,
      items: [
        { to: "/me/messages", label: m.navMessages, icon: Mail },
        { to: "/me/calendar", label: m.navCalendar, icon: CalendarDays },
      ],
    },
  ],
};
