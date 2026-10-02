import type { ContentLocale } from "@faridalms/domain/translations";

import * as m from "~/i18n/messages";

/** A language as its own speakers write it, for switches between languages. */
export const LOCALE_LABEL: Record<ContentLocale, () => string> = {
  en: m.languageOwnEn,
  ar: m.languageOwnAr,
};

/** A language's name within a sentence of the interface language. */
export const LOCALE_NAME: Record<ContentLocale, () => string> = {
  en: m.languageEnglish,
  ar: m.languageArabic,
};
