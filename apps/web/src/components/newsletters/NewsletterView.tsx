import type {
  NewsletterContent,
  NewsletterLocale,
  NewsletterSection,
} from "@faridalms/domain/newsletters";

import { sectionWritten } from "@faridalms/domain/newsletters";

import { ContentView } from "~/components/content/ContentView";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import * as m from "~/i18n/messages";

export const LOCALE_LABEL: Record<NewsletterLocale, () => string> = {
  en: m.nlLangEn,
  ar: m.nlLangAr,
};

/** A language's name within a sentence of the interface language. */
export const LOCALE_NAME: Record<NewsletterLocale, () => string> = {
  en: m.nlNameEn,
  ar: m.nlNameAr,
};

export const otherLocale = (locale: NewsletterLocale): NewsletterLocale =>
  locale === "en" ? "ar" : "en";

export interface ShownSection {
  section: NewsletterSection;
  locale: NewsletterLocale;
}

/**
 * An edition in one language. A section the translation lacks shows in the
 * original language, marked as such, rather than going missing.
 */
export function sectionsIn(
  content: NewsletterContent,
  translation: NewsletterContent | null,
  primary: NewsletterLocale,
  locale: NewsletterLocale,
): ShownSection[] {
  if (locale === primary || !translation)
    return content.sections.map((section) => ({ section, locale: primary }));
  const byId = new Map(
    translation.sections.map((section) => [section.id, section]),
  );
  return content.sections.map((section) => {
    const match = byId.get(section.id);
    return match && sectionWritten(match)
      ? { section: match, locale }
      : { section, locale: primary };
  });
}

const fileUrl = (fileId: string) => `/files/${fileId}`;

export function EditionSections({ sections }: { sections: ShownSection[] }) {
  return (
    <article className="divide-y rounded-lg border bg-card">
      {sections.map(({ section, locale }) => (
        <section
          key={section.id}
          lang={locale}
          dir={locale === "ar" ? "rtl" : "ltr"}
          className="grid min-w-0 gap-3 p-5 sm:p-8"
        >
          {section.heading ? (
            <h2 className="text-lg leading-7 font-semibold text-balance">
              {section.heading}
            </h2>
          ) : null}
          <ContentView document={section.body} fileUrl={fileUrl} />
        </section>
      ))}
    </article>
  );
}

/** An edition to read, with a switch between its languages when it has two. */
export function NewsletterView({
  content,
  translation,
  primary,
  locale,
  onLocaleChange,
}: {
  content: NewsletterContent;
  translation: NewsletterContent | null;
  primary: NewsletterLocale;
  locale: NewsletterLocale;
  onLocaleChange: (locale: NewsletterLocale) => void;
}) {
  if (!translation)
    return (
      <EditionSections sections={sectionsIn(content, null, primary, primary)} />
    );
  const locales = [primary, otherLocale(primary)];
  return (
    <Tabs
      value={locale}
      onValueChange={(value: NewsletterLocale) => onLocaleChange(value)}
      className="grid gap-4"
    >
      <TabsList aria-label={m.nlLanguage()}>
        {locales.map((value) => (
          <TabsTrigger key={value} value={value} lang={value}>
            {LOCALE_LABEL[value]()}
          </TabsTrigger>
        ))}
      </TabsList>
      {locales.map((value) => (
        <TabsContent key={value} value={value}>
          <EditionSections
            sections={sectionsIn(content, translation, primary, value)}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
