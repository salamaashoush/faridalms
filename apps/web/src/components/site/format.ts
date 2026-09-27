import type {
  SectionType,
  SiteIssueCode,
  SiteLocale,
} from "@faridalms/domain/website";
import type { LucideIcon } from "lucide-react";

import {
  MonitorPlay,
  Contact,
  GalleryHorizontalEnd,
  LayoutGrid,
  ListCollapse,
  Megaphone,
  Newspaper,
  PanelTop,
  PictureInPicture2,
  Type,
} from "lucide-react";

import type { Tone } from "~/components/system/status";

import * as m from "~/i18n/messages";

export type ShownState = "draft" | "scheduled" | "published" | "archived";

export const STATE_LABEL: Record<ShownState, () => string> = {
  draft: m.siteStateDraft,
  scheduled: m.siteStateScheduled,
  published: m.siteStatePublished,
  archived: m.siteStateArchived,
};

export const STATE_TONE: Record<ShownState, Tone> = {
  draft: "neutral",
  scheduled: "info",
  published: "success",
  archived: "neutral",
};

export const LOCALE_NAME: Record<SiteLocale, () => string> = {
  en: m.siteLocaleEn,
  ar: m.siteLocaleAr,
};

export const SECTION_LABEL: Record<SectionType, () => string> = {
  hero: m.siteSectionHero,
  text: m.siteSectionText,
  imageText: m.siteSectionImageText,
  cards: m.siteSectionCards,
  action: m.siteSectionAction,
  accordion: m.siteSectionAccordion,
  news: m.siteSectionNews,
  gallery: m.siteSectionGallery,
  contact: m.siteSectionContact,
  embed: m.siteSectionEmbed,
};

export const SECTION_ICON: Record<SectionType, LucideIcon> = {
  hero: PanelTop,
  text: Type,
  imageText: PictureInPicture2,
  cards: LayoutGrid,
  action: Megaphone,
  accordion: ListCollapse,
  news: Newspaper,
  gallery: GalleryHorizontalEnd,
  contact: Contact,
  embed: MonitorPlay,
};

export const ISSUE_LABEL: Record<SiteIssueCode, () => string> = {
  alt: m.siteIssueAlt,
  heading: m.siteIssueHeading,
  link: m.siteIssueLink,
  action: m.siteIssueAction,
};

/** A link a page author wrote: a path inside the site lands under the school's address. */
export function siteHref(school: string, href: string): string {
  return href.startsWith("/") ? `/site/${school}${href}` : href;
}
