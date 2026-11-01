import type { Capability } from "@faridalms/domain/capabilities";
import type { Feature } from "@faridalms/domain/features";
import type { Workspace } from "@faridalms/domain/workspace";
import type { LucideIcon } from "lucide-react";

import {
  Award,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ChartColumn,
  ClipboardCheck,
  ClipboardList,
  FileUser,
  Globe,
  GraduationCap,
  House,
  BookMarked,
  Inbox,
  Layers,
  ListTodo,
  ListTree,
  Mail,
  Megaphone,
  Newspaper,
  School,
  ShieldCheck,
  Send,
  Settings,
  Sun,
  Table2,
  UserCheck,
  UserPlus,
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
  /** Kept for young children, whose home holds everything they open. */
  young?: boolean;
  /** What waits there, counted beside the label. */
  count?: "messages";
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
          to: "/admin/attendance",
          label: m.navAttendance,
          icon: UserCheck,
          capability: "attendance:manage",
        },
        {
          to: "/admin/timetable",
          label: m.navTimetable,
          icon: Table2,
          capability: "timetable:manage",
        },
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
        {
          to: "/admin/messages",
          label: m.navMessages,
          icon: Inbox,
          count: "messages",
        },
        { to: "/announcements", label: m.navAnnouncements, icon: Megaphone },
        { to: "/news", label: m.navNews, icon: Newspaper },
        { to: "/calendar", label: m.navCalendar, icon: CalendarDays },
      ],
    },
    {
      title: m.navSectionAdmissions,
      items: [
        {
          to: "/admissions/enquiries",
          label: m.navEnquiries,
          icon: UserPlus,
          capability: "admissions:read",
        },
        {
          to: "/admissions/applications",
          label: m.navApplications,
          icon: FileUser,
          capability: "admissions:read",
        },
        {
          to: "/admissions/intakes",
          label: m.navIntakes,
          icon: CalendarRange,
          capability: "admissions:configure",
        },
        {
          to: "/admissions/reports",
          label: m.navAdmissionReports,
          icon: ChartColumn,
          capability: "admissions:read",
        },
        {
          to: "/admissions/letters",
          label: m.navLetters,
          icon: Mail,
          capability: "admissions:configure",
        },
      ],
    },
    {
      title: m.navSectionSchool,
      items: [
        { to: "/admin/site", label: m.navWebsite, icon: Globe },
        { to: "/admin/settings", label: m.navSettings, icon: Settings },
        {
          to: "/exams",
          label: m.navExams,
          icon: Award,
          capability: "exams:manage",
        },
        {
          to: "/standards",
          label: m.navStandards,
          icon: ListTree,
          capability: "standards:manage",
        },
        {
          to: "/library",
          label: m.navLibrary,
          icon: BookMarked,
          capability: "library:review",
        },
        {
          to: "/privacy",
          label: m.navPrivacy,
          icon: ShieldCheck,
          capability: "privacy:manage",
        },
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
        { to: "/teach/gradebook", label: m.navGradebook, icon: BookOpen },
        {
          to: "/exams",
          label: m.navExams,
          icon: Award,
          capability: "exams:manage",
        },
        { to: "/teach/attendance", label: m.navAttendance, icon: UserCheck },
        { to: "/teach/timetable", label: m.navTimetable, icon: Table2 },
        {
          to: "/teach/modules",
          label: m.navModules,
          icon: Layers,
          feature: "elearning",
        },
        {
          to: "/standards",
          label: m.navStandards,
          icon: ListTree,
          capability: "learning:author",
        },
        {
          to: "/library",
          label: m.navLibrary,
          icon: BookMarked,
          capability: "assignments:author",
        },
      ],
    },
    {
      title: m.navSectionCommunication,
      items: [
        {
          to: "/teach/messages",
          label: m.navMessages,
          icon: Inbox,
          count: "messages",
        },
        { to: "/announcements", label: m.navAnnouncements, icon: Megaphone },
        { to: "/news", label: m.navNews, icon: Newspaper },
        { to: "/calendar", label: m.navCalendar, icon: CalendarDays },
      ],
    },
    {
      title: m.navSectionAdmissions,
      items: [
        {
          to: "/admissions/enquiries",
          label: m.navEnquiries,
          icon: UserPlus,
          capability: "admissions:read",
        },
        {
          to: "/admissions/applications",
          label: m.navApplications,
          icon: FileUser,
          capability: "admissions:read",
        },
        {
          to: "/admissions/intakes",
          label: m.navIntakes,
          icon: CalendarRange,
          capability: "admissions:configure",
        },
        {
          to: "/admissions/reports",
          label: m.navAdmissionReports,
          icon: ChartColumn,
          capability: "admissions:read",
        },
        {
          to: "/admissions/letters",
          label: m.navLetters,
          icon: Mail,
          capability: "admissions:configure",
        },
      ],
    },
  ],

  family: [
    {
      items: [
        { to: "/family", label: m.navHome, icon: House, exact: true },
        {
          to: "/family/children",
          label: m.navChildren,
          icon: Users,
          capability: "children:read",
        },
        {
          to: "/family/assignments",
          label: m.navCoursework,
          icon: ClipboardList,
          capability: "children:read",
        },
        {
          to: "/family/grades",
          label: m.navGrades,
          icon: BookOpen,
          capability: "children:read",
        },
        {
          to: "/family/attendance",
          label: m.navAttendance,
          icon: UserCheck,
          capability: "children:read",
        },
        {
          to: "/family/timetable",
          label: m.navTimetable,
          icon: Table2,
          capability: "children:read",
        },
        {
          to: "/family/modules",
          label: m.navModules,
          icon: Layers,
          feature: "elearning",
          capability: "children:read",
        },
        {
          to: "/family/consents",
          label: m.navConsents,
          icon: ShieldCheck,
          capability: "children:read",
        },
        {
          to: "/family/applications",
          label: m.navApplications,
          icon: FileUser,
          capability: "applications:submit",
        },
      ],
    },
    {
      title: m.navSectionCommunication,
      items: [
        {
          to: "/family/messages",
          label: m.navMessages,
          icon: Inbox,
          count: "messages",
        },
        { to: "/announcements", label: m.navAnnouncements, icon: Megaphone },
        { to: "/news", label: m.navNews, icon: Newspaper },
        { to: "/calendar", label: m.navCalendar, icon: CalendarDays },
      ],
    },
  ],

  me: [
    {
      items: [
        {
          to: "/me",
          label: m.navHome,
          icon: House,
          exact: true,
          young: true,
        },
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
        {
          to: "/me/messages",
          label: m.navMessages,
          icon: Inbox,
          count: "messages",
        },
        { to: "/announcements", label: m.navAnnouncements, icon: Megaphone },
        { to: "/news", label: m.navNews, icon: Newspaper },
        { to: "/calendar", label: m.navCalendar, icon: CalendarDays },
      ],
    },
  ],
};

/** The four destinations a phone keeps at the bottom; everything else is under More. */
export const MOBILE_TABS: Record<Workspace, string[]> = {
  admin: ["/admin", "/admin/students", "/admin/classes", "/admin/messages"],
  teach: ["/teach", "/teach/classes", "/teach/grading", "/teach/messages"],
  family: ["/family", "/family/assignments", "/calendar", "/family/messages"],
  me: ["/me", "/me/assignments", "/calendar", "/me/messages"],
};
