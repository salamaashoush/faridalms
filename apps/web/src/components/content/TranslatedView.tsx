import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";

import { documentWritten, otherLocale } from "@faridalms/domain/translations";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@faridalms/ui/tabs";

import { ContentView } from "~/components/content/ContentView";
import * as m from "~/i18n/messages";

import { LOCALE_LABEL, LOCALE_NAME } from "./languages";

const fileUrl = (fileId: string) => `/files/${fileId}`;

/** The words a reader sees in a language: its translation once written, else the original. */
export function shownIn(input: {
  body: ContentDocument;
  translation: ContentDocument | null;
  primary: ContentLocale;
  locale: ContentLocale;
}): ContentDocument {
  return input.locale !== input.primary &&
    input.translation &&
    documentWritten(input.translation)
    ? input.translation
    : input.body;
}

interface WrittenInProps {
  body: ContentDocument;
  translation: ContentDocument | null;
  primary: ContentLocale;
  locale: ContentLocale;
}

/**
 * A document in one language. Until the translation is written the original
 * shows in its place, saying so, rather than the reader meeting a blank page.
 */
function WrittenIn({ body, translation, primary, locale }: WrittenInProps) {
  const translated = locale !== primary && documentWritten(translation);
  const shown = translated && translation ? translation : body;
  const shownLocale = translated ? locale : primary;
  return (
    <div className="grid gap-4">
      {locale !== primary && !translated ? (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.translationNotWritten({
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

/** A document to read, with a switch between its languages when it has two. */
export interface TranslatedViewProps {
  body: ContentDocument;
  translation: ContentDocument | null;
  primary: ContentLocale;
  locale: ContentLocale;
  onLocaleChange: (locale: ContentLocale) => void;
}

export function TranslatedView({
  body,
  translation,
  primary,
  locale,
  onLocaleChange,
}: TranslatedViewProps) {
  if (!translation)
    return (
      <WrittenIn
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
      onValueChange={(value: ContentLocale) => onLocaleChange(value)}
      className="grid gap-5"
    >
      <TabsList aria-label={m.contentLanguage()}>
        {locales.map((value) => (
          <TabsTrigger key={value} value={value} lang={value}>
            {LOCALE_LABEL[value]()}
          </TabsTrigger>
        ))}
      </TabsList>
      {locales.map((value) => (
        <TabsContent key={value} value={value}>
          <WrittenIn
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
