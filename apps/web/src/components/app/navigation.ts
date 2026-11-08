import type { Capability } from "@faridalms/domain/capabilities";
import type { Workspace } from "@faridalms/domain/workspace";
import type { LucideIcon } from "lucide-react";

import {
  Award,
  BookMarked,
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
  HeartPulse,
  House,
  Images,
  Inbox,
  Layers,
  ListTodo,
  ListTree,
  Mail,
  Megaphone,
  Newspaper,
  Receipt,
  School,
  Send,
  Settings,
  ShieldCheck,
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
  /** Hidden unless the person holds this capability, or one of these. */
  capability?: Capability | readonly Capability[];
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
 * One tree per workspace. Staff share one, in which capabilities decide
 * what each person sees: a teacher's day starts from their teaching, an
 * office's from what needs doing, and someone who does both sees both
 * without changing role. A family starts from their children. Only routes
 * that exist appear here.
 */
export const NAVIGATION: Record<Workspace, NavSection[]> = {
  staff: [
    {
      items: [{ to: "/today", label: m.navToday, icon: Sun, exact: true }],
    },
    {
      title: m.navSectionTeaching,
      items: [
        { to: "/classes", label: m.navClasses, icon: School },
        {
          to: "/grading",
          label: m.navToReview,
          icon: ClipboardCheck,
          capability: "submissions:grade",
        },
        {
          to: "/assignments",
          label: m.navCoursework,
          icon: ClipboardList,
          capability: ["assignments:author", "submissions:grade"],
        },
        {
          to: "/gradebook",
          label: m.navGradebook,
          icon: BookOpen,
          capability: "submissions:grade",
        },
        {
          to: "/modules",
          label: m.navModules,
          icon: Layers,
          capability: "learning:author",
        },
        {
          to: "/attendance",
          label: m.navAttendance,
          icon: UserCheck,
          capability: ["attendance:record", "attendance:manage"],
        },
        {
          to: "/timetable",
          label: m.navTimetable,
          icon: Table2,
          capability: ["timetable:read", "timetable:manage"],
        },
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
          capability: ["learning:author", "standards:manage"],
        },
        {
          to: "/library",
          label: m.navLibrary,
          icon: BookMarked,
          capability: ["assignments:author", "library:review"],
        },
      ],
    },
    {
      title: m.navSectionPeople,
      items: [
        {
          to: "/students",
          label: m.navStudents,
          icon: GraduationCap,
          capability: ["people:read", "people:manage"],
        },
        {
          to: "/staff",
          label: m.navStaff,
          icon: Users,
          capability: "staff:manage",
        },
        {
          to: "/health-changes",
          label: m.navHealthChanges,
          icon: HeartPulse,
          capability: "health:write",
        },
      ],
    },
    {
      title: m.navSectionCommunication,
      items: [
        {
          to: "/messages",
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
        {
          to: "/academic-years",
          label: m.navSchoolYear,
          icon: CalendarCheck,
          capability: ["years:manage", "school:manage"],
        },
        {
          to: "/website",
          label: m.navWebsite,
          icon: Globe,
          capability: "site:manage",
        },
        {
          to: "/media",
          label: m.navMediaLibrary,
          icon: Images,
          capability: "site:manage",
        },
        {
          to: "/settings",
          label: m.navSettings,
          icon: Settings,
          capability: "school:manage",
        },
        {
          to: "/billing",
          label: m.navBilling,
          icon: Receipt,
          capability: "billing:read",
        },
        {
          to: "/privacy",
          label: m.navPrivacy,
          icon: ShieldCheck,
          capability: "privacy:manage",
        },
        {
          to: "/notification-audit",
          label: m.navDeliveryLog,
          icon: Send,
          capability: "school:manage",
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

/**
 * The destinations a phone keeps at the bottom, in order of preference; the
 * bar takes the first three the person sees and ends with messages, and
 * everything else is under More.
 */
export const MOBILE_TABS: Record<Workspace, { first: string[]; last: string }> =
  {
    staff: {
      first: ["/today", "/classes", "/grading", "/students"],
      last: "/messages",
    },
    family: {
      first: ["/family", "/family/assignments", "/calendar"],
      last: "/family/messages",
    },
    me: {
      first: ["/me", "/me/assignments", "/calendar"],
      last: "/me/messages",
    },
  };

/** Whether the person holds the item's capability, or any of its capabilities. */
export function holds(
  item: NavItem,
  capabilities: readonly Capability[],
): boolean {
  if (!item.capability) return true;
  return [item.capability]
    .flat()
    .some((capability) => capabilities.includes(capability));
}
