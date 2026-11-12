import type { Capability } from "@faridalms/domain/capabilities";
import type { ModuleId } from "@faridalms/domain/modules";
import type { Workspace } from "@faridalms/domain/workspace";
import type { LucideIcon } from "lucide-react";

import { MEDIA_USERS } from "@faridalms/domain/media";
import { TEMPLATE_AUTHORS } from "@faridalms/domain/templates";
import {
  BookMarked,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileUser,
  Globe,
  GraduationCap,
  HeartPulse,
  House,
  Inbox,
  Layers,
  ListTodo,
  ListTree,
  Megaphone,
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
import { pageOn } from "~/utils/modules";

/** One page of an area, listed beneath the area's link while it is open. */
export interface NavPage {
  to: string;
  label: () => string;
  /** The capabilities its page asks for; any one of them opens it. */
  capability: Capability | readonly Capability[];
}

export interface NavItem {
  to: string;
  label: () => string;
  icon: LucideIcon;
  /** Hidden unless the person holds this capability, or one of these. */
  capability?: Capability | readonly Capability[];
  /** Match the route exactly, for section index pages. */
  exact?: boolean;
  /** What waits there, counted beside the label. */
  count?: "messages";
  /**
   * Opened now and then rather than daily, so folded under the section's
   * More for someone who sees many links in it.
   */
  more?: true;
  /** An area of several pages; the link opens the first one held. */
  pages?: readonly NavPage[];
}

export interface NavSection {
  /** Stable across languages: where the section's open More is remembered. */
  id: string;
  title?: () => string;
  items: NavItem[];
}

const ADMISSIONS: readonly Capability[] = [
  "admissions:read",
  "admissions:manage",
  "admissions:configure",
];

/** Whoever writes any kind of template; the Templates page asks the same. */
const TEMPLATE_WRITERS: readonly Capability[] = [
  ...new Set(Object.values(TEMPLATE_AUTHORS).flat()),
];

/**
 * One tree per workspace. Staff share one, in which capabilities decide
 * what each person sees: a teacher's day starts from their teaching, an
 * office's from what needs doing, and someone who does both sees both
 * without changing role. An area of several pages (Admissions, Library) is
 * one link whose pages list beneath it while one of them is open, and what
 * is opened now and then folds under its section's More. A family starts
 * from their children. Only routes that exist appear here.
 */
export const NAVIGATION: Record<Workspace, NavSection[]> = {
  staff: [
    {
      id: "home",
      items: [{ to: "/today", label: m.navToday, icon: Sun, exact: true }],
    },
    {
      id: "teaching",
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
          to: "/standards",
          label: m.navStandards,
          icon: ListTree,
          capability: ["learning:author", "standards:manage"],
          more: true,
        },
      ],
    },
    {
      id: "people",
      title: m.navSectionPeople,
      items: [
        {
          to: "/students",
          label: m.navStudents,
          icon: GraduationCap,
          capability: ["people:read", "people:manage"],
        },
        {
          to: "/admissions",
          label: m.navAdmissions,
          icon: UserPlus,
          capability: ADMISSIONS,
          pages: [
            {
              to: "/admissions/enquiries",
              label: m.navEnquiries,
              capability: ["admissions:read", "admissions:manage"],
            },
            {
              to: "/admissions/applications",
              label: m.navApplications,
              capability: ["admissions:read", "admissions:manage"],
            },
            {
              to: "/admissions/intakes",
              label: m.navIntakes,
              capability: ["admissions:read", "admissions:configure"],
            },
            {
              to: "/admissions/reports",
              label: m.navAdmissionReports,
              capability: ["admissions:read", "admissions:manage"],
            },
            {
              to: "/admissions/letters",
              label: m.navLetters,
              capability: "admissions:configure",
            },
          ],
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
      id: "communication",
      title: m.navSectionCommunication,
      items: [
        {
          to: "/messages",
          label: m.navMessages,
          icon: Inbox,
          count: "messages",
        },
        { to: "/announcements", label: m.navAnnouncements, icon: Megaphone },
        { to: "/calendar", label: m.navCalendar, icon: CalendarDays },
      ],
    },
    {
      id: "school",
      title: m.navSectionSchool,
      items: [
        {
          to: "/templates",
          label: m.navLibrary,
          icon: BookMarked,
          capability: TEMPLATE_WRITERS,
          pages: [
            {
              to: "/templates",
              label: m.navTemplates,
              capability: TEMPLATE_WRITERS,
            },
            { to: "/media", label: m.navMedia, capability: MEDIA_USERS },
          ],
        },
        {
          to: "/settings",
          label: m.navSettings,
          icon: Settings,
          capability: ["school:manage", "grading:manage"],
        },
        {
          to: "/website",
          label: m.navWebsite,
          icon: Globe,
          capability: "site:manage",
          more: true,
        },
        {
          to: "/academic-years",
          label: m.navSchoolYear,
          icon: CalendarCheck,
          capability: ["years:manage", "school:manage"],
          more: true,
        },
        {
          to: "/billing",
          label: m.navBilling,
          icon: Receipt,
          capability: "billing:read",
          more: true,
        },
        {
          to: "/privacy",
          label: m.navPrivacy,
          icon: ShieldCheck,
          capability: "privacy:manage",
          more: true,
        },
        {
          to: "/notification-audit",
          label: m.navDeliveryLog,
          icon: Send,
          capability: "school:manage",
          more: true,
        },
      ],
    },
  ],
  family: [
    {
      id: "home",
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
      id: "communication",
      title: m.navSectionCommunication,
      items: [
        {
          to: "/family/messages",
          label: m.navMessages,
          icon: Inbox,
          count: "messages",
        },
        { to: "/announcements", label: m.navAnnouncements, icon: Megaphone },
        { to: "/calendar", label: m.navCalendar, icon: CalendarDays },
      ],
    },
  ],

  me: [
    {
      id: "home",
      items: [
        {
          to: "/me",
          label: m.navHome,
          icon: House,
          exact: true,
        },
        {
          to: "/me/assignments",
          label: m.navToDo,
          icon: ListTodo,
          capability: "own-work:read",
        },
        {
          to: "/me/grades",
          label: m.navGrades,
          icon: BookOpen,
          capability: "grades:read",
        },
        {
          to: "/me/attendance",
          label: m.navAttendance,
          icon: UserCheck,
          capability: "attendance:read",
        },
        {
          to: "/me/timetable",
          label: m.navTimetable,
          icon: Table2,
          capability: "timetable:read",
        },
        {
          to: "/me/modules",
          label: m.navModules,
          icon: Layers,
          capability: "learning:read",
        },
      ],
    },
    {
      id: "communication",
      title: m.navSectionCommunication,
      items: [
        {
          to: "/me/messages",
          label: m.navMessages,
          icon: Inbox,
          count: "messages",
          capability: "messages:read",
        },
        { to: "/announcements", label: m.navAnnouncements, icon: Megaphone },
        {
          to: "/calendar",
          label: m.navCalendar,
          icon: CalendarDays,
          capability: "calendar:read",
        },
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
      first: ["/today", "/classes", "/grading", "/students", "/admissions"],
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

interface Gated {
  capability?: Capability | readonly Capability[];
}

/** Whether the person holds the item's capability, or any of its capabilities. */
export function holds(
  item: Gated,
  capabilities: readonly Capability[],
): boolean {
  if (!item.capability) return true;
  return [item.capability]
    .flat()
    .some((capability) => capabilities.includes(capability));
}

export interface Viewer {
  capabilities: readonly Capability[];
  modules: Record<ModuleId, boolean>;
}

/** The pages of an area this person may open, at a school that has them. */
export function pagesOf(item: NavItem, viewer: Viewer): NavPage[] {
  return (item.pages ?? []).filter(
    (tab) => holds(tab, viewer.capabilities) && pageOn(viewer.modules, tab.to),
  );
}

/** The paths a link stands for: its own and its pages'. */
export function pathsOf(item: NavItem): string[] {
  return [item.to, ...(item.pages ?? []).map((tab) => tab.to)];
}

/**
 * A section folds once someone sees more than this many links in it. Five
 * keeps a teacher's or an office's sections whole and folds an
 * administrator's, who sees every section at its longest.
 */
const FOLD_ABOVE = 5;

/**
 * What of a section stays in view and what folds under its More, from the
 * links one person sees in it. A More that would hide a single link costs
 * as much as the link, so it is not offered.
 */
export function arrange<T extends { more?: true }>(
  items: T[],
): { items: T[]; more: T[] } {
  const more = items.filter((item) => item.more);
  if (items.length <= FOLD_ABOVE || more.length < 2) return { items, more: [] };
  return { items: items.filter((item) => !item.more), more };
}
/** The first page of a staff area this person may open, where its link lands. */
export function firstPageOf(area: string, viewer: Viewer): string | undefined {
  const item = NAVIGATION.staff
    .flatMap((section) => section.items)
    .find((candidate) => candidate.to === area);
  return item ? pagesOf(item, viewer)[0]?.to : undefined;
}
