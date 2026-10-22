import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";

import { languageDirection } from "@faridalms/domain/translations";
import { Tabs, TabsList, TabsTrigger } from "@faridalms/ui/tabs";
import { useState } from "react";

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
 * A brief read in either of its languages, starting in the reader's own
 * when it has a translation in it: its title, its words, the language they
 * are in, and the switch between the two.
 */
export function useBriefLanguage(input: Brief) {
  const { translation, language } = input;
  const [reading, setReading] = useState<ContentLocale | null>(() =>
    translation && getLocale() === translation.locale
      ? translation.locale
      : language,
  );
  const translated = translation !== null && reading === translation.locale;
  const lang = translated ? translation.locale : language;
  return {
    title: translated ? translation.title || input.title : input.title,
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
