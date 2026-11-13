import * as v from "valibot";

import { contrast, mix } from "./site-theme";

const slug = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.maxLength(63),
  v.regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/),
);

export const portalFaceSchema = v.object({ school: slug });

/** What a person types to find their school; codes are short, names longer. */
export const findSchoolsSchema = v.object({
  query: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(80)),
});

/** The most schools one search answers with. */
export const FINDER_LIMIT = 8;
/** Searches shorter than this, once folded, match only a school's exact code. */
export const FINDER_MIN_LENGTH = 2;

/**
 * Text as the finder compares it: lower case, Latin accents and Arabic vowel
 * marks and tatweel dropped, and the Arabic letters people write
 * interchangeably folded together (the alef forms, alef maqsura and yaa, taa
 * marbuta and haa), as the cell's `app.normalize_name` folds names. Arabic
 * digits read as Latin ones, and punctuation as a space.
 */
export function searchKey(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}|ـ/gu, "")
    .replace(/[٠-٩]/g, (digit) =>
      String((digit.codePointAt(0) ?? 0x0660) - 0x0660),
    )
    .replace(/[۰-۹]/g, (digit) =>
      String((digit.codePointAt(0) ?? 0x06f0) - 0x06f0),
    )
    .replace(/[ٱآأإ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export interface FinderSchool {
  slug: string;
  nameEn: string | null;
  nameAr: string | null;
  /** Whether the school asked to be found by name; unlisted ones answer only to their code. */
  listed: boolean;
}

function score(query: string, words: string[], names: string[]) {
  let best = Number.POSITIVE_INFINITY;
  for (const name of names) {
    if (!name) continue;
    const parts = name.split(" ");
    if (name.startsWith(query)) best = Math.min(best, 1);
    else if (words.every((word) => parts.some((part) => part.startsWith(word))))
      best = Math.min(best, 2);
    else if (name.includes(query)) best = Math.min(best, 3);
  }
  return best;
}

/**
 * The schools a search names, best first: the school whose code it is, then
 * those whose name starts with it, then those with a word for each word
 * searched, then those whose name holds it anywhere. A school that is not
 * listed is found only by its exact code, so a school can keep its portal
 * out of the finder without hiding it from those who know where it is.
 */
export function findSchools<T extends FinderSchool>(
  query: string,
  schools: readonly T[],
  limit = FINDER_LIMIT,
): T[] {
  const code = query.trim().toLowerCase();
  const key = searchKey(query);
  const words = key.split(" ").filter(Boolean);
  const ranked: { school: T; rank: number; name: string }[] = [];
  for (const school of schools) {
    const names = [school.nameEn, school.nameAr].map((name) =>
      searchKey(name ?? ""),
    );
    const rank =
      school.slug === code
        ? 0
        : !school.listed || key.length < FINDER_MIN_LENGTH
          ? Number.POSITIVE_INFINITY
          : score(key, words, [...names, school.slug.replaceAll("-", " ")]);
    if (Number.isFinite(rank))
      ranked.push({ school, rank, name: names.find(Boolean) ?? school.slug });
  }
  return ranked
    .toSorted((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((row) => row.school);
}

/** The app's own page colours the school's accent is drawn on, in each scheme. */
const PAGES = {
  light: ["#FFFFFF", "#F6F5F3"],
  dark: ["#161718", "#1B1D1E"],
} as const;

export interface Accent {
  /** Buttons, links, the focus ring and selection. */
  primary: string;
  /** Words on a primary button. */
  primaryForeground: string;
}

function accentOn(
  brand: string,
  pages: readonly string[],
  towards: string,
): Accent {
  const steps = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
  const primary =
    steps
      .map((amount) => mix(brand, towards, amount))
      .find((colour) => pages.every((page) => contrast(colour, page) >= 4.5)) ??
    towards;
  const primaryForeground =
    ["#FFFFFF", "#111111", "#000000"].find(
      (colour) => contrast(colour, primary) >= 4.5,
    ) ??
    (contrast("#000000", primary) >= contrast("#FFFFFF", primary)
      ? "#000000"
      : "#FFFFFF");
  return { primary, primaryForeground };
}

/**
 * The school's brand colour as the portal's accent in light and dark: the
 * colour itself where it reads, otherwise the nearest shade of it that
 * does, so links and buttons meet WCAG AA (4.5:1) on the app's pages in
 * either scheme whatever colour the school chose.
 */
export function portalAccent(brand: string): {
  light: Accent;
  dark: Accent;
} {
  return {
    light: accentOn(brand, PAGES.light, "#000000"),
    dark: accentOn(brand, PAGES.dark, "#FFFFFF"),
  };
}
