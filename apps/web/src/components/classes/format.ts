import type { Locale } from "~/i18n/runtime";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";

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

interface KeptClass {
  id: string;
  code: string;
  titleEn: string | null;
  titleAr: string | null;
  classType: string;
  /** The viewer teaches it, rather than overseeing it. */
  mine: boolean;
}

/**
 * Classes as a picker lists them: the viewer's own first, headed apart from
 * the others only when the viewer both teaches and oversees.
 */
export function classChoices(classes: readonly KeptClass[]) {
  const mixed =
    classes.some((row) => row.mine) && classes.some((row) => !row.mine);
  return classes.map((row) => ({
    value: row.id,
    label: classTitle(row),
    group: mixed
      ? row.mine
        ? m.classesYourGroup()
        : m.classesOtherGroup()
      : undefined,
  }));
}

/** The class a picker starts on: the viewer's own scheduled class, else any of theirs, else the first. */
export function defaultClass<T extends KeptClass>(
  classes: readonly T[],
): T | undefined {
  const own = classes.filter((row) => row.mine);
  const from = own.length > 0 ? own : classes;
  return from.find((row) => row.classType === "scheduled") ?? from[0];
}
