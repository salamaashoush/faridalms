import type { Page } from "@playwright/test";

import { expect } from "@playwright/test";
import { readFileSync } from "node:fs";

import { untilHydrated } from "./sign-in";

/**
 * Words of the modules a school of courses has no use for: school years
 * and terms, grade levels, homerooms, families and guardians, the
 * timetable's periods.
 */
export const ABSENT = {
  en: /\b(years?|terms?|grades?|homerooms?|guardians?|parents?|famil(y|ies)|periods?)\b/gi,
  ar: /(^|[^\p{L}])(العام|عام|السنة|سنة|أعوام|الفصل الدراسي|الفصول الدراسية|الصف|صفوف|فصل التسجيل|فصول التسجيل|ولي الأمر|أولياء|الوالدين|والد|الأسرة|أسرة|الأسر|العائلة|عائلة|الحصة|حصة|الحصص)(?=$|[^\p{L}])/gu,
};

/**
 * The page's words: its navigation, header and main column. The plan's
 * catalogue of modules names every module the product has, on or off, so
 * a school knows what exists; it is left out. An age in years is no school
 * year.
 */
const wordsOf = (page: Page) =>
  page.evaluate(() => {
    const body = document.body.cloneNode(true) as HTMLElement;
    for (const each of body.querySelectorAll("[data-module-catalogue]"))
      each.remove();
    document.body.append(body);
    body.style.position = "absolute";
    const text = body.innerText;
    body.remove();
    return text;
  });

const AGE = /^[·\s]*\d+ (years|سنة|سنوات)$/;

/** The message catalogue of a language, as the app words it. */
export const catalogue = (language: "en" | "ar") =>
  JSON.parse(
    readFileSync(
      new URL(`../../messages/${language}.json`, import.meta.url),
      "utf8",
    ),
  ) as Record<string, string>;

/**
 * Coursework's grade scale is a scale of marks, not a grade level: its
 * label, exactly as the catalogues word it, is no word of grade levels.
 */
const MARKS = new Set(
  (["en", "ar"] as const).map((language) => catalogue(language).gradingScale),
);

/**
 * Arabic lines whose words a module's also are, in another sense: a
 * table's rows and a class are صفوف, the plural a grade level takes, and
 * what is general or public is عام, as a year is. These lines, exactly as
 * the catalogue words them, are no word of those modules.
 */
const OTHER_SENSE = new Set(
  (
    ["indexRowsPerPage", "lrnNoClasses", "calCatGeneral", "siteHint"] as const
  ).map((key) => catalogue("ar")[key]),
);

/** The words of those modules the page shows now, each in the line it stands in. */
export async function shownWords(
  page: Page,
  where: string,
  language: "en" | "ar",
  absent = ABSENT,
) {
  return (await wordsOf(page))
    .split("\n")
    .filter(
      (line) =>
        !AGE.test(line.trim()) &&
        !MARKS.has(line.trim()) &&
        !OTHER_SENSE.has(line.trim()) &&
        line.match(absent[language]),
    )
    .map((line) => `${where}: ${line.trim()}`);
}

/** The words of those modules a page shows, each in the line it stands in. */
export async function absentWords(
  page: Page,
  path: string,
  language: "en" | "ar",
  absent = ABSENT,
) {
  await page.goto(path);
  await untilHydrated(page);
  await expect(page.locator("main")).toBeVisible();
  // Sections that read their data after the page has drawn are part of it.
  await page.waitForLoadState("networkidle");
  return shownWords(page, path, language, absent);
}
