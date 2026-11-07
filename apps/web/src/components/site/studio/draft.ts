import type { SiteChrome, SiteTheme } from "@faridalms/domain/site-theme";
import type {
  PageContent,
  PageSection,
  SiteIssue,
  SiteLocale,
} from "@faridalms/domain/website";

import {
  localizedSections,
  overlay,
  pageIssues,
  sectionComplete,
  sectionWritten,
  wordless,
} from "@faridalms/domain/website";
import { useCallback, useState } from "react";

export interface Languages {
  primary: SiteLocale;
  /** The other language when the site is bilingual. */
  other: SiteLocale | null;
}

export interface PageDraft {
  titleEn: string;
  titleAr: string;
  slug: string;
  parentId: string;
  inMenu: boolean;
  sections: PageSection[];
  /** The other language's words, by section. */
  translated: Record<string, PageSection>;
  reviewed: string[];
  description: string;
  otherDescription: string;
}

export interface SiteDraft {
  theme: SiteTheme;
  chrome: SiteChrome;
}

export interface StudioDraft {
  page: PageDraft;
  site: SiteDraft;
}

/** The other language of a section, always in the section's current shape. */
export const otherOf = (draft: PageDraft, section: PageSection) =>
  overlay(section, draft.translated[section.id] ?? wordless(section));

export function contentOf(draft: PageDraft): {
  content: PageContent;
  translation: PageContent;
} {
  const sections = draft.sections
    .map((section) => otherOf(draft, section))
    .filter(sectionWritten);
  const kept = new Set(sections.map((section) => section.id));
  return {
    content: {
      sections: draft.sections,
      description: draft.description.trim(),
      reviewed: [],
    },
    translation: {
      sections,
      description: draft.otherDescription.trim(),
      reviewed: draft.reviewed.filter((sectionId) => kept.has(sectionId)),
    },
  };
}

export function issuesOf(
  draft: PageDraft,
  languages: Languages,
): { locale: SiteLocale; issue: SiteIssue }[] {
  const { content, translation } = contentOf(draft);
  const locales = languages.other
    ? [languages.primary, languages.other]
    : [languages.primary];
  return locales.flatMap((locale) =>
    pageIssues(
      localizedSections(
        content,
        languages.other ? translation : null,
        languages.primary,
        locale,
      )
        .filter((entry) => entry.locale === locale)
        .map((entry) => entry.section),
    ).map((issue) => ({ locale, issue })),
  );
}

export interface CanvasSection {
  section: PageSection;
  locale: SiteLocale;
  hidden: boolean;
  /** The other language lacks some of this section's words, so visitors read the original. */
  untranslated: boolean;
}

/**
 * The page as the canvas draws it in one language: every section, those
 * hidden in the language dimmed rather than left out, each in the language
 * a visitor would read it in.
 */
export function canvasSections(
  draft: PageDraft,
  languages: Languages,
  locale: SiteLocale,
): CanvasSection[] {
  return draft.sections.map((section) => {
    const hidden = section.style.hideIn.includes(locale);
    if (locale === languages.primary || !languages.other)
      return {
        section,
        locale: languages.primary,
        hidden,
        untranslated: false,
      };
    const other = otherOf(draft, section);
    const complete = sectionWritten(other) && sectionComplete(section, other);
    return complete
      ? { section: other, locale, hidden, untranslated: false }
      : {
          section,
          locale: languages.primary,
          hidden,
          untranslated: sectionWritten(section),
        };
  });
}

interface History<T> {
  past: T[];
  present: T;
  future: T[];
  key: string;
  at: number;
}

const LIMIT = 100;
const COALESCE_MS = 1200;

/**
 * State with undo and redo. Changes that share a key within a moment, such
 * as the keystrokes of one field, undo together.
 */
export function useUndoable<T>(initial: () => T) {
  const [history, setHistory] = useState<History<T>>(() => ({
    past: [],
    present: initial(),
    future: [],
    key: "",
    at: 0,
  }));
  const update = useCallback((change: (value: T) => T, key = "") => {
    setHistory((current) => {
      const next = change(current.present);
      if (Object.is(next, current.present)) return current;
      const now = Date.now();
      const together =
        key !== "" && key === current.key && now - current.at < COALESCE_MS;
      return {
        past: together
          ? current.past
          : [...current.past.slice(-LIMIT), current.present],
        present: next,
        future: [],
        key,
        at: now,
      };
    });
  }, []);
  const undo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past.at(-1);
      if (previous === undefined) return current;
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
        key: "",
        at: 0,
      };
    });
  }, []);
  const redo = useCallback(() => {
    setHistory((current) => {
      const [next, ...rest] = current.future;
      if (next === undefined) return current;
      return {
        past: [...current.past, current.present],
        present: next,
        future: rest,
        key: "",
        at: 0,
      };
    });
  }, []);
  /** Puts a value in place with nothing to undo back to, as when another version is taken in. */
  const reset = useCallback((change: (value: T) => T) => {
    setHistory((current) => ({
      past: [],
      present: change(current.present),
      future: [],
      key: "",
      at: 0,
    }));
  }, []);
  return {
    value: history.present,
    update,
    reset,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}

export const slugOf = (title: string) =>
  title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
