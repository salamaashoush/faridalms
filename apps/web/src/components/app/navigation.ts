import type { Capability } from "@faridalms/domain/capabilities";
import type { Workspace } from "@faridalms/domain/workspace";
import type { LucideIcon } from "lucide-react";

import { MEDIA_USERS } from "@faridalms/domain/media";
import { TEMPLATE_AUTHORS } from "@faridalms/domain/templates";
import {
  BookMarked,
  CalendarDays,
  GraduationCap,
  House,
  IdCard,
  Inbox,
  Megaphone,
  Receipt,
  School,
  Send,
  Settings,
  ShieldCheck,
  Sun,
  Users,
} from "lucide-react";

import * as m from "~/i18n/messages";
import { slot } from "~/utils/extension";

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

/** Whoever writes any kind of template; the Templates page asks the same. */
const TEMPLATE_WRITERS: readonly Capability[] = [
  ...new Set(Object.values(TEMPLATE_AUTHORS).flat()),
];

/** A link with its place in its section, low first, and its rank for a phone's bar. */
export interface PlacedItem extends NavItem {
  place: number;
  /** Where it ranks among the links a phone keeps at the bottom; unranked links stay under More. */
  mobile?: number;
}

export interface PlacedSection {
  id: string;
  title?: () => string;
  items: PlacedItem[];
}

/** A link a module adds to a workspace's section, at its place there. */
export interface ModuleNavItem {
  workspace: Workspace;
  section: string;
  item: PlacedItem;
}

export const navItems = slot<ModuleNavItem>("nav items");

/**
 * Core's links, one tree per workspace; the modules on add theirs at their
 * places. Staff share one, in which capabilities decide what each person
 * sees: a teacher's day starts from their teaching, an office's from what
 * needs doing, and someone who does both sees both without changing role.
 * An area of several pages (Library) is one link whose pages list beneath
 * it while one of them is open, and what is opened now and then folds under
 * its section's More. Only routes that exist appear here.
 */
const CORE_NAVIGATION: Record<Workspace, PlacedSection[]> = {
  staff: [
    {
      id: "home",
      items: [
        {
          to: "/today",
          label: m.navToday,
          icon: Sun,
          exact: true,
          place: 10,
          mobile: 10,
        },
      ],
    },
    {
      id: "teaching",
      title: m.navSectionTeaching,
      items: [
        {
          to: "/classes",
          label: m.navClasses,
          icon: School,
          place: 10,
          mobile: 20,
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
          place: 10,
          mobile: 40,
        },
        {
          to: "/staff",
          label: m.navStaff,
          icon: Users,
          capability: "staff:manage",
          place: 30,
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
          place: 10,
        },
        {
          to: "/announcements",
          label: m.navAnnouncements,
          icon: Megaphone,
          place: 20,
        },
        {
          to: "/calendar",
          label: m.navCalendar,
          icon: CalendarDays,
          place: 30,
        },
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
          place: 10,
        },
        {
          to: "/settings",
          label: m.navSettings,
          icon: Settings,
          capability: ["school:manage", "grading:manage"],
          place: 20,
        },
        {
          to: "/billing",
          label: m.navBilling,
          icon: Receipt,
          capability: "billing:read",
          more: true,
          place: 50,
        },
        {
          to: "/privacy",
          label: m.navPrivacy,
          icon: ShieldCheck,
          capability: "privacy:manage",
          more: true,
          place: 60,
        },
        {
          to: "/notification-audit",
          label: m.navDeliveryLog,
          icon: Send,
          capability: "school:manage",
          more: true,
          place: 70,
        },
      ],
    },
  ],
  family: [
    { id: "home", items: [] },
    {
      id: "communication",
      title: m.navSectionCommunication,
      items: [
        {
          to: "/announcements",
          label: m.navAnnouncements,
          icon: Megaphone,
          place: 20,
        },
        {
          to: "/calendar",
          label: m.navCalendar,
          icon: CalendarDays,
          place: 30,
          mobile: 30,
        },
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
          place: 10,
          mobile: 10,
        },
        {
          to: "/me/details",
          label: m.familyDetails,
          icon: IdCard,
          capability: "own-work:read",
          place: 70,
        },
        {
          to: "/me/consents",
          label: m.navConsents,
          icon: ShieldCheck,
          capability: "own-work:read",
          place: 90,
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
          place: 10,
        },
        {
          to: "/announcements",
          label: m.navAnnouncements,
          icon: Megaphone,
          place: 20,
        },
        {
          to: "/calendar",
          label: m.navCalendar,
          icon: CalendarDays,
          capability: "calendar:read",
          place: 30,
          mobile: 30,
        },
      ],
    },
  ],
};

/** A workspace's sections with core's links and those the modules on add, each in its place. */
export function navigationOf(
  workspace: Workspace,
  added: readonly ModuleNavItem[],
): PlacedSection[] {
  return CORE_NAVIGATION[workspace].map((section) => ({
    ...section,
    items: [
      ...section.items,
      ...added
        .filter(
          (each) => each.workspace === workspace && each.section === section.id,
        )
        .map((each) => each.item),
    ].toSorted((a, b) => a.place - b.place),
  }));
}

/**
 * The links a phone keeps at the bottom: the three best ranked the person
 * sees, then their messages; everything else is under More.
 */
export function mobileTabsOf<T extends { to: string }>(
  placed: readonly PlacedItem[],
  seen: readonly T[],
): T[] {
  const shown = (to: string) => seen.find((item) => item.to === to);
  const ranked = placed
    .filter((item) => item.mobile !== undefined)
    .toSorted((a, b) => (a.mobile ?? 0) - (b.mobile ?? 0))
    .map((item) => shown(item.to))
    .filter((item) => item !== undefined)
    .slice(0, 3);
  const messages = placed.find((item) => item.count === "messages");
  const last = messages ? shown(messages.to) : undefined;
  return last ? [...ranked, last] : ranked;
}

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
  /** Whether the school has a page. */
  opens: (path: string) => boolean;
}

/** The pages of an area this person may open, at a school that has them. */
export function pagesOf(item: NavItem, viewer: Viewer): NavPage[] {
  return (item.pages ?? []).filter(
    (tab) => holds(tab, viewer.capabilities) && viewer.opens(tab.to),
  );
}

/** Whether a link shows for this person: theirs to open, at a school that has it, and an area with a page of theirs. */
export const shows = (item: NavItem, viewer: Viewer) =>
  holds(item, viewer.capabilities) &&
  viewer.opens(item.to) &&
  (!item.pages || pagesOf(item, viewer).length > 0);

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
/** The first page of an area this person may open, where its link lands. */
export function firstPageOf(item: NavItem, viewer: Viewer): string | undefined {
  return pagesOf(item, viewer)[0]?.to;
}
