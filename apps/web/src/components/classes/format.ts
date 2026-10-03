import type { Locale } from "~/i18n/runtime";

import { inLocale } from "~/hooks/useCurrentUser";

import { labelOf } from "../people/format";

export function classTitle(
  row: {
    titleEn: string | null;
    titleAr: string | null;
    code: string;
  },
  locale?: Locale,
) {
  return inLocale(row.titleEn, row.titleAr, locale) || row.code;
}

export function subjectName(
  subjects: readonly {
    id: string;
    code: string;
    labelEn: string | null;
    labelAr: string | null;
  }[],
  id: string | null,
) {
  const found = subjects.find((row) => row.id === id);
  return found ? (labelOf(found) ?? found.code) : "";
}
