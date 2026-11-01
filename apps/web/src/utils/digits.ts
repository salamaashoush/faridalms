import type { Digits } from "@faridalms/domain/people";

import { formattingLocale } from "@faridalms/domain/school";

import { getLocale } from "~/i18n/runtime";

/** Where the school's choice of digits travels with each page, as the language does. */
export const DIGITS_COOKIE = "digits";

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";

const fromCookie = (cookie: string): Digits =>
  /(?:^|;\s*)digits=arab(?:;|$)/.test(cookie) ? "arab" : "latn";

// The browser's choice, read from its cookie once and kept until it changes.
let chosen: Digits | null = null;
let source: () => Digits = () => {
  if (typeof document === "undefined") return "latn";
  chosen ??= fromCookie(document.cookie);
  return chosen;
};
let keep: (next: Digits) => void = (next) => {
  chosen = next;
};

/**
 * Where the digits come from while the server draws a page: the request's
 * own, so two schools' pages drawn at once keep their own; and where a
 * page that learns its school's digits as it is drawn keeps them.
 */
export function overwriteDigitsSource(
  read: () => Digits,
  adopt?: (next: Digits) => void,
) {
  source = read;
  if (adopt) keep = adopt;
}

/**
 * Draws the rest of the page in a school's digits without reloading it, as
 * a school's public website does for visitors who carry no school of their
 * own. The server and the browser each adopt them as the page is drawn, so
 * the two drawings agree.
 */
export function adoptDigits(next: Digits) {
  if (digits() !== next) keep(next);
}

export const digitsOfCookie = fromCookie;

/** The digits the reader's school writes numbers in. */
export const digits = (): Digits => source();

/** Keeps the school's digits for the pages that follow; says whether they changed. */
export function rememberDigits(next: Digits): boolean {
  if (typeof document === "undefined" || digits() === next) return false;
  document.cookie = `${DIGITS_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  chosen = next;
  return true;
}

/**
 * The locale to format numbers and dates in: the interface's, with Arabic
 * pinned to the school's digits, as browsers and regions disagree on them.
 */
export function numberLocale(locale: string = getLocale()): string {
  return formattingLocale(locale, digits());
}

/**
 * Arabic interface text with its numbers in Arabic-Indic digits where the
 * school writes them so, with the Arabic decimal and percent signs. Words
 * holding Latin letters or an address (a class code, an email, a link)
 * keep their digits as written.
 */
export function arabicDigits(text: string): string {
  if (digits() !== "arab" || !/[0-9]/.test(text)) return text;
  return text.replace(/\S+/g, (word) =>
    /[A-Za-z@]/.test(word)
      ? word
      : word
          .replace(/(\d)\.(?=\d)/g, "$1٫")
          .replace(/(\d),(?=\d{3})/g, "$1٬")
          .replace(/(\d)%/g, "$1٪")
          .replace(/[0-9]/g, (digit) => ARABIC_INDIC[Number(digit)] ?? digit),
  );
}
