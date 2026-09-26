import type { Capability } from "@faridalms/domain/capabilities";
import type { Feature } from "@faridalms/domain/features";
import type { Workspace } from "@faridalms/domain/workspace";
import type { LucideIcon } from "lucide-react";

import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Globe,
  GraduationCap,
  House,
  Inbox,
  Layers,
  ListTodo,
  Megaphone,
  Newspaper,
  School,
  Send,
  Settings,
  Sun,
  Table2,
  UserCheck,
  Users,
} from "lucide-react";

import * as m from "~/i18n/messages";

export interface NavItem {
  to: string;
  label: () => string;
  icon: LucideIcon;
  /** Hidden unless the person holds this capability. */
  capability?: Capability;
  /** Hidden unless the school has switched this area on. */
  feature?: Feature;
  /** Match the route exactly, for section index pages. */
  exact?: boolean;
}

export interface NavSection {
  title?: () => string;
  items: NavItem[];
}

/**
 * One tree per role, following how school platforms organise each job: a
 * teacher starts from today's teaching, a family from their children, an
 * office from what needs doing. Only routes that exist appear here.
 */
export const NAVIGATION: Record<Workspace, NavSection[]> = {
  admin: [
    {
      items: [
        { to: "/admin", label: m.navToday, icon: Sun, exact: true },
        { to: "/admin/students", label: m.navStudents, icon: GraduationCap },
        { to: "/admin/staff", label: m.navStaff, icon: Users },
        { to: "/admin/classes", label: m.navClasses, icon: School },
        {
          to: "/admin/academic-years",
          label: m.navSchoolYear,
          icon: CalendarCheck,
        },
      ],
    },
    {
      title: m.navSectionCommunication,
      items: [
        { to: "/admin/messages", label: m.navMessages, icon: Inbox },
        { to: "/announcements", label: m.navAnnouncements, icon: Megaphone },
        { to: "/admin/newsletters", label: m.navNewsletters, icon: Newspaper },
        { to: "/admin/calendar", label: m.navCalendar, icon: CalendarDays },
      ],
    },
    {
      title: m.navSectionSchool,
      items: [
        { to: "/admin/site", label: m.navWebsite, icon: Globe },
        { to: "/admin/settings", label: m.navSettings, icon: Settings },
        {
          to: "/admin/notification-audit",
          label: m.navDeliveryLog,
          icon: Send,
        },
      ],
    },
  ],

  teach: [
    {
      items: [
        { to: "/teach", label: m.navToday, icon: Sun, exact: true },
        { to: "/teach/classes", label: m.navClasses, icon: School },
        { to: "/teach/grading", label: m.navToReview, icon: ClipboardCheck },
        {
          to: "/teach/assignments",
          label: m.navCoursework,
          icon: ClipboardList,
        },
        { to: "/teach/attendance", label: m.navAttendance, icon: UserCheck },
        { to: "/teach/timetable", label: m.navTimetable, icon: Table2 },
        {
          to: "/teach/modules",
          label: m.navModules,
          icon: Layers,
          feature: "elearning",
        },
      ],
    },
    {
      title: m.navSectionCommunication,
      items: [
        { to: "/teach/messages", label: m.navMessages, icon: Inbox },
        { to: "/announcements", label: m.navAnnouncements, icon: Megaphone },
        { to: "/teach/calendar", label: m.navCalendar, icon: CalendarDays },
      ],
    },
  ],

  family: [
    {
      items: [
        { to: "/family", label: m.navHome, icon: House, exact: true },
        { to: "/family/children", label: m.navChildren, icon: Users },
        {
          to: "/family/assignments",
          label: m.navCoursework,
          icon: ClipboardList,
        },
        { to: "/family/grades", label: m.navGrades, icon: BookOpen },
        { to: "/family/attendance", label: m.navAttendance, icon: UserCheck },
        { to: "/family/timetable", label: m.navTimetable, icon: Table2 },
        {
          to: "/family/modules",
          label: m.navModules,
          icon: Layers,
          feature: "elearning",
        },
      ],
    },
    {
      title: m.navSectionCommunication,
      items: [
        { to: "/family/messages", label: m.navMessages, icon: Inbox },
        { to: "/announcements", label: m.navAnnouncements, icon: Megaphone },
        { to: "/family/newsletters", label: m.navNewsletters, icon: Newspaper },
        { to: "/family/calendar", label: m.navCalendar, icon: CalendarDays },
      ],
    },
  ],

  me: [
    {
      items: [
        { to: "/me", label: m.navHome, icon: House, exact: true },
        { to: "/me/assignments", label: m.navToDo, icon: ListTodo },
        { to: "/me/grades", label: m.navGrades, icon: BookOpen },
        { to: "/me/attendance", label: m.navAttendance, icon: UserCheck },
        { to: "/me/timetable", label: m.navTimetable, icon: Table2 },
        {
          to: "/me/modules",
          label: m.navModules,
          icon: Layers,
          feature: "elearning",
        },
      ],
    },
    {
      title: m.navSectionCommunication,
      items: [
        { to: "/me/messages", label: m.navMessages, icon: Inbox },
        { to: "/announcements", label: m.navAnnouncements, icon: Megaphone },
        { to: "/me/calendar", label: m.navCalendar, icon: CalendarDays },
      ],
    },
  ],
};

/** The four destinations a phone keeps at the bottom; everything else is under More. */
export const MOBILE_TABS: Record<Workspace, string[]> = {
  admin: ["/admin", "/admin/students", "/admin/classes", "/admin/messages"],
  teach: ["/teach", "/teach/classes", "/teach/grading", "/teach/messages"],
  family: [
    "/family",
    "/family/assignments",
    "/family/calendar",
    "/family/messages",
  ],
  me: ["/me", "/me/assignments", "/me/calendar", "/me/messages"],
};
