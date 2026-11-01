import { getLocale } from "~/i18n/runtime";

export function compareText(a: string, b: string): number {
  return new Intl.Collator(getLocale(), {
    numeric: true,
    sensitivity: "base",
  }).compare(a, b);
}
