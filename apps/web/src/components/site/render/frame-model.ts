import type { SiteLocale, SocialKind } from "@faridalms/domain/website";

export interface FrameLink {
  id: string;
  label: string;
  href: string;
}

export interface FrameMenuEntry extends FrameLink {
  parentId: string | null;
}

export interface FrameAction extends FrameLink {
  style: "primary" | "secondary";
}

/** Everything the frame around a page shows, already in the language shown. */
export interface SiteFrameModel {
  name: string;
  tagline: string;
  logoUrl: string | null;
  banner: { text: string; tone: "info" | "warning" | "danger" } | null;
  utility: FrameLink[];
  actions: FrameAction[];
  menu: FrameMenuEntry[];
  footerColumns: { id: string; title: string; links: FrameLink[] }[];
  footerNote: string;
  dock: boolean;
  socialLinks: { kind: SocialKind; url: string }[];
  /** The other language's address of this page, when the site speaks two. */
  otherLanguage: { locale: SiteLocale; href: string } | null;
  currentHref: string;
  /** The school's portal sign-in, on the portal's own host. */
  signInHref: string;
  /** Where the name and logo lead; the website's home when unset. */
  homeHref?: string;
}

/**
 * The site's menu with its news at the end, unless a link the school put
 * above the menu or beside it already leads there. The website and the
 * builder's canvas both build their menu here, so the two never differ.
 */
export function withNews(
  menu: FrameMenuEntry[],
  links: { href: string }[],
  label: string,
): FrameMenuEntry[] {
  return links.some((link) => link.href === "/news")
    ? menu
    : [...menu, { id: "news", parentId: null, label, href: "/news" }];
}

export const topLevel = (frame: SiteFrameModel) =>
  frame.menu.filter((entry) => !entry.parentId);

export const childrenOf = (frame: SiteFrameModel, entry: FrameMenuEntry) =>
  frame.menu.filter((item) => item.parentId === entry.id);

/** The pages the header lists by name: every top-level page but the home page, which the school's name already leads to. */
export const navEntries = (frame: SiteFrameModel) =>
  topLevel(frame).filter((entry) => entry.href !== "/");

const inMenu = (frame: SiteFrameModel) =>
  new Set(frame.menu.map((entry) => entry.href));

/** The school's own links above the menu that lead somewhere the menu does not. */
export const utilityLinks = (frame: SiteFrameModel) => {
  const listed = inMenu(frame);
  return frame.utility.filter((link) => !listed.has(link.href));
};

/** The filled action, at most one, so a visitor sees one way forward. */
export const primaryAction = (frame: SiteFrameModel) =>
  frame.actions.find((action) => action.style === "primary") ?? null;

/**
 * The actions said in words beside the filled one: the quieter actions and
 * any further filled ones, leaving out any that lead to a page the menu
 * already lists.
 */
export const quietActions = (frame: SiteFrameModel) => {
  const listed = inMenu(frame);
  const primary = primaryAction(frame);
  return frame.actions.filter(
    (action) => action !== primary && !listed.has(action.href),
  );
};

/**
 * From which width the header lists its pages by name, by how much room
 * their names take; below it they open from the menu button. The classes
 * are written out whole so the stylesheet generator finds them.
 */
const NAV_FROM = [
  { upTo: 34, show: "@max-4xl/site:hidden", menu: "@4xl/site:hidden" },
  { upTo: 46, show: "@max-5xl/site:hidden", menu: "@5xl/site:hidden" },
  { upTo: 58, show: "@max-6xl/site:hidden", menu: "@6xl/site:hidden" },
  { upTo: Infinity, show: "@max-7xl/site:hidden", menu: "@7xl/site:hidden" },
] as const;

export function navFits(frame: SiteFrameModel) {
  const entries = navEntries(frame);
  // Each name plus the room around it, in characters.
  const room = entries.reduce((sum, entry) => sum + entry.label.length + 3, 0);
  return NAV_FROM.find((step) => room <= step.upTo) ?? NAV_FROM[3];
}

/** The footer's columns: those the school set, else its menu, a page with pages under it making its own column. */
export function footerColumns(frame: SiteFrameModel, menuTitle: string) {
  if (frame.footerColumns.length) return frame.footerColumns;
  const top = topLevel(frame);
  const parents = top.filter((entry) => childrenOf(frame, entry).length);
  const single = top.filter((entry) => !childrenOf(frame, entry).length);
  return [
    ...(single.length ? [{ id: "menu", title: menuTitle, links: single }] : []),
    ...parents.map((entry) => ({
      id: entry.id,
      title: entry.label,
      links: [entry, ...childrenOf(frame, entry)],
    })),
  ].slice(0, 4);
}
