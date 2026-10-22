import type { ContentLocale } from "@faridalms/domain/translations";

import { createContext, useContext, useMemo } from "react";

import * as messages from "~/i18n/messages";

export type Messages = typeof messages;

/** The language a lesson or quiz is read in, where its teacher set one. */
export const CheckLanguage = createContext<ContentLocale | null>(null);

function bound(locale: ContentLocale): Messages {
  return new Proxy(messages, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      return typeof value === "function"
        ? (inputs?: object, options?: object) =>
            (value as (inputs: object, options: object) => string)(
              inputs ?? {},
              { ...options, locale },
            )
        : value;
    },
  });
}

/**
 * A question's own words, its labels, buttons and feedback, in the language
 * the lesson or quiz is read in, so a reader is not switched mid-question
 * and a screen reader speaks every part in one voice. Without a set
 * language they follow the interface.
 */
export function useCheckMessages(): Messages {
  const locale = useContext(CheckLanguage);
  return useMemo(() => (locale ? bound(locale) : messages), [locale]);
}
