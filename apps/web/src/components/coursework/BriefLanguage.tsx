import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";

import { languageDirection } from "@faridalms/domain/translations";
import { Tabs, TabsList, TabsTrigger } from "@faridalms/ui/tabs";
import { createContext, useContext, useState } from "react";

import { LOCALE_LABEL } from "~/components/content/languages";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";

interface Brief {
  title: string;
  brief: ContentDocument | null;
  language: ContentLocale | null;
  translation: {
    locale: ContentLocale;
    title: string;
    content: ContentDocument;
  } | null;
}

/**
 * The language a brief is read in, kept by the page it is on, so the page's
 * trail names the brief in the same words.
 */
export const BriefReading = createContext<{
  read: ContentLocale | undefined;
  onRead: (locale: ContentLocale) => void;
} | null>(null);

/** The language chosen where the brief has it, else the reader's own where translated into it, else its own. */
export function readingOf(
  input: Pick<Brief, "language" | "translation">,
  read: ContentLocale | undefined,
): ContentLocale | null {
  const { translation, language } = input;
  if (read && (read === language || read === translation?.locale)) return read;
  return translation && getLocale() === translation.locale
    ? translation.locale
    : language;
}

/** A brief's title in the language it is read in. */
export const titleRead = (
  input: Pick<Brief, "title" | "translation">,
  reading: ContentLocale | null,
) =>
  input.translation && reading === input.translation.locale
    ? input.translation.title || input.title
    : input.title;

/**
 * A brief read in either of its languages, starting in the reader's own
 * when it has a translation in it: its title, its words, the language they
 * are in, and the switch between the two.
 */
export function useBriefLanguage(input: Brief) {
  const { translation, language } = input;
  const kept = useContext(BriefReading);
  const [own, setOwn] = useState<ContentLocale>();
  const reading = readingOf(input, kept ? kept.read : own);
  const setReading = kept ? kept.onRead : setOwn;
  const translated = translation !== null && reading === translation.locale;
  const lang = translated ? translation.locale : language;
  return {
    title: titleRead(input, reading),
    brief: translated ? translation.content : input.brief,
    lang: lang ?? undefined,
    dir: lang ? languageDirection(lang) : undefined,
    switcher:
      translation && language ? (
        <Tabs
          value={reading ?? language}
          onValueChange={(value: ContentLocale) => setReading(value)}
        >
          <TabsList aria-label={m.contentLanguage()}>
            {[language, translation.locale].map((locale) => (
              <TabsTrigger key={locale} value={locale} lang={locale}>
                {LOCALE_LABEL[locale]()}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null,
  };
}
