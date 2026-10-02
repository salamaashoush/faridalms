import type { ContentDocument } from "@faridalms/domain/content";
import type { NewsLocale } from "@faridalms/domain/news";

import { documentWritten, otherNewsLocale } from "@faridalms/domain/news";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@faridalms/ui/tabs";

import { ContentView } from "~/components/content/ContentView";
import * as m from "~/i18n/messages";

export const LOCALE_LABEL: Record<NewsLocale, () => string> = {
  en: m.newsLangEn,
  ar: m.newsLangAr,
};

/** A language's name within a sentence of the interface language. */
export const LOCALE_NAME: Record<NewsLocale, () => string> = {
  en: m.newsNameEn,
  ar: m.newsNameAr,
};

const fileUrl = (fileId: string) => `/files/${fileId}`;

/**
 * A post in one language. Until the translation is written the original
 * shows in its place, saying so, rather than the reader meeting a blank page.
 */
function PostIn({
  body,
  translation,
  primary,
  locale,
}: {
  body: ContentDocument;
  translation: ContentDocument | null;
  primary: NewsLocale;
  locale: NewsLocale;
}) {
  const translated = locale !== primary && documentWritten(translation);
  const shown = translated && translation ? translation : body;
  const shownLocale = translated ? locale : primary;
  return (
    <div className="grid gap-4">
      {locale !== primary && !translated ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.newsNotTranslated({
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

/** A post to read, with a switch between its languages when it has two. */
export function NewsView({
  body,
  translation,
  primary,
  locale,
  onLocaleChange,
}: {
  body: ContentDocument;
  translation: ContentDocument | null;
  primary: NewsLocale;
  locale: NewsLocale;
  onLocaleChange: (locale: NewsLocale) => void;
}) {
  if (!translation)
    return (
      <PostIn
        body={body}
        translation={null}
        primary={primary}
        locale={primary}
      />
    );
  const locales = [primary, otherNewsLocale(primary)];
  return (
    <Tabs
      value={locale}
      onValueChange={(value: NewsLocale) => onLocaleChange(value)}
      className="grid gap-5"
    >
      <TabsList aria-label={m.newsLanguage()}>
        {locales.map((value) => (
          <TabsTrigger key={value} value={value} lang={value}>
            {LOCALE_LABEL[value]()}
          </TabsTrigger>
        ))}
      </TabsList>
      {locales.map((value) => (
        <TabsContent key={value} value={value}>
          <PostIn
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
