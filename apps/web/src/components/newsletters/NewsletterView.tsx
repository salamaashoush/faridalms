import type { ContentDocument } from "@faridalms/domain/content";
import type { NewsletterLocale } from "@faridalms/domain/newsletters";

import { documentWritten } from "@faridalms/domain/newsletters";

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

const fileUrl = (fileId: string) => `/files/${fileId}`;

/**
 * An edition in one language. Until the translation is written the original
 * shows in its place, saying so, rather than the reader meeting a blank page.
 */
function EditionIn({
  body,
  translation,
  primary,
  locale,
}: {
  body: ContentDocument;
  translation: ContentDocument | null;
  primary: NewsletterLocale;
  locale: NewsletterLocale;
}) {
  const translated = locale !== primary && documentWritten(translation);
  const shown = translated && translation ? translation : body;
  const shownLocale = translated ? locale : primary;
  return (
    <div className="grid gap-4">
      {locale !== primary && !translated ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.nlNotTranslated({
            language: LOCALE_NAME[locale](),
            original: LOCALE_NAME[primary](),
          })}
        </p>
      ) : null}
      <div lang={shownLocale}>
        <ContentView document={shown} fileUrl={fileUrl} />
      </div>
    </div>
  );
}

/** An edition to read, with a switch between its languages when it has two. */
export function NewsletterView({
  body,
  translation,
  primary,
  locale,
  onLocaleChange,
}: {
  body: ContentDocument;
  translation: ContentDocument | null;
  primary: NewsletterLocale;
  locale: NewsletterLocale;
  onLocaleChange: (locale: NewsletterLocale) => void;
}) {
  if (!translation)
    return (
      <EditionIn
        body={body}
        translation={null}
        primary={primary}
        locale={primary}
      />
    );
  const locales = [primary, otherLocale(primary)];
  return (
    <Tabs
      value={locale}
      onValueChange={(value: NewsletterLocale) => onLocaleChange(value)}
      className="grid gap-5"
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
          <EditionIn
            body={body}
            translation={translation}
            primary={primary}
            locale={value}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
